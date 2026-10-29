// Sport en gezondheid: je week tegen de Beweegrichtlijn, "hoe ging het?" na een training, wat er gepland staat (ook
// boekingen en lessen bij anderen), doelen, en koppelingen met sportapps, Apple Gezondheid en bestanden.
// Rustig opgebouwd: drie delen, details achter één knop.
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { OUDE_APP, bijwerken } from "../api";
import type { Staat } from "../App";
import { Fiets, Hartslag, Kruis, Plus, Slot, Vinkje, Vonk } from "../iconen";
import {
  AANBIEDERS, BEWEEGNORM, GEVOEL, MAATSTAVEN, SPORTEN, afmaken, appInstellen, dagwaarden, dezeWeek, doelBijwerken, doelMaken,
  doelen, gedaan, geboekt, gepland, ingezondenVerwerken, inzendcodeMaken, inzendcodeStoppen, koppelLink, minuten, km,
  ontkoppelen, ophalen, plannen, status, terugkomst, terugkomstWeg, vastleggen, verwerken, voortgang, zonderResultaat,
  type Doel, type Gepland, type Maatstaf, type SportAfspraak, type Status,
} from "../lib/sport";
import { bestandLezen } from "../lib/sportbestand";
import { datumTekst, plusDagen } from "../lib/tijd";
import { kop } from "./instellingen-ui";

