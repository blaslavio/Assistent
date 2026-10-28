import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { bijwerken, type Afspraak, type Taak } from "../api";
import type { Staat } from "../App";
import { Bel, Envelop, Kruis, Lijstje, Plus, Prullenbak, Terug } from "../iconen";
import { HerinneringenPaneel, MailPaneel, TakenPaneel } from "./AgendaPanelen";
import { mailsBewaard } from "../lib/mail";
import { DAGEN_KORT, MAANDEN, dagTitel, datumTekst, heleDag, moment, plusDagen, uur, weekBegin } from "../lib/tijd";

// Dezelfde kleuren per soort als in de oude app.
const KLEUREN: Record<string, string> = {
  afspraak: "#2563eb", sport: "#16a34a", uitgaan: "#9333ea", etentje: "#ea580c", werk: "#475569",
  "familie en vrienden": "#db2777", gezondheid: "#0891b2", reizen: "#ca8a04", verjaardag: "#f59e0b",
  herinnering: "#dc2626", focus: "#0d9488", vrij: "#059669", bezorging: "#7c3aed", overig: "#64748b",
};
const kleur = (a: Afspraak) => KLEUREN[a.soort ?? ""] ?? KLEUREN.afspraak;
const SOORTEN = ["afspraak", "werk", "sport", "etentje", "uitgaan", "familie en vrienden", "gezondheid", "reizen"];

type Weergave = "dag" | "week" | "maand";
type Paneel = "mail" | "taken" | "herinneringen";
const PANELEN: [Paneel, string, typeof Bel][] = [["mail", "Mail", Envelop], ["taken", "Taken", Lijstje],
  ["herinneringen", "Herinneringen", Bel]];
const WEERGAVEN: [Weergave, string][] = [["dag", "Dag"], ["week", "Week"], ["maand", "Maand"]];
const BEGIN_UUR = 0;
const HOOGTE = 56; // pixels per uur in de dagweergave

function bewaardeWeergave(): Weergave {
  try {
    const w = localStorage.getItem("assistent.agenda");
    return w === "week" || w === "maand" ? w : "dag";
  } catch {
    return "dag";
  }
}

const groot = (s: string) => s[0].toUpperCase() + s.slice(1);

type Props = { staat: Staat; setStaat: (s: Staat) => void };

