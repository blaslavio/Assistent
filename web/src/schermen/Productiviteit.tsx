/** Eén rustige productiviteitsplek. Alle mutaties vragen een klik en gebruiken de bestaande versieopslag. */
import { useEffect, useMemo, useState } from "react";
import type { Staat } from "../api";
import { bijwerken, huidigeSessie } from "../api";
import { voorJou, type Melding } from "../lib/voorjou";
import { naar } from "../lib/naar";
import {
  inboxTaken, leesRegels, schrijfRegel, REGEL_INFO,
  maakDagplan, legFocusVast, type PlanBlok, type RegelId,
} from "../lib/productiviteit";

type Tab = "inbox" | "planner" | "regels";
const tabs: { id: Tab; naam: string }[] = [
  { id: "inbox", naam: "Inbox" }, { id: "planner", naam: "Dagplanner" },
  { id: "regels", naam: "Automatiseren" },
];
const tijd = (iso: string) => iso.slice(11, 16);

export default function Productiviteit({ staat, vernieuw }: { staat: Staat; vernieuw: () => Promise<void> }) {
  const [tab, setTab] = useState<Tab>("inbox");
  const [nu, setNu] = useState(() => new Date());
  const [extern, setExtern] = useState<Melding[]>([]);
  const [externeFout, setExterneFout] = useState("");
  const [laden, setLaden] = useState(false);
  const [ophalen, setOphalen] = useState(0);
  const [bevestigen, setBevestigen] = useState<PlanBlok | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [succes, setSucces] = useState("");
  const regels = useMemo(() => leesRegels(staat.data), [staat.data]);
  const taken = useMemo(() => inboxTaken(staat.data, nu, regels), [staat.data, nu, regels]);
  const plan = useMemo(() => maakDagplan(staat.data, nu), [staat.data, nu]);

  useEffect(() => {
    let gestopt = false;
    const sessie = huidigeSessie();
    setLaden(true);
    setExtern([]);
    setExterneFout("");
    voorJou(staat.gebruiker).then(meldingen => {
      if (!gestopt && sessie === huidigeSessie()) setExtern(meldingen);
    }).catch(() => {
      if (!gestopt) setExterneFout("Externe signalen konden niet worden opgehaald.");
    }).finally(() => { if (!gestopt) setLaden(false); });
    return () => { gestopt = true; };
  }, [staat.gebruiker.id, ophalen]);

  async function zetRegel(id: RegelId, aan: boolean) {
    if (bezig) return;
    setBezig(true);
    setFout("");
    setSucces("");
    try {
      await bijwerken(g => schrijfRegel(g, id, aan));
      await vernieuw();
      setSucces("Werkregel opgeslagen in je account.");
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan lukte niet.");
    } finally {
      setBezig(false);
    }
  }

  async function vastleggen() {
    if (!bevestigen || bezig) return;
    setBezig(true);
    setFout("");
    setSucces("");
    try {
      const keuze = bevestigen;
      await bijwerken(g => legFocusVast(g, keuze, new Date()));
      setBevestigen(null);
      await vernieuw();
      setNu(new Date());
      setSucces("Focusblok opgeslagen in je agenda.");
    } catch (e) {
      setBevestigen(null);
      setFout(e instanceof Error ? e.message : "Plannen lukte niet.");
      await vernieuw().catch(() => {});
    } finally {
      setBezig(false);
    }
  }

  function openMelding(m: Melding) {
    m.eerst?.();
    naar(m.naar);
  }

  return (
    <section className="flex flex-col gap-4 px-5 pb-10" aria-label="Productiviteit">
      <header className="pt-2">
        <h1 className="text-2xl font-bold">Productiviteit</h1>
        <p className="mt-1 text-sm text-rustig">Taken, aandacht en tijd op één plek. Jij houdt het laatste woord.</p>
      </header>
      <div role="tablist" aria-label="Productiviteit onderdelen" className="grid grid-cols-3 gap-2 rounded-2xl bg-vlak p-1">
        {tabs.map(t => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setBevestigen(null); setFout(""); setSucces(""); }}
            className={"min-h-11 rounded-xl px-1 py-2 text-[13px] font-medium " + (tab === t.id ? "bg-white shadow-sm dark:bg-[#242428]" : "text-rustig")}>
            {t.naam}
          </button>
        ))}
      </div>
      {fout && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">{fout}</p>}
      {succes && <p role="status" className="rounded-xl bg-green-500/10 p-3 text-sm">{succes}</p>}

      {tab === "inbox" && (
        <div role="tabpanel" aria-label="Mijn inbox" className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">Heeft mijn aandacht</h2>
            <button type="button" disabled={laden} onClick={() => { setNu(new Date()); setOphalen(n => n + 1); }}
              className="min-h-10 rounded-full bg-vlak px-4 text-sm disabled:opacity-50">Vernieuwen</button>
          </div>
          <section aria-label="Eigen taken" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rustig">Taken · {taken.length}</h3>
            {taken.map(t => (
              <button key={t.id} type="button" onClick={() => naar({ tab: "agenda" })}
                className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-lijn p-3 text-left">
                <span className="min-w-0">
                  <span className="block font-medium">{t.titel}</span>
                  <span className="block text-xs text-rustig">{t.reden}{t.deadline ? " · " + t.deadline : ""}</span>
                </span>
                <span aria-hidden="true" className="text-accent">›</span>
              </button>
            ))}
            {!taken.length && <p className="rounded-xl bg-vlak p-4 text-sm text-rustig">Geen taken volgens je actieve werkregels.</p>}
          </section>
          <section aria-label="Overige verzoeken" className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-rustig">Overige verzoeken</h3>
            {extern.map(m => (
              <button type="button" key={m.sleutel} onClick={() => openMelding(m)}
                className="min-h-14 rounded-2xl border border-lijn p-3 text-left text-sm">{m.tekst}</button>
            ))}
            {laden && <p role="status" className="text-sm text-rustig">Verzoeken ophalen…</p>}
            {externeFout && <p role="alert" className="text-sm text-rustig">{externeFout}</p>}
            {!extern.length && !laden && !externeFout &&
              <p className="rounded-xl bg-vlak p-4 text-sm text-rustig">Geen extra verzoeken gevonden.</p>}
          </section>
          <p className="text-xs text-rustig">Deze versie toont eigen taken en signalen uit aangesloten huishoud- en bestelstromen. Projectgoedkeuringen en alle externe inboxen zijn nog niet samengevoegd.</p>
        </div>
      )}

      {tab === "planner" && (
        <div role="tabpanel" aria-label="Slimme dagplanner" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-semibold">Focusvoorstellen voor vandaag</h2>
              <p className="text-xs text-rustig">09:00–18:00 · alleen vrije tijd · geen automatische opslag</p>
            </div>
            <button type="button" className="min-h-10 rounded-full bg-vlak px-3 text-sm"
              onClick={() => { setNu(new Date()); setBevestigen(null); }}>Herbereken</button>
          </div>
          {plan.map(p => (
            <div key={p.taakId} className="flex items-center justify-between gap-3 rounded-2xl border border-lijn p-3">
              <span className="min-w-0">
                <span className="block font-medium">{p.titel}</span>
                <span className="block text-sm text-rustig">{tijd(p.van)}–{tijd(p.tot)} · {p.minuten} min</span>
              </span>
              <button type="button" disabled={bezig} onClick={() => setBevestigen(p)}
                className="min-h-10 shrink-0 rounded-full bg-accent px-3 text-sm font-semibold text-white disabled:opacity-50">Plan</button>
            </div>
          ))}
          {!plan.length && <p className="rounded-xl bg-vlak p-4 text-sm text-rustig">Geen passend vrij tijdvak gevonden, of geen urgente open taak. Je agenda blijft ongewijzigd.</p>}
          {bevestigen && (
            <div role="dialog" aria-label="Focusblok bevestigen" className="flex flex-col gap-3 rounded-2xl border border-accent p-4">
              <p className="font-semibold">Inplannen bevestigen?</p>
              <p className="text-sm">{bevestigen.titel} · {tijd(bevestigen.van)}–{tijd(bevestigen.tot)}</p>
              <p className="text-xs text-rustig">De app controleert eerst je actuele agenda en taak. Bij een verandering wordt niets opgeslagen.</p>
              <div className="flex gap-2">
                <button type="button" onClick={() => setBevestigen(null)} disabled={bezig}
                  className="min-h-11 flex-1 rounded-xl bg-vlak text-sm">Annuleren</button>
                <button type="button" onClick={vastleggen} disabled={bezig}
                  className="min-h-11 flex-1 rounded-xl bg-accent text-sm font-semibold text-white disabled:opacity-50">
                  {bezig ? "Controleren…" : "Bevestig"}
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-rustig">De planner gebruikt vaste, controleerbare regels, niet een ongecontroleerd AI-antwoord. Hij maakt geen boekingen of betalingen.</p>
        </div>
      )}

      {tab === "regels" && (
        <div role="tabpanel" aria-label="Werkregels" className="flex flex-col gap-3">
          <h2 className="font-semibold">Automatiseringsregels</h2>
          <p className="text-sm text-rustig">Bepaal welke situaties automatisch als aandachtspunt in je inbox verschijnen. De regels worden veilig in je bestaande accountinstellingen opgeslagen.</p>
          {REGEL_INFO.map(r => (
            <label key={r.id} className="flex min-h-[72px] items-center justify-between gap-3 rounded-2xl border border-lijn p-3">
              <span>
                <span className="block font-medium">{r.naam}</span>
                <span className="block text-xs text-rustig">{r.uitleg}</span>
              </span>
              <input type="checkbox" className="size-5 shrink-0" checked={regels[r.id]} disabled={bezig}
                onChange={e => void zetRegel(r.id, e.target.checked)} />
            </label>
          ))}
          <p className="rounded-xl bg-vlak p-3 text-xs text-rustig">Fase 1: alleen voorstellen en prioritering. Er worden geen berichten verzonden, sociale posts gepubliceerd, betalingen uitgevoerd of gegevens verwijderd. Een uitgebreide trigger-actiebouwer met servercontrole volgt pas na aparte beveiligingstests.</p>
        </div>
      )}
    </section>
  );
}
