// Datum prikken: samen een moment kiezen. In de agenda (paneel) voor jouw stemrondes, en een eigen pagina voor wie via
// de link stemt, zonder account. Een stem gaat meteen weg bij een tik; er is geen opslaan-knop om te vergeten.
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type { Staat } from "../App";
import { Kruis, Plus, Prullenbak, Vinkje, Vonk } from "../iconen";
import { ANTWOORDEN, DAGDELEN, agendaVan, beste, bekijken, botst, code, gastOnthouden, gastSleutel, ics, kiezen, link,
  maken, metMijGedeeld, mijn, stemIk, stemmen, vrijeMomenten, wachtOpMij, weg, type Antwoord, type Dagdeel,
  type Gedeeld, type Optie, type Peiling, type PeilingVoorGast } from "../lib/prikken";
import { DAGEN, datumTekst, plusDagen } from "../lib/tijd";
import { gegevensLaden } from "../api";

type Props = { staat: Staat; setStaat: (s: Staat) => void };
const veld = "h-12 min-w-0 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
const DUREN: [number, string][] = [[60, "1 uur"], [120, "2 uur"], [180, "3 uur"], [240, "4 uur"], [480, "Dagdeel"]];

/** "di 4 nov 19:00" */
export function wanneer(s: string, metTijd = true) {
  const d = new Date(s);
  const dag = `${DAGEN[d.getDay()].slice(0, 2)} ${d.getDate()} ${d.toLocaleDateString("nl-NL", { month: "short" }).replace(".", "")}`;
  return metTijd ? `${dag} ${d.toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}` : dag;
}

const eind = (m: string, minuten: number) =>
  new Date(new Date(m).getTime() + minuten * 60_000).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" });

