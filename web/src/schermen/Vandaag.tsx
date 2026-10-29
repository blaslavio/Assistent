import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { bijwerken, instellingenBijwerken, type Afspraak } from "../api";
import type { Staat, Tab } from "../App";
import { dagenVan } from "../lib/club";
import { Camera, Envelop, Huis, Kalender, Kruis, Persoon, Plus, Terug, Vinkje } from "../iconen";
import { gekoppeld } from "../lib/mail";
import { KeuzeKaart } from "../keuzekaart";
import { MascotteMetTip, mascotteZeg } from "../mascotte";
import { opVandaag, type Weergave } from "./Algemeen";
import { afhandelen, voorstel, type Voorstel } from "../lib/voorstellen";
import { dagTitel, datumTekst, groet, heleDag, hoeLang, moment, uur } from "../lib/tijd";
import { weerNu, type Weer } from "../lib/weer";
import { gelijk, taakVoorstel, taakUitvoeren, taakResultaat, type DagActie } from "../lib/dagacties";
import { eerstvolgende, instellingen as feestInstellingen } from "../lib/feestdagen";

const kop = "mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig";

type Props = { staat: Staat; setStaat: (s: Staat) => void; naarInstellingen: () => void; naarAssistent?: () => void;
  vernieuw?: () => Promise<void>; ga?: (t: Tab) => void; naarProject?: (gesprek: number) => void };