const veld = "h-12 min-w-0 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const knop = "flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent px-4 font-medium text-white disabled:opacity-40";
const foutVan = (e: unknown) => (e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
const DAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const uren = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}u${String(m % 60).padStart(2, "0")}` : `${m} min`);
const groot = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function wanneer(start: string, nu = new Date()) {
  const dag = start.slice(0, 10);
  const d = new Date(`${dag}T12:00`);
  const tekst = dag === datumTekst(nu) ? "Vandaag" : dag === datumTekst(plusDagen(nu, 1)) ? "Morgen"
    : `${DAG[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
  return start.includes("T") ? `${tekst} · ${start.slice(11, 16)}` : tekst;
}

type Deel = "week" | "doelen" | "koppelen";

export function Sport({ staat, vernieuw, vraag }: { staat: Staat; vernieuw: () => Promise<void>; vraag: (t: string) => void }) {
  const [deel, setDeel] = useState<Deel>(terugkomst() ? "koppelen" : "week");
  const [melding, setMelding] = useState("");
  const g = staat.data;

  async function doe(aanpassen: Parameters<typeof bijwerken>[0], klaar = "") {
    setMelding("");
    try {
      await bijwerken(aanpassen);
      await vernieuw();
      if (klaar) toon(klaar);
    } catch (e) {
      setMelding(foutVan(e));
    }
  }
  const toon = (t: string) => { setMelding(t); setTimeout(() => setMelding((m) => (m === t ? "" : m)), 2500); };

  return (
    <>
      <div role="tablist" className="grid grid-cols-3 gap-1 rounded-2xl bg-vlak p-1">
        {([["week", "Week"], ["doelen", "Doelen"], ["koppelen", "Koppelen"]] as [Deel, string][]).map(([id, naam]) => (
          <button key={id} role="tab" aria-selected={deel === id} onClick={() => setDeel(id)}
            className={`h-10 rounded-xl text-sm font-medium ${deel === id ? "bg-white shadow-sm dark:bg-white/15" : "text-rustig"}`}>
            {naam}
          </button>
        ))}
      </div>
      {deel === "week" && <Week g={g} doe={doe} />}
      {deel === "doelen" && <Doelen g={g} doe={doe} vraag={vraag} />}
      {deel === "koppelen" && <Koppelen g={g} vernieuw={vernieuw} toon={toon} />}
      {melding && <p role="status" className="text-center text-sm text-rustig">{melding}</p>}
    </>
  );
}

// --- Week --------------------------------------------------------------------------------------------------------

type Doe = (aanpassen: Parameters<typeof bijwerken>[0], klaar?: string) => Promise<void>;

function Week({ g, doe }: { g: Staat["data"]; doe: Doe }) {
  const nu = new Date();
  const w = dezeWeek(g, nu);
  const [extra, setExtra] = useState<Gepland[]>([]);
  const [plan, setPlan] = useState(false);
  const [alles, setAlles] = useState(false);
  useEffect(() => { geboekt().then(setExtra); }, []);
  const komend = gepland(g, extra, 14, nu);
  const open = zonderResultaat(g, nu);
  const dagen = dagwaarden(g, 7);
  const stappen = dagen.filter((d) => d.stappen).map((d) => d.stappen!);
  const slaap = dagen.find((d) => d.slaap_min || d.slaap_score);
  const rust = dagen.find((d) => d.rusthartslag)?.rusthartslag;
  const klaar = gedaan(g, datumTekst(plusDagen(nu, -30)), datumTekst(nu), "", nu)
    .filter((a) => a.sport_resultaat).sort((a, b) => b.start.localeCompare(a.start));
  const deelNorm = Math.min(100, Math.round((100 * w.minuten) / BEWEEGNORM));

  return (
    <>
      <section className="flex flex-col gap-4 rounded-3xl bg-vlak p-5">
        <div className="flex items-center gap-4">
          <Ring procent={deelNorm} />
          <span className="flex flex-col">
            <span className="text-[28px] leading-none font-bold">{w.minuten} <span className="text-base font-medium text-rustig">van {BEWEEGNORM} min</span></span>
            <span className="mt-1 text-sm text-rustig">
              {w.minuten >= BEWEEGNORM ? "Je haalt de Beweegrichtlijn deze week" : `Nog ${BEWEEGNORM - w.minuten} minuten bewegen deze week`}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <Getal waarde={String(w.aantal)} label={w.aantal === 1 ? "training" : "trainingen"} />
          <Getal waarde={`${w.km}`} label="km" />
          {stappen.length ? <Getal waarde={Math.round(stappen.reduce((s, x) => s + x, 0) / stappen.length).toLocaleString("nl-NL")} label="stappen per dag" />
            : slaap ? <Getal waarde={slaap.slaap_min ? uren(slaap.slaap_min) : String(slaap.slaap_score)} label="slaap" />
            : <Getal waarde={String(Math.max(0, 7 - ((nu.getDay() + 6) % 7) - 1))} label="dagen te gaan" />}
        </div>
        {(!!rust || (stappen.length > 0 && !!slaap)) && (
          <p className="text-sm text-rustig">
            {[stappen.length > 0 && slaap ? `Slaap ${slaap.slaap_min ? uren(slaap.slaap_min) : `score ${slaap.slaap_score}`}` : "",
              rust ? `rusthartslag ${rust}` : ""].filter(Boolean).join(" · ")}
          </p>
        )}
      </section>

      {open.map((a) => <HoeGingHet key={a.id} a={a} bewaar={(r) => doe((x) => { vastleggen(x, a.id, r); }, "Bewaard")} />)}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className={kop}>Komende trainingen</h2>
          <button onClick={() => setPlan(!plan)} className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-accent">
            {plan ? <Kruis className="size-4" /> : <Plus className="size-4" />} {plan ? "Sluiten" : "Plannen"}
          </button>
        </div>
        {plan && <Plannen g={g} klaar={(sport, start, duur, weken, waar) => doe((x) => { plannen(x, sport, start, duur, weken, waar); },
          weken > 1 ? `${weken} trainingen gepland` : "Gepland").then(() => setPlan(false))} />}
        {komend.length === 0 && !plan && <p className="px-1 text-sm text-rustig">Niets gepland. Boekingen en lessen bij anderen komen hier vanzelf bij.</p>}
        {komend.slice(0, alles ? 40 : 4).map((t) => (
          <Regel key={`${t.start}${t.titel}`} titel={t.titel} sport={t.sport}
            onder={[wanneer(t.start, nu), t.minuten ? uren(t.minuten) : "",
              t.bij ? `${t.soort === "les" ? "Les bij" : "Bij"} ${t.bij}` : "",
              t.status === "aangevraagd" ? "nog niet bevestigd" : t.status === "wachtlijst" ? "op de wachtlijst" : "", t.waar]} />
        ))}
        {komend.length > 4 && <button onClick={() => setAlles(!alles)} className="h-10 text-sm text-accent">{alles ? "Minder" : `Alle ${komend.length} bekijken`}</button>}
      </section>

      {klaar.length > 0 && (
        <details className="rounded-2xl border border-lijn px-4 py-3">
          <summary className="cursor-pointer font-medium">Gedaan, afgelopen 30 dagen · {klaar.length}</summary>
          <ul className="mt-2 flex flex-col">
            {klaar.slice(0, 40).map((a) => {
              const r = a.sport_resultaat!;
              return (
                <li key={a.id} className="flex flex-col py-2 [&+li]:border-t [&+li]:border-lijn">
                  <span>{a.titel}</span>
                  <span className="text-sm text-rustig">{[wanneer(a.start, nu), uren(minuten(a)), km(a) ? `${km(a)} km` : "",
                    r.gevoel ? GEVOEL[r.gevoel - 1] : "", r.bron ? `uit ${r.bron}` : ""].filter(Boolean).join(" · ")}</span>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </>
  );
}

function Ring({ procent }: { procent: number }) {
  const r = 26, omtrek = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 64 64" className="size-16 shrink-0 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" className="stroke-black/5 dark:stroke-white/10" />
      <circle cx="32" cy="32" r={r} fill="none" strokeWidth="7" strokeLinecap="round" className="stroke-emerald-500 transition-all"
        strokeDasharray={omtrek} strokeDashoffset={omtrek * (1 - procent / 100)} />
    </svg>
  );
}

const Getal = ({ waarde, label }: { waarde: string; label: string }) => (
  <span className="flex flex-col rounded-2xl bg-white/70 py-2 dark:bg-white/5">
    <span className="text-lg font-semibold">{waarde}</span>
    <span className="text-xs text-rustig">{label}</span>
  </span>
);

function Regel({ titel, sport, onder, rechts }: { titel: string; sport: string; onder: string[]; rechts?: ReactNode }) {
  const Icoon = /fiets|wielren|mountainbike|spinning|bmx/.test(sport) ? Fiets : Hartslag;
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-lijn p-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        <Icoon className="size-5" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{titel}</span>
        <span className="text-sm text-rustig">{onder.filter(Boolean).join(" · ")}</span>
      </span>
      {rechts}
    </div>
  );
}

/** Na een training: één tik op hoe het voelde. Minuten en afstand kun je aanpassen, maar het hoeft niet. */
export function HoeGingHet({ a, bewaar }: { a: SportAfspraak; bewaar: (r: { minuten: number; afstand_km: number; gevoel: number }) => void }) {
  const [duur, setDuur] = useState(String(minuten(a)));
  const [afstand, setAfstand] = useState("");
  return (
    <section className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
      <span className="font-medium">Hoe ging {a.titel.toLowerCase()}?</span>
      <div className="grid grid-cols-5 gap-1.5">
        {GEVOEL.map((naam, i) => (
          <button key={naam} onClick={() => bewaar({ minuten: Number(duur) || minuten(a), afstand_km: Number(afstand.replace(",", ".")) || 0, gevoel: i + 1 })}
            className="h-11 rounded-xl bg-vlak text-sm font-medium">{naam}</button>
        ))}
      </div>
      <div className="flex gap-2 text-sm">
        <label className="flex flex-1 items-center gap-2 rounded-xl bg-vlak px-3">
          <input value={duur} onChange={(e) => setDuur(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Minuten"
            className="h-10 w-12 min-w-0 bg-transparent outline-none" /> min
        </label>
        <label className="flex flex-1 items-center gap-2 rounded-xl bg-vlak px-3">
          <input value={afstand} onChange={(e) => setAfstand(e.target.value)} inputMode="decimal" placeholder="0" aria-label="Afstand in km"
            className="h-10 w-12 min-w-0 bg-transparent outline-none placeholder:text-zacht" /> km
        </label>
      </div>
    </section>
  );
}

function Plannen({ g, klaar }: { g: Staat["data"]; klaar: (sport: string, start: string, duur: number, weken: number, waar: string) => void }) {
  const eigen = [...new Set((g.afspraken as SportAfspraak[]).map((a) => a.sport).filter((s): s is string => !!s && !SPORTEN.includes(s)))];
  const [sport, setSport] = useState("hardlopen");
  const [dag, setDag] = useState(datumTekst(plusDagen(new Date(), 1)));
  const [om, setOm] = useState("19:00");
  const [duur, setDuur] = useState("60");
  const [weken, setWeken] = useState("1");
  const [waar, setWaar] = useState("");
  const verstuur = (e: FormEvent) => {
    e.preventDefault();
    if (sport.trim()) klaar(sport, `${dag}T${om}`, Math.max(10, Math.min(600, Number(duur) || 60)), Math.max(1, Math.min(26, Number(weken) || 1)), waar);
  };
  return (
    <form onSubmit={verstuur} className="flex flex-col gap-2 rounded-3xl bg-vlak p-3">
      <input list="sporten" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Welke sport?" aria-label="Sport"
        className={`${veld} bg-white dark:bg-black/30`} />
      <datalist id="sporten">{[...SPORTEN, ...eigen].map((s) => <option key={s} value={s} />)}</datalist>
      <div className="grid grid-cols-2 gap-2">
        <input type="date" value={dag} min={datumTekst(new Date())} onChange={(e) => setDag(e.target.value)} aria-label="Dag"
          className={`${veld} bg-white dark:bg-black/30`} />
        <input type="time" value={om} step={900} onChange={(e) => setOm(e.target.value)} aria-label="Hoe laat"
          className={`${veld} bg-white dark:bg-black/30`} />
        <label className={`${veld} flex items-center gap-2 bg-white dark:bg-black/30`}>
          <input value={duur} onChange={(e) => setDuur(e.target.value.replace(/\D/g, ""))} inputMode="numeric" aria-label="Minuten"
            className="w-full min-w-0 bg-transparent outline-none" /><span className="text-sm text-rustig">min</span>
        </label>
        <select value={weken} onChange={(e) => setWeken(e.target.value)} aria-label="Hoe vaak" className={`${veld} bg-white dark:bg-black/30`}>
          {[1, 4, 8, 12, 26].map((n) => <option key={n} value={n}>{n === 1 ? "Eén keer" : `${n} weken, elke week`}</option>)}
        </select>
      </div>
      <input value={waar} onChange={(e) => setWaar(e.target.value)} placeholder="Waar (mag leeg)" aria-label="Waar"
        className={`${veld} bg-white dark:bg-black/30`} />
      <button className={knop}>Plannen</button>
    </form>
  );
}

// --- Doelen ------------------------------------------------------------------------------------------------------

function Doelen({ g, doe, vraag }: { g: Staat["data"]; doe: Doe; vraag: (t: string) => void }) {
  const lijst = doelen(g);
  const [nieuw, setNieuw] = useState(lijst.length === 0);
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 className={kop}>Je doelen</h2>
        {lijst.length > 0 && (
          <button onClick={() => setNieuw(!nieuw)} className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-accent">
            {nieuw ? <Kruis className="size-4" /> : <Plus className="size-4" />} {nieuw ? "Sluiten" : "Nieuw"}
          </button>
        )}
      </div>
      {nieuw && <NieuwDoel maak={(d) => doe((x) => { doelMaken(x, d); }, "Doel staat erin").then(() => setNieuw(false))} />}
      {lijst.map((d) => <DoelKaart key={d.id} g={g} d={d} doe={doe} vraag={vraag} />)}
    </section>
  );
}

function DoelKaart({ g, d, doe, vraag }: { g: Staat["data"]; d: Doel; doe: Doe; vraag: (t: string) => void }) {
  const v = voortgang(g, d);
  const [stand, setStand] = useState(String(d.stand ?? 0));
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex flex-col">
          <span className="font-medium">{d.omschrijving}</span>
          <span className="text-sm text-rustig">{v.tekst}{v.procent >= 100 ? " · gehaald" : ""}
            {v.dagen !== null ? ` · ${v.dagen >= 0 ? `nog ${v.dagen} dagen` : "deadline voorbij"}` : ""}</span>
        </span>
        <button onClick={() => doe((x) => { doelBijwerken(x, d.id, { actief: false }); }, "Doel gestopt")}
          className="h-8 shrink-0 rounded-full px-3 text-sm text-rustig">Stoppen</button>
      </div>
      <span className="h-2 overflow-hidden rounded-full bg-vlak">
        <span className={`block h-full rounded-full transition-all ${v.procent >= 100 ? "bg-emerald-500" : "bg-accent"}`} style={{ width: `${v.procent}%` }} />
      </span>
      {d.maatstaf === "eigen" && (
        <form onSubmit={(e) => { e.preventDefault(); doe((x) => { doelBijwerken(x, d.id, { stand: Number(stand.replace(",", ".")) || 0 }); }, "Bijgewerkt"); }}
          className="flex gap-2">
          <input value={stand} onChange={(e) => setStand(e.target.value)} inputMode="decimal" aria-label="Waar sta je nu"
            className={`${veld} h-10 flex-1`} />
          <button className="h-10 rounded-2xl bg-vlak px-4 text-sm font-medium">Bijwerken</button>
        </form>
      )}
      {d.sport && (
        <button onClick={() => vraag(`Leg kort de regels en techniek van ${d.sport} uit, met bronnen, en maak een trainingsplan voor mijn doel: ${d.omschrijving}. Zet de trainingen pas in mijn agenda als ik dat zeg.`)}
          className="flex items-center gap-1.5 self-start text-sm font-medium text-accent">
          <Vonk className="size-4" /> Uitleg en trainingsplan
        </button>
      )}
    </div>
  );
}

function NieuwDoel({ maak }: { maak: (d: Omit<Doel, "id" | "gestart" | "actief">) => void }) {
  const [omschrijving, setOmschrijving] = useState("");
  const [sport, setSport] = useState("");
  const [maatstaf, setMaatstaf] = useState<Maatstaf>("keer_per_week");
  const [waarde, setWaarde] = useState("3");
  const [eenheid, setEenheid] = useState("");
  const [deadline, setDeadline] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (omschrijving.trim()) maak({ omschrijving: omschrijving.trim(), sport, maatstaf,
      doelwaarde: Math.max(0.5, Number(waarde.replace(",", ".")) || 1), eenheid, deadline }); }}
      className="flex flex-col gap-2 rounded-3xl bg-vlak p-3">
      <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="Wat wil je bereiken? Bijv. 10 km hardlopen"
        aria-label="Doel" className={`${veld} bg-white dark:bg-black/30`} />
      <input list="sporten-doel" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Sport (mag leeg: alle sporten)"
        aria-label="Sport" className={`${veld} bg-white dark:bg-black/30`} />
      <datalist id="sporten-doel">{SPORTEN.map((s) => <option key={s} value={s} />)}</datalist>
      <select value={maatstaf} onChange={(e) => setMaatstaf(e.target.value as Maatstaf)} aria-label="Hoe meten we het"
        className={`${veld} bg-white dark:bg-black/30`}>
        {MAATSTAVEN.map(([m, naam]) => <option key={m} value={m}>{naam}</option>)}
      </select>
      <div className="grid grid-cols-2 gap-2">
        <input value={waarde} onChange={(e) => setWaarde(e.target.value)} inputMode="decimal" aria-label="Doel (getal)"
          className={`${veld} bg-white dark:bg-black/30`} />
        {maatstaf === "eigen"
          ? <input value={eenheid} onChange={(e) => setEenheid(e.target.value)} placeholder="Eenheid, bijv. kg" aria-label="Eenheid" className={`${veld} bg-white dark:bg-black/30`} />
          : <input type="date" value={deadline} min={datumTekst(new Date())} onChange={(e) => setDeadline(e.target.value)} aria-label="Einddatum (mag leeg)"
              className={`${veld} bg-white dark:bg-black/30`} />}
      </div>
      <button className={knop} disabled={!omschrijving.trim()}>Doel opslaan</button>
    </form>
  );
}

// --- Koppelen ----------------------------------------------------------------------------------------------------

function Koppelen({ g, vernieuw, toon }: { g: Staat["data"]; vernieuw: () => Promise<void>; toon: (t: string) => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [bezig, setBezig] = useState("");
  const [fout, setFout] = useState("");
  const [adres, setAdres] = useState("");
  const bestanden = useRef<HTMLInputElement>(null);

  const herlaad = () => status().then(setS).catch((e) => setFout(foutVan(e)));
  useEffect(() => {
    const terug = terugkomst();
    if (!terug) { herlaad(); return; }
    terugkomstWeg(terug.venster);
    if (!terug.code) { toon("Verbinden afgebroken."); herlaad(); return; }
    setBezig("verbinden");
    afmaken(terug.code, terug.staat)
      .then(async (k) => { await vernieuw(); toon(`${k.naam} is verbonden${k.nieuw ? `, ${k.nieuw} training${k.nieuw === 1 ? "" : "en"} binnen` : ""}.`); })
      .catch((e) => setFout(foutVan(e)))
      .finally(() => { setBezig(""); herlaad(); });
  }, []);

  async function met(wat: string, f: () => Promise<string | void>) {
    setBezig(wat);
    setFout("");
    try {
      const t = await f();
      if (t) toon(t);
    } catch (e) {
      setFout(foutVan(e));
    } finally {
      setBezig("");
    }
  }

  if (!s) return <p className="text-center text-sm text-rustig">{fout || (bezig === "verbinden" ? "Verbinden..." : "Even laden...")}</p>;
  const gekoppeld = Object.fromEntries(s.koppelingen.map((k) => [k.aanbieder, k]));
  const zichtbaar = Object.keys(AANBIEDERS).filter((a) => s.aan.includes(a) || gekoppeld[a]);

  return (
    <>
      <p className="flex items-start gap-2 px-1 text-sm text-rustig">
        <Slot className="mt-0.5 size-4 shrink-0" /> Alleen lezen: trainingen, stappen en slaap. De app plaatst of wijzigt niets, en je kunt altijd ontkoppelen.
      </p>
      {zichtbaar.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={kop}>Sportapps</h2>
          {zichtbaar.map((a) => {
            const k = gekoppeld[a];
            const [naam, wat] = AANBIEDERS[a];
            return (
              <div key={a} className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
                <span className="flex flex-col">
                  <span className="font-medium">{naam}{k?.naam ? ` · ${k.naam}` : ""}</span>
                  <span className={`text-sm ${k?.status === "verlopen" ? "text-amber-600 dark:text-amber-400" : k ? "text-emerald-600 dark:text-emerald-400" : "text-rustig"}`}>
                    {k?.status === "verlopen" ? "Opnieuw verbinden nodig" : k ? "Verbonden" : wat}</span>
                </span>
                <div className="flex flex-wrap gap-2">
                  {(!k || k.status === "verlopen") && (
                    <button disabled={!!bezig} onClick={() => met(a, async () => { window.open(await koppelLink(a), "_top"); })} className={`${knop} h-10`}>
                      {bezig === a ? "Even geduld" : "Verbinden"}
                    </button>
                  )}
                  {k?.status === "actief" && (
                    <button disabled={!!bezig} onClick={() => met(a, async () => { const n = await ophalen(a, 30); await vernieuw(); return n ? `${n} nieuwe training${n === 1 ? "" : "en"}.` : "Alles is bij."; })}
                      className="h-10 rounded-2xl bg-vlak px-4 text-sm font-medium">{bezig === a ? "Ophalen..." : "Nu ophalen"}</button>
                  )}
                  {k && (
                    <button disabled={!!bezig} onClick={() => met(a, async () => { await ontkoppelen(a); await herlaad(); return "Ontkoppeld. Er komt niets meer binnen."; })}
                      className="h-10 rounded-2xl px-4 text-sm text-rustig">Ontkoppelen</button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
        <span className="flex flex-col">
          <span className="font-medium">Apple Gezondheid</span>
          <span className="text-sm text-rustig">Ook Apple Watch. Apple heeft geen koppeling via internet; de app Health Auto Export stuurt je gegevens naar je eigen, geheime adres.</span>
        </span>
        {adres ? (
          <>
            <p className="text-sm text-rustig">Je adres, alleen nu te zien:</p>
            <p className="rounded-xl bg-vlak p-3 font-mono text-[13px] break-all">{adres}</p>
            <button onClick={() => navigator.clipboard?.writeText(adres).then(() => toon("Gekopieerd"))} className="h-10 rounded-2xl bg-vlak text-sm font-medium">Kopiëren</button>
            <ol className="list-decimal pl-5 text-sm leading-relaxed text-rustig">
              <li>Installeer Health Auto Export uit de App Store.</li>
              <li>Kies Automations, dan New automation en REST API.</li>
              <li>Plak het adres bij URL. Kies JSON en zet Workouts, Stappen en Slaap aan.</li>
              <li>Klaar. Wat binnenkomt, staat binnen een paar uur hier.</li>
            </ol>
            <button onClick={() => setAdres("")} className="h-10 text-sm text-accent">Klaar</button>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <button disabled={!!bezig} onClick={() => met("apple", async () => { setAdres(await inzendcodeMaken()); await herlaad(); })}
              className={s.inzendadres ? "h-10 rounded-2xl bg-vlak px-4 text-sm font-medium" : `${knop} h-10`}>
              {s.inzendadres ? "Nieuw adres maken" : "Instellen"}
            </button>
            {s.inzendadres && <>
              <button disabled={!!bezig} onClick={() => met("apple", async () => { const n = await ingezondenVerwerken(g); await vernieuw(); return n ? `${n} nieuwe training${n === 1 ? "" : "en"}.` : "Alles is bij."; })}
                className="h-10 rounded-2xl bg-vlak px-4 text-sm font-medium">Nu ophalen</button>
              <button disabled={!!bezig} onClick={() => met("apple", async () => { await inzendcodeStoppen(); await herlaad(); return "Gestopt. Het oude adres werkt niet meer."; })}
                className="h-10 rounded-2xl px-4 text-sm text-rustig">Stoppen</button>
            </>}
            {s.inzendadres && <span className="w-full text-sm text-emerald-600 dark:text-emerald-400">Ingesteld. Een nieuw adres maken stopt het oude meteen.</span>}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-lijn p-4">
        <span className="flex flex-col">
          <span className="font-medium">Bestand uit een andere app</span>
          <span className="text-sm text-rustig">Garmin, Suunto, COROS, Polar, Zwift of je eigen lijst: GPX, TCX, FIT of CSV. Het bestand blijft op je telefoon; alleen de training komt in je agenda.</span>
        </span>
        <input ref={bestanden} type="file" multiple accept=".gpx,.tcx,.fit,.csv" className="hidden"
          onChange={(e) => {
            const lijst = [...(e.target.files ?? [])];
            e.target.value = "";
            if (lijst.length) met("bestand", async () => {
              const trainingen = (await Promise.all(lijst.map(bestandLezen))).flat();
              let nieuw = 0;
              await bijwerken((x) => { nieuw = verwerken(x, trainingen, [], "Bestand"); });
              await vernieuw();
              return nieuw ? `${nieuw} training${nieuw === 1 ? "" : "en"} toegevoegd.` : "Deze stonden er al.";
            });
          }} />
        <button disabled={!!bezig} onClick={() => bestanden.current?.click()} className="h-10 self-start rounded-2xl bg-vlak px-4 text-sm font-medium">
          {bezig === "bestand" ? "Lezen..." : "Bestand kiezen"}
        </button>
      </section>
      <p className="px-1 text-sm text-rustig">Samsung Health, Google Health Connect of Garmin? Laat die app delen met Strava of Fitbit, of gebruik een bestand.</p>
      {s.eigenaar && <Beheer s={s} klaar={(t) => { toon(t); herlaad(); }} />}
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
    </>
  );
}

/** Alleen de eigenaar: per sportapp één keer de sleutels van je ontwikkelaarsapp. Ze gaan direct naar de database. */
function Beheer({ s, klaar }: { s: Status; klaar: (t: string) => void }) {
  const [open, setOpen] = useState("");
  const [id, setId] = useState("");
  const [geheim, setGeheim] = useState("");
  const [fout, setFout] = useState("");
  const terugAdres = /^https?:\/\//.test(OUDE_APP) ? `${new URL(OUDE_APP).origin}/` : "het adres van de app, met / erachter";
  return (
    <details className="rounded-2xl border border-lijn px-4 py-3">
      <summary className="cursor-pointer font-medium">Apps aanzetten (alleen jij als eigenaar)</summary>
      <p className="mt-2 text-sm text-rustig">Maak bij elke app één keer een ontwikkelaarsapp en vul hier de sleutels in. Daarna kan iedereen met één tik verbinden. Terugkeeradres (redirect URI):</p>
      <p className="mt-1 rounded-xl bg-vlak p-2 font-mono text-[13px] break-all">{terugAdres}</p>
      <ul className="mt-2 flex flex-col">
        {Object.entries(AANBIEDERS).map(([a, [naam]]) => (
          <li key={a} className="flex flex-col gap-2 py-2 [&+li]:border-t [&+li]:border-lijn">
            <button onClick={() => { setOpen(open === a ? "" : a); setId(""); setGeheim(""); setFout(""); }} className="flex items-center justify-between text-left">
              <span>{naam}</span>
              <span className="text-sm text-rustig">{s.ingesteld?.[a] ? <Vinkje className="inline size-4 text-emerald-600" /> : "Uit"}</span>
            </button>
            {open === a && (
              <form className="flex flex-col gap-2" onSubmit={(e) => { e.preventDefault();
                appInstellen(a, id, geheim).then(() => { setOpen(""); klaar(`${naam} opgeslagen.`); }).catch((x) => setFout(foutVan(x))); }}>
                <input value={id} onChange={(e) => setId(e.target.value)} placeholder={s.ingesteld?.[a] ? "Client ID (ingesteld)" : "Client ID"}
                  autoComplete="off" autoCapitalize="off" className={veld} />
                <input value={geheim} onChange={(e) => setGeheim(e.target.value)} type="password" placeholder={s.ingesteld?.[a] ? "Client secret (ingesteld)" : "Client secret"}
                  autoComplete="new-password" className={veld} />
                <button className={`${knop} h-10`}>Opslaan</button>
                {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
              </form>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