function Kop({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-5 mb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig first:mt-0">{children}</h2>;
}

async function delen(titel: string, url: string): Promise<string> {
  try {
    if (navigator.share) {
      await navigator.share({ title: titel, text: `Wanneer kun jij? ${titel}`, url });
      return "";
    }
    await navigator.clipboard.writeText(url);
    return "Link gekopieerd. Plak hem in een bericht.";
  } catch (e) {
    return (e as Error).name === "AbortError" ? "" : url;
  }
}

// Een kleine telling buiten React, zodat de agenda het bolletje laat zien zonder elke keer opnieuw te vragen.
let bewaard: { tijd: number; lijst: Peiling[] } | null = null;
export async function stemrondes(vers = false) {
  if (!vers && bewaard && Date.now() - bewaard.tijd < 60_000) return bewaard.lijst;
  const lijst = await mijn();
  bewaard = { tijd: Date.now(), lijst };
  return lijst;
}
export const teStemmen = (lijst: Peiling[]) => lijst.filter(wachtOpMij).length;

// --- In de agenda ----------------------------------------------------------------------------------------------------

export function PrikkenPaneel({ staat, setStaat }: Props) {
  const [lijst, setLijst] = useState<Peiling[] | null>(bewaard?.lijst ?? null);
  const [nieuw, setNieuw] = useState(false);
  const [open, setOpen] = useState<number | null>(null);
  const [fout, setFout] = useState("");
  const [gelukt, setGelukt] = useState("");

  const laden = useCallback(async () => {
    try {
      setLijst(await stemrondes(true));
      setFout("");
    } catch (e) {
      setFout(foutVan(e));
      setLijst((l) => l ?? []);
    }
  }, []);
  useEffect(() => { laden(); }, [laden]);

  const wachten = (lijst ?? []).filter(wachtOpMij);
  const lopend = (lijst ?? []).filter((p) => p.open && !wachtOpMij(p));
  const klaar = (lijst ?? []).filter((p) => !p.open).slice(0, 5);

  const kaart = (p: Peiling) => (
    <StemrondeKaart key={p.id} p={p} open={open === p.id} wissel={() => setOpen(open === p.id ? null : p.id)}
      staat={staat} setStaat={setStaat} vernieuw={laden} meld={setGelukt} />
  );

  return (
    <div className="opkomen flex flex-col px-6 pb-10">
      {nieuw ? <NieuweStemronde staat={staat} sluit={() => setNieuw(false)} klaar={laden} /> : (
        <button onClick={() => setNieuw(true)}
          className="mb-3 flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white">
          <Plus className="size-5" /> Nieuwe stemronde
        </button>
      )}
      {fout && <p role="alert" className="pb-2 text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {gelukt && <p role="status" className="opkomen mb-2 rounded-2xl bg-emerald-500/10 px-4 py-3 text-[15px] text-emerald-700 dark:text-emerald-300">{gelukt}</p>}
      {lijst === null && <p className="bezig-tekst py-4 text-[15px]">Laden</p>}
      {lijst?.length === 0 && !nieuw && (
        <p className="py-6 text-center text-rustig">Kies samen een moment. Jij stelt een paar momenten voor, de anderen tikken aan wanneer ze kunnen. Ook zonder app, via een link.</p>
      )}
      {wachten.length > 0 && <section><Kop>Wacht op jouw stem</Kop><div className="flex flex-col gap-2">{wachten.map(kaart)}</div></section>}
      {lopend.length > 0 && <section><Kop>Lopend</Kop><div className="flex flex-col gap-2">{lopend.map(kaart)}</div></section>}
      {klaar.length > 0 && <section><Kop>Afgerond</Kop><div className="flex flex-col gap-2">{klaar.map(kaart)}</div></section>}
    </div>
  );
}

function Balk({ o, totaal }: { o: Optie; totaal: number }) {
  const n = Math.max(totaal, 1);
  return (
    <span className="flex h-1.5 w-full overflow-hidden rounded-full bg-vlak" aria-hidden>
      <span className="bg-emerald-500" style={{ width: `${(o.ja / n) * 100}%` }} />
      <span className="bg-amber-400" style={{ width: `${(o.misschien / n) * 100}%` }} />
    </span>
  );
}

function StemKnoppen({ waarde, kies, label }: { waarde?: Antwoord; kies: (a: Antwoord) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="flex gap-1.5">
      {ANTWOORDEN.map(([a, naam]) => (
        <button key={a} onClick={() => kies(a)} aria-pressed={waarde === a}
          className={`h-9 flex-1 rounded-full px-3 text-sm ${waarde === a
            ? a === "ja" ? "bg-emerald-600 font-medium text-white" : a === "misschien" ? "bg-amber-500 font-medium text-white" : "bg-inkt font-medium text-white dark:bg-white dark:text-black"
            : "bg-vlak"}`}>{naam}</button>
      ))}
    </div>
  );
}

function StemrondeKaart({ p, open, wissel, staat, setStaat, vernieuw, meld }: Props & { p: Peiling; open: boolean;
  wissel: () => void; vernieuw: () => Promise<void>; meld: (t: string) => void }) {
  const eigen = p.stemmen.find((s) => s.ik)?.stemmen ?? {};
  const [mijnStem, setMijnStem] = useState<Record<string, Antwoord>>(eigen);
  const [gekozen, setKeuze] = useState<number | null>(null);
  const [zeker, setZeker] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const top = beste(p.opties);
  const keuze = gekozen ?? top?.id ?? p.opties[0]?.id ?? null;
  const totaal = p.stemmen.length;
  const c = p.van_mij ? code(staat.data, p.id) : "";

  async function stem(o: Optie, a: Antwoord) {
    const vorig = mijnStem;
    const nieuw = { ...mijnStem, [String(o.id)]: a };
    setMijnStem(nieuw);
    setMelding("");
    try {
      await stemIk(p.id, nieuw);
      await vernieuw();
    } catch (e) {
      setMijnStem(vorig);
      setMelding(foutVan(e));
    }
  }

  async function doe(f: () => Promise<unknown>, klaar = "") {
    setBezig(true);
    setMelding("");
    try {
      await f();
      if (klaar) meld(klaar);
      await vernieuw();
    } catch (e) {
      setMelding(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  async function wordtHet() {
    await doe(async () => {
      const a = await kiezen(p, keuze);
      if (a) setStaat({ ...staat, data: (await gegevensLaden()).data });
    }, "In je agenda gezet. Wie in de app meedeed, is uitgenodigd.");
  }

  const ondertitel = p.gekozen ? `Het wordt ${wanneer(p.gekozen)}` : !p.open ? "Gesloten zonder datum"
    : `${totaal ? `${totaal} gestemd` : "Nog niemand gestemd"}${top ? ` · meeste stemmen ${wanneer(top.start)}` : ""}`;

  return (
    <article className="rounded-2xl bg-vlak">
      <button onClick={wissel} aria-expanded={open} className="flex w-full flex-col px-4 py-3 text-left">
        <span className="font-medium">{p.titel}{!p.van_mij && <span className="font-normal text-rustig"> · van {p.maker}</span>}</span>
        <span className={`text-[13px] ${p.gekozen ? "text-emerald-700 dark:text-emerald-400" : "text-rustig"}`}>{ondertitel}</span>
      </button>
      {open && (
        <div className="opkomen flex flex-col gap-3 border-t border-lijn px-4 pt-3 pb-4">
          {p.plaats && <p className="text-[15px] text-rustig">{p.plaats}</p>}
          <ul className="flex flex-col gap-3">
            {p.opties.map((o) => {
              const ja = p.stemmen.filter((s) => s.stemmen[String(o.id)] === "ja").map((s) => s.naam);
              const bots = p.open ? botst(staat.data.afspraken, o.start, p.minuten) : [];
              return (
                <li key={o.id} className="flex flex-col gap-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium tabular-nums">{wanneer(o.start)}</span>
                    <span className="shrink-0 text-[13px] text-rustig">{o.ja} ja{o.misschien ? ` · ${o.misschien} misschien` : ""}</span>
                  </div>
                  <Balk o={o} totaal={totaal} />
                  {ja.length > 0 && <span className="text-[13px] text-rustig">{ja.join(", ")}</span>}
                  {bots.length > 0 && <span className="text-[13px] text-amber-700 dark:text-amber-400">Je hebt dan: {bots.map((a) => a.titel).join(", ")}</span>}
                  {p.open && <StemKnoppen waarde={mijnStem[String(o.id)]} kies={(a) => stem(o, a)} label={`Jouw antwoord voor ${wanneer(o.start)}`} />}
                </li>
              );
            })}
          </ul>
          {melding && <p role="status" className="text-sm text-rustig">{melding}</p>}
          {p.van_mij && p.open && (
            <div className="flex flex-col gap-2 border-t border-lijn pt-3">
              {c && (
                <button onClick={async () => setMelding(await delen(p.titel, link(c)))}
                  className="h-11 rounded-2xl bg-white font-medium dark:bg-[#2a2a30]">Link delen</button>
              )}
              <label className="flex flex-col gap-1 text-sm text-rustig">Moment kiezen
                <select value={keuze ?? ""} onChange={(e) => setKeuze(Number(e.target.value))}
                  className="h-11 rounded-2xl bg-white px-3 text-[15px] text-inkt dark:bg-[#2a2a30]">
                  {p.opties.map((o) => <option key={o.id} value={o.id}>{wanneer(o.start)} · {o.ja} ja{o === top ? " (meeste stemmen)" : ""}</option>)}
                </select>
              </label>
              <button disabled={bezig || keuze === null} onClick={wordtHet}
                className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white disabled:opacity-40">
                <Vinkje className="size-5" /> Dit wordt het
              </button>
              <button onClick={() => (zeker ? doe(() => weg(p.id)) : setZeker(true))} disabled={bezig}
                className={`flex h-10 items-center justify-center gap-1.5 rounded-2xl text-sm ${zeker ? "bg-red-600 text-white" : "text-red-600 dark:text-red-400"}`}>
                <Prullenbak className="size-4" /> {zeker ? "Echt verwijderen" : "Stemronde verwijderen"}
              </button>
            </div>
          )}
          {p.van_mij && !p.open && (
            <button onClick={() => doe(() => weg(p.id))} className="h-10 self-start text-sm text-rustig">Uit de lijst halen</button>
          )}
        </div>
      )}
    </article>
  );
}

function NieuweStemronde({ staat, sluit, klaar }: { staat: Staat; sluit: () => void; klaar: () => Promise<void> }) {
  const morgen = datumTekst(plusDagen(new Date(), 1));
  const [titel, setTitel] = useState("");
  const [plaats, setPlaats] = useState("");
  const [minuten, setMinuten] = useState(120);
  const [momenten, setMomenten] = useState<string[]>([]);
  const [dag, setDag] = useState(morgen);
  const [tijd, setTijd] = useState("19:00");
  const [dagdeel, setDagdeel] = useState<Dagdeel>("avond");
  const [mensen, setMensen] = useState<Gedeeld[]>([]);
  const [met, setMet] = useState<number[]>([]);
  const [namen, setNamen] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [gemaakt, setGemaakt] = useState<{ code: string; niet: string[] } | null>(null);
  const [melding, setMelding] = useState("");

  useEffect(() => { metMijGedeeld().then(setMensen).catch(() => {}); }, []);

  function erbij(m: string) {
    setMomenten((l) => (l.includes(m) || l.length >= 12 ? l : [...l, m].sort()));
  }
  function voegToe(e: FormEvent) {
    e.preventDefault();
    if (!dag || !tijd) return;
    const m = `${dag}T${tijd}`;
    if (new Date(m) <= new Date()) return setFout("Kies een moment in de toekomst.");
    setFout("");
    erbij(m);
  }
  async function zoekVrij() {
    setBezig(true);
    setFout("");
    try {
      const bezet: { start: string; einde?: string | null }[] = [...staat.data.afspraken];
      for (const id of met) bezet.push(...(await agendaVan(id)));
      const gevonden = vrijeMomenten(bezet, minuten, dagdeel).filter((m) => !momenten.includes(m));
      if (!gevonden.length) setFout("Geen vrije momenten gevonden in de komende twee weken. Kies een ander dagdeel.");
      setMomenten((l) => [...l, ...gevonden].sort().slice(0, 12));
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }
  async function maak() {
    setBezig(true);
    setFout("");
    try {
      const p = await maken(titel.trim(), momenten, plaats.trim(), minuten, namen.split(/[,\s]+/));
      setGemaakt({ code: p.code, niet: p.niet_gevonden ?? [] });
      await klaar();
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig(false);
    }
  }

  if (gemaakt) {
    return (
      <section className="opkomen mb-3 flex flex-col gap-3 rounded-2xl bg-vlak p-4">
        <p className="font-medium">De stemronde staat klaar.</p>
        <p className="text-[15px] text-rustig">Stuur de link naar wie mee mag doen. Stemmen kan zonder account.</p>
        {gemaakt.niet.length > 0 && <p className="text-sm text-rustig">Niet gevonden in de app: {gemaakt.niet.join(", ")}. Stuur hen de link.</p>}
        <button onClick={async () => setMelding(await delen(titel.trim(), link(gemaakt.code)))}
          className="h-12 rounded-2xl bg-accent font-medium text-white">Link delen</button>
        {melding && <p role="status" className="break-all text-sm text-rustig">{melding}</p>}
        <button onClick={sluit} className="h-10 text-rustig">Klaar</button>
      </section>
    );
  }

  return (
    <section className="opkomen mb-3 flex flex-col gap-3 rounded-2xl bg-vlak p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Nieuwe stemronde</h2>
        <button onClick={sluit} aria-label="Sluiten" className="-mr-2 flex size-9 items-center justify-center rounded-full"><Kruis className="size-5" /></button>
      </div>
      <input autoFocus value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={100} placeholder="Waarvoor? Bijvoorbeeld etentje"
        aria-label="Waarvoor" className={`${veld} bg-white dark:bg-[#2a2a30]`} />
      <input value={plaats} onChange={(e) => setPlaats(e.target.value)} maxLength={200} placeholder="Waar? (mag leeg)" aria-label="Waar"
        className={`${veld} bg-white dark:bg-[#2a2a30]`} />
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Hoe lang">
        {DUREN.map(([m, naam]) => (
          <button key={m} onClick={() => setMinuten(m)} aria-pressed={minuten === m}
            className={`h-9 rounded-full px-3 text-sm ${minuten === m ? "bg-inkt font-medium text-white dark:bg-white dark:text-black" : "bg-white dark:bg-[#2a2a30]"}`}>{naam}</button>
        ))}
      </div>

      <h3 className="mt-1 text-sm font-medium text-rustig">Momenten om uit te kiezen</h3>
      {momenten.length > 0 && (
        <ul className="flex flex-col gap-1">
          {momenten.map((m) => {
            const bots = botst(staat.data.afspraken, m, minuten);
            return (
              <li key={m} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2 dark:bg-[#2a2a30]">
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="tabular-nums">{wanneer(m)} tot {eind(m, minuten)}</span>
                  {bots.length > 0 && <span className="truncate text-[13px] text-amber-700 dark:text-amber-400">Je hebt dan: {bots.map((a) => a.titel).join(", ")}</span>}
                </span>
                <button onClick={() => setMomenten((l) => l.filter((x) => x !== m))} aria-label={`${wanneer(m)} weghalen`}
                  className="flex size-8 items-center justify-center rounded-full text-rustig"><Kruis className="size-4" /></button>
              </li>
            );
          })}
        </ul>
      )}
      <form onSubmit={voegToe} className="flex gap-2">
        <input type="date" value={dag} min={datumTekst(new Date())} onChange={(e) => setDag(e.target.value)} aria-label="Dag"
          className={`${veld} flex-1 bg-white px-3 dark:bg-[#2a2a30]`} />
        <input type="time" value={tijd} step={900} onChange={(e) => setTijd(e.target.value)} aria-label="Tijd"
          className={`${veld} w-28 bg-white px-3 dark:bg-[#2a2a30]`} />
        <button aria-label="Moment toevoegen" disabled={momenten.length >= 12}
          className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-inkt text-white disabled:opacity-30 dark:bg-white dark:text-black"><Plus className="size-5" /></button>
      </form>

      <div className="flex flex-col gap-2 rounded-xl bg-white p-3 dark:bg-[#2a2a30]">
        <p className="text-sm text-rustig">Of laat de app vrije momenten zoeken in je agenda{mensen.length ? " en die van anderen" : ""}.</p>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dagdeel">
          {DAGDELEN.map(([d, naam]) => (
            <button key={d} onClick={() => setDagdeel(d)} aria-pressed={dagdeel === d}
              className={`h-8 rounded-full px-3 text-sm ${dagdeel === d ? "bg-inkt font-medium text-white dark:bg-white dark:text-black" : "bg-vlak"}`}>{naam}</button>
          ))}
        </div>
        {mensen.length > 0 && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ook vrij">
            {mensen.map((m) => (
              <button key={m.id} onClick={() => setMet((l) => (l.includes(m.id) ? l.filter((x) => x !== m.id) : [...l, m.id]))}
                aria-pressed={met.includes(m.id)}
                className={`h-8 rounded-full px-3 text-sm ${met.includes(m.id) ? "bg-accent font-medium text-white" : "bg-vlak"}`}>{m.naam}</button>
            ))}
          </div>
        )}
        <button onClick={zoekVrij} disabled={bezig || momenten.length >= 12}
          className="flex h-10 items-center justify-center gap-2 rounded-xl bg-vlak text-[15px] font-medium disabled:opacity-40">
          <Vonk className="size-4" /> Vrije momenten zoeken
        </button>
      </div>

      <input value={namen} onChange={(e) => setNamen(e.target.value)} placeholder="Uitnodigen in de app (gebruikersnamen, mag leeg)"
        aria-label="Uitnodigen in de app" autoCapitalize="none" className={`${veld} bg-white dark:bg-[#2a2a30]`} />
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <button onClick={maak} disabled={bezig || !titel.trim() || momenten.length < 2}
        className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-40">
        {momenten.length < 2 ? "Kies minstens 2 momenten" : bezig ? "Bezig…" : "Stemronde maken"}
      </button>
    </section>
  );
}

// --- Via de link, zonder account -------------------------------------------------------------------------------------

export function PrikScherm({ code: c }: { code: string }) {
  const [p, setP] = useState<PeilingVoorGast | null | undefined>(undefined);
  const [fout, setFout] = useState("");
  const gast = useMemo(() => gastSleutel(c), [c]);
  const [naam, setNaam] = useState(gast.naam);
  const [keuzes, setKeuzes] = useState<Record<string, Antwoord>>({});
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");

  const laden = useCallback(async () => {
    try {
      const x = await bekijken(c);
      setP(x);
      // Wie hier al stemde (zelfde naam op dit apparaat), ziet zijn eigen stem terug.
      const eigen = gast.naam && x.stemmen.find((s) => s.naam === gast.naam);
      if (eigen) setKeuzes(eigen.stemmen);
    } catch (e) {
      setFout(foutVan(e));
      setP(null);
    }
  }, [c, gast.naam]);
  useEffect(() => { laden(); }, [laden]);

  async function opslaan(e: FormEvent) {
    e.preventDefault();
    setBezig(true);
    setFout("");
    try {
      await stemmen(c, naam.trim(), gast.sleutel, keuzes);
      gastOnthouden(c, { sleutel: gast.sleutel, naam: naam.trim() });
      gast.naam = naam.trim();
      setMelding("Dank je. Je stem is opgeslagen. Je kunt hem hier later nog aanpassen.");
      await laden();
    } catch (er) {
      setFout(foutVan(er));
    } finally {
      setBezig(false);
    }
  }

  function inAgenda() {
    if (!p?.gekozen) return;
    const url = URL.createObjectURL(new Blob([ics(p.titel, p.gekozen, p.minuten, p.plaats)], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "afspraak.ics";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <main className="mx-auto flex min-h-full max-w-xl flex-col gap-6 px-6 pt-14 pb-10">
      {p === undefined ? <p className="bezig-tekst text-[15px]">Laden</p> : p === null ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Deze link werkt niet (meer)</h1>
          <p className="text-rustig">{fout || "Vraag om een nieuwe link."}</p>
        </div>
      ) : (
        <>
          <header className="flex flex-col gap-1">
            <p className="text-sm text-rustig">{p.maker} vraagt wanneer je kunt</p>
            <h1 className="text-[28px] font-bold leading-tight tracking-tight">{p.titel}</h1>
            {p.plaats && <p className="text-[15px]">{p.plaats}</p>}
          </header>
          {p.gekozen ? (
            <section className="flex flex-col gap-3 rounded-2xl bg-vlak p-4">
              <p className="text-lg font-semibold">Het wordt {wanneer(p.gekozen)}</p>
              <button onClick={inAgenda} className="h-12 rounded-2xl bg-accent font-medium text-white">Zet in mijn agenda</button>
            </section>
          ) : !p.open ? (
            <p className="rounded-2xl bg-vlak p-4 text-rustig">Deze stemronde is gesloten.</p>
          ) : (
            <form onSubmit={opslaan} className="flex flex-col gap-4">
              <input value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={40} placeholder="Je naam" aria-label="Je naam"
                autoComplete="given-name" className={`${veld} w-full`} />
              <ul className="flex flex-col gap-4">
                {p.opties.map((o) => (
                  <li key={o.id} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium">{wanneer(o.start)}</span>
                      <span className="text-[13px] text-rustig">{o.ja} ja{o.misschien ? ` · ${o.misschien} misschien` : ""}</span>
                    </div>
                    <Balk o={o} totaal={p.stemmen.length} />
                    <StemKnoppen waarde={keuzes[String(o.id)]} kies={(a) => setKeuzes({ ...keuzes, [String(o.id)]: a })}
                      label={`Kun je ${wanneer(o.start)}?`} />
                  </li>
                ))}
              </ul>
              {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
              {melding && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{melding}</p>}
              <button disabled={bezig || !naam.trim() || !Object.keys(keuzes).length}
                className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-40">{bezig ? "Bezig…" : "Opslaan"}</button>
            </form>
          )}
          {p.stemmen.length > 0 && <p className="text-sm text-rustig">Al gestemd: {p.stemmen.map((s) => s.naam).join(", ")}</p>}
        </>
      )}
    </main>
  );
}