export default function Vandaag({ staat, setStaat, naarInstellingen, naarAssistent, vernieuw, ga, naarProject }: Props) {
  const [nu, setNu] = useState(() => new Date());
  const [weer, setWeer] = useState<Weer | null>(null);
  const [alleTaken, setAlleTaken] = useState(false);
  const [invoer, setInvoer] = useState("");
  const [actie, setActie] = useState<DagActie | null>(null);
  const [voorstelKeuze, setVoorstelKeuze] = useState<{ voorstel: Voorstel; optie: number; basis: unknown } | null>(null);
  const [bezig, setBezig] = useState(false);
  const [onzeker, setOnzeker] = useState(false);
  const [fout, setFout] = useState("");
  const [resultaat, setResultaat] = useState("");
  const slot = useRef(false);
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
    () => data.afspraken.filter((a) => dagenVan(a, vandaag).includes(vandaag)).sort((a, b) => a.start.localeCompare(b.start)),
    [data.afspraken, vandaag],
  );
  const eind = (a: Afspraak) => (a.einde ? moment(a.einde) : null);
  const straks = afspraken.find((a) => !heleDag(a.start) && (eind(a) ?? moment(a.start)) > nu);
  const rest = afspraken.filter((a) => a !== straks && !(eind(a) && eind(a)! < nu));
  const taken = data.taken
    .filter((t) => !t.klaar)
    .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999"));

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

  function kiesVoorstel(optie: number) {
    if (!v || gekozen || actie || voorstelKeuze || slot.current) return;
    setVoorstelKeuze({ voorstel: v, optie, basis: structuredClone({ taken: data.taken, afspraken: data.afspraken }) });
    setFout(""); setResultaat(""); setOnzeker(false);
  }

  async function bevestigVoorstel() {
    const k = voorstelKeuze;
    if (!k || slot.current) return;
    slot.current = true;
    setFout("");
    setOnzeker(true); setBezig(true);
    setGekozen({ sleutel: k.voorstel.sleutel, optie: k.optie });
    try {
      setStaat({ ...staat, data: await bijwerken((g) => {
        if ((g.instellingen?.voorstellen_gezien as string[] | undefined)?.includes(k.voorstel.sleutel)) return;
        const actueel = voorstel(g);
        if (!gelijk(k.basis, { taken: g.taken, afspraken: g.afspraken }) || !actueel || actueel.sleutel !== k.voorstel.sleutel
          || actueel.opties[k.optie]?.label !== k.voorstel.opties[k.optie]?.label) {
          throw new Error("Dit voorstel is niet meer actueel. Vernieuw en controleer opnieuw.");
        }
        afhandelen(g, k.voorstel, k.optie);
      }) });
      setResultaat("Je keuze is opgeslagen.");
      setVoorstelKeuze(null); setOnzeker(false);
    } catch (e) {
      setFout((e instanceof Error ? e.message + " " : "") + "Je keuze is nog niet bevestigd. Vernieuw het overzicht voordat je opnieuw kiest.");
    } finally {
      slot.current = false;
      setBezig(false);
      setGekozen(null);
    }
  }

  function afvinken(id: number) {
    if (actie || voorstelKeuze || slot.current) return;
    const taak = data.taken.find(t => t.id === id);
    if (taak) setActie({ soort: "afronden", taak: structuredClone(taak) });
    setFout("");
    setResultaat("");
  }

  function toevoegen(e: FormEvent) {
    e.preventDefault();
    if (actie || voorstelKeuze || slot.current) return;
    try {
      setActie(taakVoorstel(invoer, data.taken));
      setFout("");
      setResultaat("");
    } catch (e) { setFout(e instanceof Error ? e.message : "Controleer de taaktekst."); }
  }

  async function bevestigen() {
    if (!actie || slot.current) return;
    slot.current = true;
    setBezig(true);
    setFout("");
    setOnzeker(true);
    try {
      const nieuw = await bijwerken(g => taakUitvoeren(g, actie));
      const taak = taakResultaat(nieuw, actie);
      setStaat({ ...staat, data: nieuw });
      setResultaat(`${actie.soort === "toevoegen" ? "Taak toegevoegd" : "Taak afgerond"}: ${taak.titel}`);
      if (actie.soort === "afronden") {
        const over = nieuw.taken.filter(t => !t.klaar).length;
        mascotteZeg(over === 0 ? "Alles afgevinkt. Daar mag je trots op zijn!" : `Afgevinkt! Nog ${over} te gaan.`);
      } else mascotteZeg("Staat op je lijst.");
      if (actie.soort === "toevoegen") setInvoer("");
      setActie(null);
      setOnzeker(false);
    } catch (e) {
      setFout((e instanceof Error ? e.message + " " : "") + "Opslag is nog niet bevestigd. Dezelfde opdracht blijft klaarstaan.");
    } finally { slot.current = false; setBezig(false); }
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
        {fout && <div role="alert" className="rounded-2xl border border-lijn p-4">
          <p>{fout}</p>
          {vernieuw && <button disabled={bezig} onClick={async () => {
            try { await vernieuw(); setFout(""); } catch { setFout("Vernieuwen lukte niet. Je invoer blijft behouden."); }
          }} className="mt-3 min-h-11 font-medium text-accent">Vernieuw overzicht</button>}
        </div>}
        {voorstelKeuze && <section aria-label="Controleer je keuze" className="rounded-[20px] border border-lijn p-5">
          <h2 className="font-semibold">Controleer je keuze</h2>
          <p className="mt-2">{voorstelKeuze.voorstel.vraag}</p>
          <p className="mt-2 font-medium">{voorstelKeuze.voorstel.opties[voorstelKeuze.optie].label}</p>
          <p className="mt-1 text-sm text-rustig">{voorstelKeuze.voorstel.opties[voorstelKeuze.optie].gevolg}</p>
          {onzeker && <p className="mt-2 text-sm">De eerdere poging kan al zijn verwerkt. Opnieuw proberen controleert dezelfde keuze.</p>}
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={bezig} onClick={bevestigVoorstel} className="min-h-11 rounded-full bg-accent px-5 text-white disabled:opacity-50">{bezig ? "Opslaan…" : onzeker ? "Dezelfde keuze opnieuw controleren" : "Bevestigen"}</button>
            <button disabled={bezig} onClick={() => { setVoorstelKeuze(null); setOnzeker(false); setFout(""); }} className="min-h-11 px-3">{onzeker ? "Sluiten zonder terugdraaien" : "Annuleren"}</button>
          </div>
        </section>}
        {actie && <section aria-label="Controleer je taakopdracht" className="rounded-[20px] border border-lijn p-5">
          <h2 className="font-semibold">{actie.soort === "toevoegen" ? "Nieuwe taak controleren" : "Taak afronden?"}</h2>
          <p className="mt-2 break-words">{actie.soort === "toevoegen" ? actie.titel : actie.taak.titel}</p>
          <p className="mt-2 text-sm text-rustig">{onzeker ? "Een eerdere poging kan al zijn verwerkt. Opnieuw proberen gebruikt dezelfde opdracht."
            : actie.soort === "afronden" ? "Deze taak wordt als klaar gemarkeerd. Je afspraken blijven staan." : "Pas na bevestigen wordt deze taak opgeslagen."}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button disabled={bezig} onClick={bevestigen} className="min-h-11 rounded-full bg-accent px-5 text-white disabled:opacity-50">
              {bezig ? "Opslaan…" : onzeker ? "Dezelfde opdracht opnieuw proberen" : "Bevestigen"}
            </button>
            <button disabled={bezig} onClick={() => { setActie(null); setOnzeker(false); setFout(""); }} className="min-h-11 px-3">
              {onzeker ? "Sluiten zonder terugdraaien" : "Annuleren"}
            </button>
          </div>
        </section>}
        {resultaat && <section role="status" className="rounded-[20px] bg-vlak p-5">
          <h2 className="font-semibold">Opgeslagen</h2><p className="mt-1 break-words">{resultaat}</p>
          {naarAssistent && <button onClick={naarAssistent} className="mt-3 min-h-11 font-medium text-accent">Bespreek je volgende stap met de assistent</button>}
        </section>}
        {toon("mascotte") && <MascotteMetTip />}
        <AanDeSlag staat={staat} setStaat={setStaat} naarInstellingen={naarInstellingen} ga={ga} />
        {v && (
          <KeuzeKaart keuze={v} open={!gekozen && !actie && !voorstelKeuze} kies={kiesVoorstel} compact
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
              {(alleTaken ? taken : taken.slice(0, 3)).map((t) => (
                <li key={t.id}>
                  <label className="flex items-center gap-3.5 py-2.5">
                    <input type="checkbox" checked={false} disabled={!!actie || !!voorstelKeuze || bezig || !!gekozen} className="size-[22px] accent-accent" onChange={() => afvinken(t.id)} />
                    <span className="min-w-0 flex-1 break-words">{t.titel}</span>
                    {t.deadline && t.deadline.slice(0, 10) < vandaag && <span className="text-sm text-red-600 dark:text-red-400">te laat</span>}
                  </label>
                  <ProjectHerkomst taak={t} open={naarProject} />
                </li>
              ))}
            </ul>
          )}
          {taken.length > 3 && <button className="min-h-11 text-accent" aria-expanded={alleTaken} onClick={() => setAlleTaken(!alleTaken)}>{alleTaken ? "Toon mijn drie eerstvolgende taken" : `Bekijk alle ${taken.length} taken`}</button>}
        </section>}
      </main>

      {toon("taken") && <form onSubmit={toevoegen} className="sticky bottom-0 bg-white px-4 pb-3 pt-2 dark:bg-[#0b0b0e]">
        <label className="flex h-13 items-center gap-2.5 rounded-full bg-vlak pr-2 pl-5">
          <span className="sr-only">Nieuwe taak</span>
          <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder="Nieuwe taak" maxLength={160} disabled={!!actie || !!voorstelKeuze || bezig || !!gekozen}
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
          <button aria-label="Taak voorbereiden" disabled={!invoer.trim() || !!actie || !!voorstelKeuze || bezig || !!gekozen}
            className="flex size-10 items-center justify-center rounded-full bg-inkt text-white disabled:opacity-30 dark:text-black">
            <Plus className="size-5" />
          </button>
        </label>
      </form>}
    </div>
  );
}

function ProjectHerkomst({ taak, open }: { taak: object; open?: (gesprek: number) => void }) {
  const bron = (taak as { projectbron?: { gesprek: number; bericht: number } }).projectbron;
  if (!open || !bron || !Number.isSafeInteger(bron.gesprek) || bron.gesprek < 1 || !Number.isSafeInteger(bron.bericht) || bron.bericht < 1) return null;
  return <button className="ml-9 min-h-11 text-sm text-accent" onClick={() => open(bron.gesprek)}>Waarom deze taak? Projectbron #{bron.bericht}</button>;
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
