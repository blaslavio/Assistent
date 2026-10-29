import { useEffect, useMemo, useState, type FormEvent } from "react";
import { bijwerken, instellingenBijwerken, type Afspraak } from "../api";
import type { Staat, Tab } from "../App";
import { Camera, Envelop, Huis, Kalender, Kruis, Persoon, Plus, Terug, Vinkje } from "../iconen";
import { gekoppeld } from "../lib/mail";
import { KeuzeKaart } from "../keuzekaart";
import { MascotteMetTip, mascotteZeg } from "../mascotte";
import { opVandaag, type Weergave } from "./Algemeen";
import { afhandelen, voorstel } from "../lib/voorstellen";
import { dagTitel, datumTekst, groet, heleDag, hoeLang, moment, nuTekst, uur } from "../lib/tijd";
import { weerNu, type Weer } from "../lib/weer";
import { eerstvolgende, instellingen as feestInstellingen } from "../lib/feestdagen";

const kop = "mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig";

type Props = { staat: Staat; setStaat: (s: Staat) => void; naarInstellingen: () => void; ga?: (t: Tab) => void };

export default function Vandaag({ staat, setStaat, naarInstellingen, ga }: Props) {
  const [nu, setNu] = useState(() => new Date());
  const [weer, setWeer] = useState<Weer | null>(null);
  const [invoer, setInvoer] = useState("");
  const { data, gebruiker } = staat;
  const toon = (k: string) => opVandaag((data.instellingen ?? {}) as Weergave, k);

  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (toon("weer")) weerNu(data.instellingen?.thuisadres ?? "").then(setWeer);
    else setWeer(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.instellingen?.thuisadres, data.instellingen?.voorpagina]);

  const vandaag = datumTekst(nu);
  const afspraken = useMemo(
    () => data.afspraken.filter((a) => a.start.slice(0, 10) === vandaag).sort((a, b) => a.start.localeCompare(b.start)),
    [data.afspraken, vandaag],
  );
  const eind = (a: Afspraak) => (a.einde ? moment(a.einde) : null);
  const straks = afspraken.find((a) => !heleDag(a.start) && (eind(a) ?? moment(a.start)) > nu);
  const rest = afspraken.filter((a) => a !== straks && !(eind(a) && eind(a)! < nu));
  const taken = data.taken
    .filter((t) => !t.klaar)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"))
    .slice(0, 5);

  // De komende dagen: wat er na vandaag aankomt, zodat je vooruit kunt kijken zonder de agenda te openen.
  const komend = useMemo(() => {
    const tot = datumTekst(new Date(nu.getTime() + 7 * 864e5));
    return data.afspraken.filter((a) => a.start.slice(0, 10) > vandaag && a.start.slice(0, 10) <= tot)
      .sort((a, b) => a.start.localeCompare(b.start)).slice(0, 4);
  }, [data.afspraken, vandaag, nu]);
  // De eerstvolgende feestdag, vakantie of brugdag in de komende drie weken.
  const feest = useMemo(() => eerstvolgende(feestInstellingen(data), new Date(`${vandaag}T12:00`)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [vandaag, data.instellingen?.feestdagen]);
  const [vrijGevraagd, setVrijGevraagd] = useState(false);
  async function vrijVragen(datum: string) {
    setVrijGevraagd(true);
    const d = new Date(`${datum}T12:00`);
    const deadline = datumTekst(new Date(d.getTime() - 14 * 864e5));
    setStaat({ ...staat, data: await bijwerken((g) => {
      g.taken.push({ id: g.volgend_id++, titel: `Vrij vragen voor ${d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}`,
        deadline: deadline > vandaag ? deadline : vandaag, klaar: false });
    }) });
    mascotteZeg("Op je takenlijst. Lekker lang weekend!");
  }

  const v = useMemo(() => voorstel(data, nu), [data, nu]);
  const [gekozen, setGekozen] = useState<{ sleutel: string; optie: number } | null>(null);

  async function kiesVoorstel(optie: number) {
    if (!v || gekozen) return;
    setGekozen({ sleutel: v.sleutel, optie });
    try {
      setStaat({ ...staat, data: await bijwerken((g) => afhandelen(g, v, optie)) });
    } finally {
      setGekozen(null);
    }
  }

  async function afvinken(id: number) {
    const over = data.taken.filter((t) => !t.klaar && t.id !== id).length;
    mascotteZeg(over === 0 ? "Alles afgevinkt. Daar mag je trots op zijn!" : over === 1 ? "Afgevinkt! Nog maar één te gaan."
      : `Afgevinkt! Nog ${over} te gaan.`);
    setStaat({ ...staat, data: { ...data, taken: data.taken.map((t) => (t.id === id ? { ...t, klaar: true } : t)) } });
    const nieuw = await bijwerken((g) => {
      const taak = g.taken.find((t) => t.id === id);
      if (taak) taak.klaar = true;
      // Ingeplande focusblokken voor deze taak die nog moeten komen, zijn niet meer nodig.
      const nu = nuTekst();
      g.afspraken = g.afspraken.filter((a) => (a as { taak_id?: number }).taak_id !== id || a.start < nu);
    });
    setStaat({ ...staat, data: nieuw });
  }

  async function toevoegen(e: FormEvent) {
    e.preventDefault();
    const titel = invoer.trim();
    if (!titel) return;
    setInvoer("");
    mascotteZeg(/\b(morgen|maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|\d{1,2}[:.u])/i.test(titel)
      ? "Staat erop. Wil je het met een tijd in je agenda? Vraag het de assistent." : "Staat op je lijst.");
    const nieuw = await bijwerken((g) => {
      g.taken.push({ id: g.volgend_id, titel, deadline: null, klaar: false });
      g.volgend_id += 1;
    });
    setStaat({ ...staat, data: nieuw });
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex items-end justify-between px-6 pt-14 pb-2">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-rustig">
            {dagTitel(nu)}{weer ? ` · ${weer.graden}° ${weer.tekst.toLowerCase()}` : ""}
          </p>
          <h1 className="text-[32px] font-bold tracking-tight">{groet(nu)}</h1>
        </div>
        <button onClick={naarInstellingen} aria-label="Instellingen"
          className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-vlak text-rustig">
          {gebruiker.foto ? <img src={gebruiker.foto} alt="" className="size-full object-cover" /> : <Persoon className="size-5" />}
        </button>
      </header>

      <main className="flex flex-1 flex-col gap-7 px-6 py-4">
        {toon("mascotte") && <MascotteMetTip />}
        <AanDeSlag staat={staat} setStaat={setStaat} naarInstellingen={naarInstellingen} ga={ga} />
        {v && (
          <KeuzeKaart keuze={v} open={!gekozen} kies={kiesVoorstel} compact
            gekozen={gekozen?.sleutel === v.sleutel ? gekozen.optie : undefined} />
        )}
        {toon("afspraken") && straks && (
          <section>
            <h2 className={kop}>Straks</h2>
            <div className="flex flex-col gap-1.5 rounded-[20px] bg-accent p-5 text-white">
              <p className="text-[13px] opacity-85">{hoeLang(moment(straks.start), eind(straks), nu) || uur(straks.start)}</p>
              <p className="text-xl font-semibold">{straks.titel}</p>
              <p className="text-sm opacity-85">
                {uur(straks.start)}{straks.einde ? ` – ${uur(straks.einde)}` : ""}{straks.locatie ? ` · ${straks.locatie}` : ""}
              </p>
            </div>
          </section>
        )}

        {toon("afspraken") && rest.length > 0 && (
          <section>
            <h2 className={kop}>Vandaag</h2>
            <ul>
              {rest.map((a) => (
                <li key={a.id} className="flex items-baseline gap-4 py-2.5">
                  <span className="w-12 shrink-0 text-sm text-rustig">{heleDag(a.start) ? "Hele dag" : uur(a.start)}</span>
                  <span>{a.titel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {toon("afspraken") && !straks && rest.length === 0 && <p className="text-rustig">Niets meer in je agenda vandaag.</p>}

        {toon("afspraken") && (komend.length > 0 || feest) && (
          <section>
            <h2 className={kop}>Komende dagen</h2>
            {feest && (
              <div className="mb-1 flex items-center gap-3 py-2">
                <span className="w-20 shrink-0 text-sm text-rustig">{feest.over === 1 ? "Morgen" : `Over ${feest.over} dagen`}</span>
                <span className="min-w-0 flex-1 leading-snug">
                  <span className={`mr-2 inline-block size-2 rounded-full ${feest.soort === "feestdag" ? "bg-red-500"
                    : feest.soort === "vakantie" ? "bg-amber-500" : feest.soort === "brugdag" ? "bg-emerald-500" : "bg-pink-500"}`} />
                  {feest.naam}
                </span>
                {feest.soort === "brugdag" && !vrijGevraagd && (
                  <button onClick={() => vrijVragen(feest.datum)} className="h-8 shrink-0 rounded-full bg-vlak px-3 text-sm font-medium text-accent">
                    Vrij vragen
                  </button>
                )}
              </div>
            )}
            <ul>
              {komend.map((a) => (
                <li key={a.id} className="flex items-baseline gap-4 py-2">
                  <span className="w-20 shrink-0 text-sm text-rustig">{new Date(a.start.slice(0, 10) + "T12:00")
                    .toLocaleDateString("nl-NL", { weekday: "short", day: "numeric" })}{heleDag(a.start) ? "" : ` ${uur(a.start)}`}</span>
                  <span className="min-w-0 truncate">{a.titel}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {toon("taken") && <section>
          <h2 className={kop}>Taken</h2>
          {taken.length === 0 ? (
            <p className="text-rustig">Geen open taken.</p>
          ) : (
            <ul>
              {taken.map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-3.5 py-2.5">
                    <input type="checkbox" className="size-[22px] accent-accent" onChange={() => afvinken(t.id)} />
                    <span>{t.titel}</span>
                    {t.deadline && t.deadline.slice(0, 10) < vandaag && <span className="text-sm text-red-600 dark:text-red-400">te laat</span>}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>}
      </main>

      {toon("taken") && <form onSubmit={toevoegen} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
        <label className="flex h-13 items-center gap-2.5 rounded-full bg-vlak pr-2 pl-5">
          <span className="sr-only">Nieuwe taak</span>
          <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="Nieuwe taak"
            className="flex-1 bg-transparent outline-none placeholder:text-zacht" />
          <button aria-label="Toevoegen" disabled={!invoer.trim()}
            className="flex size-10 items-center justify-center rounded-full bg-inkt text-white disabled:opacity-30 dark:text-black">
            <Plus className="size-5" />
          </button>
        </label>
      </form>}
    </div>
  );
}

/** Vier eerste stappen voor een nieuw account. Verdwijnt vanzelf als alles klaar is, of als je hem wegtikt. */
function AanDeSlag({ staat, setStaat, naarInstellingen, ga }: Omit<Props, "ga"> & { ga?: (t: Tab) => void }) {
  const { data, gebruiker } = staat;
  const inst = (data.instellingen ?? {}) as Record<string, unknown>;
  if (inst.aan_de_slag === "weg") return null;
  const stappen = [
    { klaar: Boolean(gebruiker.heeft_foto), icoon: Camera, titel: "Zet een foto bij je profiel", uitleg: "Zo herkennen mensen je in de chat", doe: naarInstellingen },
    { klaar: Boolean(inst.thuisadres), icoon: Huis, titel: "Vul je woonplaats in", uitleg: "Voor het weer hier en reistijden in je agenda", doe: naarInstellingen },
    { klaar: data.afspraken.length > 0, icoon: Kalender, titel: "Zet je eerste afspraak erin", uitleg: "Dan weet Vandaag wat er straks komt", doe: () => ga?.("agenda") },
    { klaar: gekoppeld(data), icoon: Envelop, titel: "Koppel je mail", uitleg: "De assistent haalt er taken en afspraken uit", doe: naarInstellingen },
  ];
  const gedaan = stappen.filter((x) => x.klaar).length;
  if (gedaan === stappen.length) return null;
  async function weg() {
    try { setStaat({ ...staat, data: await instellingenBijwerken((i) => { i.aan_de_slag = "weg"; }) as typeof data }); } catch { /* later opnieuw */ }
  }
  return (
    <section className="rounded-[20px] bg-vlak p-4">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex flex-1 flex-col">
          <h2 className="font-semibold">Maak de app van jou</h2>
          <p className="text-sm text-rustig">{gedaan} van {stappen.length} gedaan</p>
        </div>
        <button onClick={weg} aria-label="Verbergen" className="flex size-9 items-center justify-center rounded-full text-rustig">
          <Kruis className="size-4" /></button>
      </div>
      <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-lijn">
        <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(gedaan / stappen.length) * 100}%` }} />
      </div>
      <ul className="flex flex-col">
        {stappen.map(({ klaar, icoon: Icoon, titel, uitleg, doe }) => (
          <li key={titel}>
            <button onClick={doe} disabled={klaar} className="flex w-full items-center gap-3 py-2.5 text-left disabled:opacity-50">
              <span className={`flex size-9 shrink-0 items-center justify-center rounded-full ${klaar ? "bg-accent text-white" : "bg-white text-accent dark:bg-[#2a2a31]"}`}>
                {klaar ? <Vinkje className="size-4" /> : <Icoon className="size-4" />}</span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className={`font-medium ${klaar ? "line-through" : ""}`}>{titel}</span>
                <span className="truncate text-[13px] text-rustig">{uitleg}</span>
              </span>
              {!klaar && <Terug className="size-4 rotate-180 text-zacht" />}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