export default function Agenda({ staat, setStaat }: Props) {
  const vandaag = datumTekst(new Date());
  const [weergave, setWeergaveRuw] = useState<Weergave>(bewaardeWeergave);
  const [gekozen, setGekozen] = useState(vandaag);
  const [nieuw, setNieuw] = useState(false);
  const [open, setOpen] = useState<Afspraak | null>(null);
  const [paneel, setPaneel] = useState<Paneel | null>(null);
  const datum = new Date(`${gekozen}T12:00`);

  function setWeergave(w: Weergave) {
    setWeergaveRuw(w);
    try { localStorage.setItem("assistent.agenda", w); } catch { /* alleen voor dit bezoek */ }
  }

  // Afspraken en taken met een datum, per dag.
  const { afspraken, taken } = useMemo(() => {
    const afspraken = new Map<string, Afspraak[]>();
    for (const a of staat.data.afspraken) {
      const d = a.start.slice(0, 10);
      afspraken.set(d, [...(afspraken.get(d) ?? []), a]);
    }
    for (const lijst of afspraken.values()) lijst.sort((a, b) => a.start.localeCompare(b.start));
    const taken = new Map<string, Taak[]>();
    for (const t of staat.data.taken) {
      if (t.klaar || !t.deadline) continue;
      const d = t.deadline.slice(0, 10);
      taken.set(d, [...(taken.get(d) ?? []), t]);
    }
    return { afspraken, taken };
  }, [staat.data.afspraken, staat.data.taken]);

  function verschuif(n: number) {
    if (n === 0) return setGekozen(vandaag);
    if (weergave === "maand") {
      const d = new Date(datum.getFullYear(), datum.getMonth() + n, 1);
      return setGekozen(datumTekst(d));
    }
    setGekozen(datumTekst(plusDagen(datum, weergave === "week" ? 7 * n : n)));
  }

  function naarDag(d: string) {
    setGekozen(d);
    setWeergave("dag");
  }

  const titel = weergave === "maand" || weergave === "week"
    ? `${groot(MAANDEN[(weergave === "week" ? plusDagen(weekBegin(datum), 3) : datum).getMonth()])}`
    : groot(MAANDEN[datum.getMonth()]);
  const stap = weergave === "dag" ? "dag" : weergave === "week" ? "week" : "maand";
  const nuLokaal = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  const telTaken = staat.data.taken.filter((t) => !t.klaar && t.deadline && t.deadline.slice(0, 10) <= vandaag).length;
  const telHerinneringen = staat.data.afspraken.filter((a) => a.soort === "herinnering" && a.start.slice(0, 10) === vandaag
    && a.start >= nuLokaal.slice(0, a.start.length > 10 ? 16 : 10)).length;
  const telMail = (mailsBewaard() ?? []).filter((m) => !m.gelezen).length;

  return (
    <div className="flex min-h-full flex-col">
      <header className="flex flex-col gap-3 px-6 pt-14 pb-3">
        <div className="flex items-center justify-between gap-2">
          {paneel ? (
            <h1 key={paneel} className="opkomen text-[32px] font-bold tracking-tight">{PANELEN.find(([p]) => p === paneel)?.[1]}</h1>
          ) : (
            <button onClick={() => verschuif(0)} aria-label="Naar vandaag" className="min-w-0 text-left">
              <h1 className="truncate text-[32px] font-bold tracking-tight">
                {titel}{datum.getFullYear() !== new Date().getFullYear() && <span className="text-rustig"> {datum.getFullYear()}</span>}
              </h1>
            </button>
          )}
          <div className="flex shrink-0 items-center gap-1.5" role="group" aria-label="Meer in je agenda">
            {PANELEN.map(([p, naam, Icoon]) => {
              const telt = p === "taken" ? telTaken : p === "herinneringen" ? telHerinneringen : telMail;
              return (
                <button key={p} onClick={() => setPaneel(paneel === p ? null : p)} aria-pressed={paneel === p} aria-label={naam}
                  className={`relative flex size-10 items-center justify-center rounded-full transition-colors ${paneel === p
                    ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak text-rustig"}`}>
                  <Icoon className="size-5" />
                  {telt > 0 && paneel !== p && (
                    <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">
                      {telt > 9 ? "9+" : telt}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        {!paneel && (
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Weergave" className="flex flex-1 rounded-full bg-vlak p-1">
              {WEERGAVEN.map(([w, naam]) => (
                <button key={w} role="tab" aria-selected={weergave === w} onClick={() => setWeergave(w)}
                  className={`h-8 flex-1 rounded-full text-sm font-medium ${weergave === w ? "bg-white shadow-sm dark:bg-[#2a2a30]" : "text-rustig"}`}>
                  {naam}
                </button>
              ))}
            </div>
            <button onClick={() => verschuif(-1)} aria-label={`Vorige ${stap}`}
              className="flex size-10 items-center justify-center rounded-full text-rustig hover:bg-vlak"><Terug /></button>
            <button onClick={() => verschuif(1)} aria-label={`Volgende ${stap}`}
              className="-ml-1 flex size-10 rotate-180 items-center justify-center rounded-full text-rustig hover:bg-vlak"><Terug /></button>
            <button onClick={() => setNieuw(true)} aria-label="Nieuwe afspraak"
              className="flex size-10 items-center justify-center rounded-full bg-accent text-white"><Plus className="size-5" /></button>
          </div>
        )}
      </header>

      {paneel === "mail" && <MailPaneel staat={staat} setStaat={setStaat} />}
      {paneel === "taken" && <TakenPaneel staat={staat} setStaat={setStaat} />}
      {paneel === "herinneringen" && <HerinneringenPaneel staat={staat} setStaat={setStaat} />}
      {!paneel && <div key={weergave} className="opkomen flex flex-1 flex-col">
      {weergave === "dag" && (
        <DagWeergave gekozen={gekozen} vandaag={vandaag} setGekozen={setGekozen} afspraken={afspraken} taken={taken}
          open={setOpen} />
      )}
      {weergave === "week" && (
        <WeekWeergave gekozen={gekozen} vandaag={vandaag} afspraken={afspraken} taken={taken} naarDag={naarDag} open={setOpen} />
      )}
      {weergave === "maand" && (
        <MaandWeergave gekozen={gekozen} vandaag={vandaag} afspraken={afspraken} taken={taken} naarDag={naarDag} />
      )}
      </div>}

      {nieuw && <NieuweAfspraak datum={gekozen} sluit={() => setNieuw(false)}
        bewaard={(data) => { setStaat({ ...staat, data }); setNieuw(false); }} />}
      {open && <AfspraakBlad a={open} sluit={() => setOpen(null)}
        weg={(data) => { setStaat({ ...staat, data }); setOpen(null); }} />}
    </div>
  );
}

type Lijsten = { afspraken: Map<string, Afspraak[]>; taken: Map<string, Taak[]> };

function DagWeergave({ gekozen, vandaag, setGekozen, afspraken, taken, open }: Lijsten & {
  gekozen: string; vandaag: string; setGekozen: (d: string) => void; open: (a: Afspraak) => void }) {
  const dagen = Array.from({ length: 7 }, (_, i) => plusDagen(weekBegin(new Date(`${gekozen}T12:00`)), i));
  const lijst = afspraken.get(gekozen) ?? [];
  const heleDagen = lijst.filter((a) => heleDag(a.start));
  const metTijd = lijst.filter((a) => !heleDag(a.start));
  const takenNu = taken.get(gekozen) ?? [];
  const rooster = useRef<HTMLDivElement>(null);
  const [nu, setNu] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNu(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Begin in beeld bij het eerste dat gepland staat, of bij nu.
  useEffect(() => {
    const eerste = metTijd[0] ? moment(metTijd[0].start).getHours() : gekozen === vandaag ? new Date().getHours() : 8;
    rooster.current?.scrollTo({ top: Math.max(0, (eerste - BEGIN_UUR - 1) * HOOGTE) });
  }, [gekozen]);

  const minuten = (t: string) => { const d = moment(t); return d.getHours() * 60 + d.getMinutes(); };
  const nuMin = nu.getHours() * 60 + nu.getMinutes();

  return (
    <>
      <div className="grid grid-cols-7 gap-1 px-4 pb-3">
        {dagen.map((d) => {
          const t = datumTekst(d);
          const actief = t === gekozen;
          const druk = afspraken.has(t) || taken.has(t);
          return (
            <button key={t} onClick={() => setGekozen(t)} aria-pressed={actief} aria-label={dagTitel(d)}
              className={`flex h-16 flex-col items-center justify-center gap-0.5 rounded-2xl ${actief ? "bg-accent text-white" : ""}`}>
              <span className="text-[11px] opacity-70">{DAGEN_KORT[d.getDay()]}</span>
              <span className={`text-[17px] font-semibold ${t === vandaag && !actief ? "text-accent" : ""}`}>{d.getDate()}</span>
              <span className={`size-1 rounded-full ${druk ? (actief ? "bg-white" : "bg-accent") : ""}`} />
            </button>
          );
        })}
      </div>

      <h2 className="px-6 pb-2 text-[13px] font-semibold uppercase tracking-[0.06em] text-rustig">
        {dagTitel(new Date(`${gekozen}T12:00`))}
      </h2>
      {(heleDagen.length > 0 || takenNu.length > 0) && (
        <div className="flex flex-col gap-1.5 px-6 pb-3">
          {heleDagen.map((a) => (
            <button key={a.id} onClick={() => open(a)} className="flex items-center gap-2 rounded-xl px-3 py-2 text-left text-[15px] font-medium text-white"
              style={{ background: kleur(a) }}>{a.titel}<span className="ml-auto text-[13px] opacity-80">Hele dag</span></button>
          ))}
          {takenNu.map((t) => (
            <span key={t.id} className="flex items-center gap-2 rounded-xl bg-vlak px-3 py-2 text-[15px]">
              <span className="size-3.5 shrink-0 rounded-full border-2 border-zacht" />{t.titel}
              <span className="ml-auto text-[13px] text-rustig">Taak</span>
            </span>
          ))}
        </div>
      )}

      <div ref={rooster} className="relative mx-4 mb-4 max-h-[62vh] overflow-y-auto rounded-2xl" aria-label="Tijdlijn">
        <div className="relative" style={{ height: (24 - BEGIN_UUR) * HOOGTE }}>
          {Array.from({ length: 24 - BEGIN_UUR }, (_, i) => (
            <div key={i} className="absolute inset-x-0 flex border-t border-lijn/70" style={{ top: i * HOOGTE }}>
              <span className="w-12 -translate-y-2 bg-white pr-2 text-right text-[11px] text-zacht dark:bg-[#0b0b0e]">
                {i === 0 ? "" : `${String(BEGIN_UUR + i).padStart(2, "0")}:00`}
              </span>
            </div>
          ))}
          {gekozen === vandaag && nuMin >= BEGIN_UUR * 60 && (
            <div className="absolute right-0 left-12 z-10 h-0.5 bg-red-500" style={{ top: (nuMin / 60 - BEGIN_UUR) * HOOGTE }}>
              <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-red-500" />
            </div>
          )}
          {metTijd.map((a, i) => {
            const van = Math.max(minuten(a.start), BEGIN_UUR * 60);
            const tot = Math.max(van + 30, a.einde && a.einde.slice(0, 10) === gekozen ? minuten(a.einde) : van + 60);
            // Overlappende afspraken naast elkaar.
            const naast = metTijd.filter((b) => minuten(b.start) < tot && (b.einde ? minuten(b.einde) : minuten(b.start) + 60) > van);
            const plek = naast.indexOf(a);
            const breed = 100 / naast.length;
            return (
              <button key={`${a.id}-${i}`} onClick={() => open(a)}
                className="absolute flex flex-col overflow-hidden rounded-lg px-2 py-1 text-left text-white"
                style={{ top: (van / 60 - BEGIN_UUR) * HOOGTE + 1, height: ((tot - van) / 60) * HOOGTE - 2,
                  left: `calc(3.25rem + (100% - 3.5rem) * ${(plek * breed) / 100})`,
                  width: `calc((100% - 3.5rem) * ${breed / 100} - 2px)`, background: kleur(a) }}>
                <span className="truncate text-[13px] font-semibold leading-tight">{a.titel}</span>
                <span className="truncate text-[11px] opacity-85">{uur(a.start)}{a.einde ? `–${uur(a.einde)}` : ""}{a.locatie ? ` · ${a.locatie}` : ""}</span>
              </button>
            );
          })}
        </div>
      </div>
      {lijst.length === 0 && takenNu.length === 0 && (
        <p className="px-6 pb-6 text-center text-[15px] text-rustig">Niets gepland. Tik op + of vraag het de assistent.</p>
      )}
    </>
  );
}

function WeekWeergave({ gekozen, vandaag, afspraken, taken, naarDag, open }: Lijsten & {
  gekozen: string; vandaag: string; naarDag: (d: string) => void; open: (a: Afspraak) => void }) {
  const dagen = Array.from({ length: 7 }, (_, i) => datumTekst(plusDagen(weekBegin(new Date(`${gekozen}T12:00`)), i)));
  return (
    <main className="flex flex-col px-4 pb-6">
      {dagen.map((d) => {
        const lijst = afspraken.get(d) ?? [];
        const t = taken.get(d) ?? [];
        const dag = new Date(`${d}T12:00`);
        return (
          <section key={d} className="flex gap-3 border-b border-lijn/70 py-3 last:border-0">
            <button onClick={() => naarDag(d)} aria-label={dagTitel(dag)}
              className={`flex w-12 shrink-0 flex-col items-center self-start rounded-2xl py-1 ${d === vandaag ? "bg-accent text-white" : ""}`}>
              <span className="text-[11px] opacity-70">{DAGEN_KORT[dag.getDay()]}</span>
              <span className="text-xl font-semibold">{dag.getDate()}</span>
            </button>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-0.5">
              {lijst.length === 0 && t.length === 0 && <span className="py-2 text-[15px] text-zacht">Vrij</span>}
              {lijst.map((a) => (
                <button key={a.id} onClick={() => open(a)} className="flex items-center gap-2.5 rounded-xl bg-vlak px-3 py-2 text-left">
                  <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: kleur(a) }} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[15px] font-medium">{a.titel}</span>
                    <span className="truncate text-[13px] text-rustig">
                      {heleDag(a.start) ? "Hele dag" : `${uur(a.start)}${a.einde ? ` – ${uur(a.einde)}` : ""}`}{a.locatie ? ` · ${a.locatie}` : ""}
                    </span>
                  </span>
                </button>
              ))}
              {t.map((x) => (
                <span key={x.id} className="flex items-center gap-2.5 px-3 py-1 text-[15px] text-rustig">
                  <span className="size-3.5 shrink-0 rounded-full border-2 border-zacht" />{x.titel}
                </span>
              ))}
            </div>
          </section>
        );
      })}
    </main>
  );
}

function MaandWeergave({ gekozen, vandaag, afspraken, taken, naarDag }: Lijsten & {
  gekozen: string; vandaag: string; naarDag: (d: string) => void }) {
  const g = new Date(`${gekozen}T12:00`);
  const eerste = new Date(g.getFullYear(), g.getMonth(), 1);
  const begin = weekBegin(eerste);
  const weken = Math.ceil((((eerste.getDay() + 6) % 7) + new Date(g.getFullYear(), g.getMonth() + 1, 0).getDate()) / 7);
  return (
    <main className="px-3 pb-6">
      <div className="grid grid-cols-7 pb-1">
        {[1, 2, 3, 4, 5, 6, 0].map((i) => (
          <span key={i} className="text-center text-[11px] font-medium text-rustig">{DAGEN_KORT[i]}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 border-t border-l border-lijn/70">
        {Array.from({ length: weken * 7 }, (_, i) => {
          const d = plusDagen(begin, i);
          const t = datumTekst(d);
          const lijst = afspraken.get(t) ?? [];
          const aantalTaken = taken.get(t)?.length ?? 0;
          const buiten = d.getMonth() !== g.getMonth();
          return (
            <button key={t} onClick={() => naarDag(t)} aria-label={`${dagTitel(d)}${lijst.length ? `, ${lijst.length} gepland` : ""}`}
              className={`flex min-h-[84px] min-w-0 flex-col gap-0.5 border-r border-b border-lijn/70 p-1 text-left ${buiten ? "opacity-40" : ""}`}>
              <span className={`mx-auto flex size-6 items-center justify-center rounded-full text-[13px] font-semibold ${t === vandaag ? "bg-accent text-white" : ""}`}>
                {d.getDate()}
              </span>
              {lijst.slice(0, 3).map((a) => (
                <span key={a.id} className="truncate rounded px-1 text-[10px] leading-4 font-medium text-white" style={{ background: kleur(a) }}>
                  {a.titel}
                </span>
              ))}
              {lijst.length > 3 && <span className="px-1 text-[10px] text-rustig">+{lijst.length - 3}</span>}
              {aantalTaken > 0 && lijst.length <= 3 && (
                <span className="truncate px-1 text-[10px] text-rustig">{aantalTaken === 1 ? "1 taak" : `${aantalTaken} taken`}</span>
              )}
            </button>
          );
        })}
      </div>
    </main>
  );
}

function Blad({ titel, sluit, children }: { titel: string; sluit: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const toets = (e: KeyboardEvent) => e.key === "Escape" && sluit();
    window.addEventListener("keydown", toets);
    return () => window.removeEventListener("keydown", toets);
  }, [sluit]);
  return (
    <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/30" onClick={sluit}>
      <div role="dialog" aria-label={titel} onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90%] w-full max-w-xl flex-col gap-4 overflow-y-auto rounded-t-[28px] bg-white px-6 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] dark:bg-[#16161a]">
        <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-lijn" />
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{titel}</h2>
          <button onClick={sluit} aria-label="Sluiten" className="-mr-2 flex size-10 items-center justify-center rounded-full hover:bg-vlak">
            <Kruis className="size-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const veld = "h-12 w-full rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";

function NieuweAfspraak({ datum, sluit, bewaard }: { datum: string; sluit: () => void; bewaard: (d: Staat["data"]) => void }) {
  const [titel, setTitel] = useState("");
  const [dag, setDag] = useState(datum);
  const [heel, setHeel] = useState(false);
  const [van, setVan] = useState("09:00");
  const [tot, setTot] = useState("10:00");
  const [plaats, setPlaats] = useState("");
  const [soort, setSoort] = useState("afspraak");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  async function bewaar(e: FormEvent) {
    e.preventDefault();
    if (!titel.trim() || !dag) return;
    if (!heel && tot && tot <= van) return setFout("De eindtijd moet na de begintijd liggen.");
    setBezig(true);
    setFout("");
    try {
      bewaard(await bijwerken((g) => {
        g.afspraken.push({ id: g.volgend_id, titel: titel.trim().slice(0, 120), start: heel ? dag : `${dag}T${van}`,
          einde: heel || !tot ? null : `${dag}T${tot}`, locatie: plaats.trim().slice(0, 120), soort });
        g.volgend_id += 1;
      }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Opslaan lukte niet.");
      setBezig(false);
    }
  }

  return (
    <Blad titel="Nieuwe afspraak" sluit={sluit}>
      <form onSubmit={bewaar} className="flex flex-col gap-3">
        <input autoFocus value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Wat?" aria-label="Titel" className={veld} />
        <div className="flex gap-2">
          <input type="date" value={dag} onChange={(e) => setDag(e.target.value)} aria-label="Datum" className={`${veld} flex-1`} />
          <button type="button" onClick={() => setHeel(!heel)} aria-pressed={heel}
            className={`h-12 shrink-0 rounded-2xl px-4 text-sm font-medium ${heel ? "bg-accent text-white" : "bg-vlak"}`}>Hele dag</button>
        </div>
        {!heel && (
          <div className="flex items-center gap-2">
            <input type="time" value={van} onChange={(e) => setVan(e.target.value)} aria-label="Begin" className={`${veld} flex-1`} />
            <span className="text-rustig">tot</span>
            <input type="time" value={tot} onChange={(e) => setTot(e.target.value)} aria-label="Einde" className={`${veld} flex-1`} />
          </div>
        )}
        <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder="Waar? (mag leeg)" aria-label="Plaats" className={veld} />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Soort">
          {SOORTEN.map((s) => (
            <button key={s} type="button" onClick={() => setSoort(s)} aria-pressed={soort === s}
              className={`flex h-9 items-center gap-1.5 rounded-full px-3 text-sm ${soort === s ? "bg-inkt text-white dark:bg-white dark:text-black" : "bg-vlak"}`}>
              <span className="size-2 rounded-full" style={{ background: KLEUREN[s] }} />{groot(s)}
            </button>
          ))}
        </div>
        {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
        <button disabled={!titel.trim() || bezig} className="h-12 rounded-2xl bg-accent font-medium text-white disabled:opacity-40">
          {bezig ? "Bezig…" : "Opslaan"}
        </button>
      </form>
    </Blad>
  );
}

function AfspraakBlad({ a, sluit, weg }: { a: Afspraak; sluit: () => void; weg: (d: Staat["data"]) => void }) {
  const [zeker, setZeker] = useState(false);
  const [fout, setFout] = useState("");
  const d = new Date(`${a.start.slice(0, 10)}T12:00`);

  async function verwijder() {
    if (!zeker) return setZeker(true);
    try {
      weg(await bijwerken((g) => { g.afspraken = g.afspraken.filter((x) => x.id !== a.id); }));
    } catch (e) {
      setFout(e instanceof Error ? e.message : "Verwijderen lukte niet.");
    }
  }

  return (
    <Blad titel={a.titel} sluit={sluit}>
      <div className="flex flex-col gap-1 text-[15px]">
        <span className="flex items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: kleur(a) }} />
          {groot(a.soort ?? "afspraak")}</span>
        <span>{dagTitel(d)}, {heleDag(a.start) ? "hele dag" : `${uur(a.start)}${a.einde ? ` – ${uur(a.einde)}` : ""}`}</span>
        {a.locatie && <span className="text-rustig">{a.locatie}</span>}
        {a.notitie && <p className="mt-2 whitespace-pre-line text-rustig">{a.notitie}</p>}
      </div>
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      {a.extern ? (
        <p className="text-sm text-rustig">Deze afspraak komt uit een gekoppelde agenda. Wijzig hem daar.</p>
      ) : (
        <div className="flex gap-2">
          {zeker && <button onClick={() => setZeker(false)} className="h-12 flex-1 rounded-2xl bg-vlak font-medium">Annuleer</button>}
          <button onClick={verwijder}
            className={`flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl font-medium ${zeker ? "bg-red-600 text-white" : "bg-vlak text-red-600 dark:text-red-400"}`}>
            <Prullenbak className="size-5" />{zeker ? "Echt verwijderen" : "Verwijderen"}
          </button>
        </div>
      )}
    </Blad>
  );
}
