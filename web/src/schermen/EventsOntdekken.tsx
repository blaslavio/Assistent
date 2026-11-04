// Evenementen ontdekken, tickets kopen en je eigen tickets met QR bij de ingang.
import { useCallback, useEffect, useRef, useState } from "react";
import { huidigeSessie } from "../api";
import { openVragen } from "../lib/bestellingen";
import { naar } from "../lib/naar";
import { EVENT_TYPES } from "../lib/studio";
import { ticketQR } from "../lib/tickets";
import { euro } from "../lib/winkelen";
import { eventsLijst, mijnTickets, ticketsKopen, vanafPrijs, wanneer, type EventKaart, type MijnTicket } from "../lib/eventpagina";

const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "min-h-11 rounded-full bg-accent px-5 text-sm font-medium text-white disabled:opacity-40";
const foutVan = (e: unknown) => (e instanceof Error ? e.message : "Dat lukte niet.");

/** Houdt een antwoord buiten beeld als intussen een ander account is ingelogd. */
function useSessie() {
  const sessie = useRef(huidigeSessie());
  return useCallback(() => huidigeSessie() === sessie.current, []);
}

export function EventsOntdekken() {
  const [zoek, setZoek] = useState("");
  const [lijst, setLijst] = useState<EventKaart[] | null>(null);
  const [fout, setFout] = useState("");
  const [open, setOpen] = useState<EventKaart | null>(null);
  const [ronde, setRonde] = useState(0);
  const zelfde = useSessie();
  useEffect(() => {
    let oud = false;
    const t = setTimeout(() => {
      eventsLijst(zoek).then((l) => { if (!oud && zelfde()) { setLijst(l); setFout(""); } })
        .catch((e) => { if (!oud && zelfde()) setFout(foutVan(e)); });
    }, zoek ? 300 : 0);
    return () => { oud = true; clearTimeout(t); };
  }, [zoek, ronde, zelfde]);

  if (open) return <EventDetail e={open} terug={() => { setOpen(null); setRonde((n) => n + 1); }} />;
  return (
    <section aria-label="Evenementen ontdekken" className="flex flex-col gap-3 px-6">
      <input type="search" aria-label="Zoek een evenement" value={zoek} maxLength={100} onChange={(e) => setZoek(e.target.value)}
        placeholder="Zoek op naam of plaats" className={veld} />
      {fout && <p role="alert" className="text-sm">{fout} <button className="min-h-11 text-accent" onClick={() => setRonde((n) => n + 1)}>Opnieuw</button></p>}
      {lijst === null && !fout && <p role="status" className="text-sm text-rustig">Evenementen ophalen…</p>}
      {lijst?.length === 0 && <p className="text-sm text-rustig">{zoek ? "Niets gevonden." : "Er staan nu geen evenementen open. Afgelopen evenementen verdwijnen vanzelf."}</p>}
      <ul className="flex flex-col gap-2">
        {lijst?.map((e) => {
          const vanaf = vanafPrijs(e);
          return (
            <li key={e.id}>
              <button onClick={() => setOpen(e)} className="flex w-full flex-col items-start gap-0.5 rounded-2xl bg-vlak px-4 py-3 text-left">
                <span className="text-[15px] font-medium">{e.titel}</span>
                <span className="text-[13px] text-rustig">{wanneer(e.start, e.einde)}</span>
                <span className="text-[13px] text-rustig">
                  {[e.plaats, e.gratis ? "Gratis" : vanaf !== null ? `vanaf ${euro(vanaf)}` : "Uitverkocht"].filter(Boolean).join(" · ")}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function EventDetail({ e, terug }: { e: EventKaart; terug: () => void }) {
  const [soort, setSoort] = useState(e.soorten[0]?.id ?? 0);
  const [aantal, setAantal] = useState(1);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const zelfde = useSessie();
  const gekozen = e.soorten.find((s) => s.id === soort);
  const max = Math.max(1, Math.min(20, gekozen?.vrij ?? 20));
  async function kopen() {
    if (!gekozen || bezig) return;
    setBezig(true); setFout("");
    try {
      await ticketsKopen(gekozen.id, aantal);
      if (!zelfde()) return;
      openVragen(`Betaal je ${aantal === 1 ? "ticket" : `${aantal} tickets`} voor ${e.titel}. Na betalen staan ze bij Mijn tickets.`);
      naar({ tab: "chat" });
    } catch (er) { if (zelfde()) setFout(foutVan(er)); } finally { if (zelfde()) setBezig(false); }
  }
  return (
    <article aria-label={e.titel} className="flex flex-col gap-4 px-6">
      <button onClick={terug} className="min-h-11 self-start text-sm text-accent">Terug naar evenementen</button>
      <header>
        <h2 className="text-xl font-semibold break-words">{e.titel}</h2>
        <p className="mt-1 text-sm text-rustig">{wanneer(e.start, e.einde)}</p>
        {e.plaats && <p className="text-sm text-rustig">{e.plaats}</p>}
        <p className="mt-1 text-xs text-zacht">
          {[EVENT_TYPES.find((t) => t.id === e.event_type)?.naam, e.organisator && `door ${e.organisator}`].filter(Boolean).join(" · ")}
        </p>
      </header>
      {e.omschrijving && <p className="text-[15px] whitespace-pre-line">{e.omschrijving}</p>}
      {e.gratis ? (
        <p className="rounded-2xl bg-vlak p-4 text-sm">Gratis toegang. Vraag je ticket aan via de ticketpagina van de organisator.</p>
      ) : e.soorten.length === 0 ? (
        <p className="rounded-2xl bg-vlak p-4 text-sm">Uitverkocht of de verkoop is gestopt.</p>
      ) : (
        <div className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-medium">Kies je ticket</legend>
            {e.soorten.map((s) => (
              <label key={s.id} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="radio" name="soort" checked={soort === s.id} disabled={s.vrij === 0} onChange={() => { setSoort(s.id); setAantal(1); }} />
                <span className="flex-1">{s.titel}</span>
                <span className="font-medium">{s.vrij === 0 ? "Uitverkocht" : euro(s.prijs)}</span>
              </label>
            ))}
          </fieldset>
          <label className="flex items-center justify-between text-sm">Aantal
            <select value={aantal} onChange={(x) => setAantal(Number(x.target.value))} className="h-11 rounded-xl bg-vlak px-3">
              {Array.from({ length: max }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          {gekozen && <p className="text-sm">Totaal <span className="font-semibold">{euro(gekozen.prijs * aantal)}</span></p>}
          <button disabled={bezig || !gekozen || gekozen.vrij === 0} onClick={kopen} className={knop}>
            {bezig ? "Bezig…" : "Bestellen en betalen"}
          </button>
          <p className="text-xs text-rustig">Je betaalt veilig in de app. Na betalen krijg je per ticket een QR-code voor de ingang.</p>
        </div>
      )}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </article>
  );
}

export function MijnTickets() {
  const [lijst, setLijst] = useState<MijnTicket[] | null>(null);
  const [fout, setFout] = useState("");
  const [ronde, setRonde] = useState(0);
  const zelfde = useSessie();
  useEffect(() => {
    let oud = false;
    mijnTickets().then((l) => { if (!oud && zelfde()) setLijst(l); }).catch((e) => { if (!oud && zelfde()) setFout(foutVan(e)); });
    return () => { oud = true; };
  }, [ronde, zelfde]);
  return (
    <section aria-label="Mijn tickets" className="flex flex-col gap-3 px-6">
      {fout && <p role="alert" className="text-sm">{fout} <button className="min-h-11 text-accent" onClick={() => setRonde((n) => n + 1)}>Opnieuw</button></p>}
      {lijst === null && !fout && <p role="status" className="text-sm text-rustig">Tickets ophalen…</p>}
      {lijst?.length === 0 && <p className="text-sm text-rustig">Je hebt geen tickets voor komende evenementen.</p>}
      {lijst?.map((t, i) => <TicketKaart key={t.id} t={t} nummer={lijst.filter((x, j) => x.evenement === t.evenement && j <= i).length}
        van={lijst.filter((x) => x.evenement === t.evenement).length} />)}
    </section>
  );
}

function TicketKaart({ t, nummer, van }: { t: MijnTicket; nummer: number; van: number }) {
  const [qr, setQr] = useState("");
  const [toon, setToon] = useState(false);
  useEffect(() => {
    if (!toon || t.status !== "geldig") return;
    let oud = false;
    import("qrcode").then((q) => q.toDataURL(ticketQR(t.evenement, t.code), { width: 260, margin: 2, errorCorrectionLevel: "M" }))
      .then((u) => { if (!oud) setQr(u); }).catch(() => {});
    return () => { oud = true; };
  }, [toon, t.evenement, t.code, t.status]);
  return (
    <article className="rounded-2xl border border-lijn p-4">
      <p className="font-medium">{t.titel}{van > 1 && <span className="text-rustig"> · ticket {nummer} van {van}</span>}</p>
      <p className="text-[13px] text-rustig">{wanneer(t.start, t.einde)}{t.plaats ? ` · ${t.plaats}` : ""}</p>
      {t.status === "binnen" ? <p className="mt-2 text-sm text-rustig">Al gebruikt bij de ingang.</p> : (
        <>
          <button onClick={() => setToon((x) => !x)} className="mt-2 min-h-11 text-sm text-accent">{toon ? "QR verbergen" : "QR voor de ingang tonen"}</button>
          {toon && qr && <img src={qr} alt={`QR-ticket ${nummer} voor ${t.titel}`} className="mx-auto mt-2 w-64 max-w-full rounded-xl bg-white" />}
          {toon && <p className="mt-2 text-xs text-rustig">Laat deze code alleen bij de ingang zien. Wie de code heeft, kan het ticket gebruiken.</p>}
        </>
      )}
    </article>
  );
}
