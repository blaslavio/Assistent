// Leren: een leerreeks die je elke dag een beetje laat doen, herhalen op het moment dat je het bijna vergeet, en
// leerplannen in kleine stappen. De assistent kan een plan maken en je overhoren; de scores komen hier terug.
import { useState, type FormEvent } from "react";
import { bijwerken, instellingenBijwerken } from "../api";
import type { Staat } from "../App";
import { herhalingen, leerdoelen, oefenen, reeks, starten, voortgang, weg, type Leerdoel, type Stap } from "../lib/leren";
import { datumTekst, plusDagen } from "../lib/tijd";
import { Boek, Kalender, Plus, Prullenbak, Terug, Vinkje, Vonk } from "../iconen";
import { kop } from "./instellingen-ui";

const veld = "h-12 min-w-0 rounded-2xl bg-vlak px-4 outline-none placeholder:text-zacht";
const DAGLETTERS = ["zo", "ma", "di", "wo", "do", "vr", "za"];
// Vier knoppen in plaats van zes cijfers: zo hoef je niet na te denken over een score.
const ANTWOORDEN: [number, string][] = [[1, "Nog niet"], [3, "Twijfel"], [4, "Goed"], [5, "Makkelijk"]];

type Props = { staat: Staat; vernieuw: () => Promise<void>; vraag: (tekst: string) => void };

export function Leren({ staat, vernieuw, vraag }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [melding, setMelding] = useState("");
  const g = staat.data;
  const r = reeks(g);
  const lijst = leerdoelen(g);
  const vandaag = herhalingen(g);

  async function doe(aanpassen: Parameters<typeof bijwerken>[0], klaar = "") {
    setMelding("");
    try {
      await bijwerken(aanpassen);
      await vernieuw();
      if (klaar) { setMelding(klaar); setTimeout(() => setMelding(""), 1800); }
    } catch (e) {
      setMelding(e instanceof Error && e.message ? e.message : "Dat lukte niet. Probeer het opnieuw.");
    }
  }

  const score = (d: Leerdoel, s: Stap, n: number) =>
    doe((x) => { oefenen(x, d.id, s.nummer, n); }, n >= 4 ? "Goed zo, komt later terug" : "Komt snel terug");

  const doel = lijst.find((d) => d.id === open);
  if (doel) return <Detail doel={doel} terug={() => setOpen(null)} vraag={vraag} score={(s, n) => score(doel, s, n)}
    weghalen={() => doe((x) => weg(x, doel.id)).then(() => setOpen(null))}
    plannen={() => doe((x) => {
      const start = `${datumTekst(plusDagen(new Date(), 1))}T19:30`;
      x.afspraken.push({ id: x.volgend_id, titel: `Oefenen: ${doel.onderwerp}`, start, einde: start.replace("19:30", "20:00"),
        locatie: "", soort: "focus", notitie: "" });
      x.volgend_id += 1;
    }, "Morgen 19:30 staat in je agenda")} melding={melding} />;

  return (
    <>
      <Reekskaart r={r} dagdoel={(n) => instellingenBijwerken((i) => { i.dagdoel = n; }).then(vernieuw)} />

      {vandaag.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className={kop}>Vandaag herhalen · {vandaag.length}</h2>
          {vandaag.slice(0, 8).map(({ doel: d, stap }) => (
            <Kaart key={`${d.id}-${stap.nummer}`} boven={d.onderwerp} titel={stap.titel}>
              <Antwoorden kies={(n) => score(d, stap, n)} />
            </Kaart>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className={kop}>Wat je leert</h2>
          {lijst.length > 0 && (
            <button onClick={() => setNieuw(!nieuw)} className="flex h-9 items-center gap-1 rounded-full px-3 text-sm text-accent">
              <Plus className="size-4" /> Nieuw
            </button>
          )}
        </div>
        {(nieuw || lijst.length === 0) && (
          <Nieuw leeg={lijst.length === 0} vraag={vraag}
            maak={(o, d, st) => doe((x) => { starten(x, o, st, d); }, "Leerplan staat klaar").then(() => setNieuw(false))} />
        )}
        {lijst.map((d) => {
          const p = voortgang(d);
          return (
            <button key={d.id} onClick={() => setOpen(d.id)}
              className="flex items-center gap-3 rounded-2xl border border-lijn p-3 text-left">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400">
                <Boek className="size-5" />
              </span>
              <span className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="truncate font-medium">{d.onderwerp}</span>
                <span className="h-1.5 overflow-hidden rounded-full bg-vlak">
                  <span className="block h-full rounded-full bg-sky-500" style={{ width: `${p}%` }} />
                </span>
              </span>
              <span className="w-10 shrink-0 text-right text-sm text-rustig">{p}%</span>
            </button>
          );
        })}
      </section>
      {melding && <p role="status" className="text-center text-sm text-rustig">{melding}</p>}
    </>
  );
}

function Reekskaart({ r, dagdoel }: { r: ReturnType<typeof reeks>; dagdoel: (n: number) => void }) {
  const nu = new Date();
  const deel = Math.min(100, Math.round(100 * r.vandaag / r.dagdoel));
  return (
    <section className="flex flex-col gap-4 rounded-3xl bg-vlak p-5">
      <div className="flex items-end justify-between gap-3">
        <span className="flex flex-col">
          <span className="text-[34px] leading-none font-bold">{r.reeks}</span>
          <span className="mt-1 text-sm whitespace-nowrap text-rustig">{r.reeks === 1 ? "dag op rij" : "dagen op rij"}{r.beste > r.reeks ? ` · beste ${r.beste}` : ""}</span>
        </span>
        <span className="flex gap-1" aria-label="Afgelopen week">
          {r.week.map((ok, i) => (
            <span key={i} className="flex flex-col items-center gap-1">
              <span className={`flex size-7 items-center justify-center rounded-full ${ok ? "bg-sky-500 text-white" : "bg-black/5 dark:bg-white/10 text-zacht"}`}>
                {ok ? <Vinkje className="size-3.5" /> : null}
              </span>
              <span className="text-[10px] text-zacht">{DAGLETTERS[(nu.getDay() + i + 1) % 7]}</span>
            </span>
          ))}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
          <span className="block h-full rounded-full bg-sky-500 transition-all" style={{ width: `${deel}%` }} />
        </span>
        <span className="flex items-center justify-between text-sm text-rustig">
          <span>{r.gehaald ? "Dagdoel gehaald" : `Vandaag ${r.vandaag} van ${r.dagdoel}`}</span>
          <label className="flex items-center gap-1">
            Dagdoel
            <select value={r.dagdoel} onChange={(e) => dagdoel(Number(e.target.value))}
              className="rounded-lg bg-transparent font-medium text-inkt outline-none">
              {[3, 5, 10, 20].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
        </span>
      </div>
    </section>
  );
}

function Kaart({ boven, titel, children }: { boven: string; titel: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-lijn p-3">
      <span className="flex flex-col">
        <span className="text-[13px] text-rustig">{boven}</span>
        <span className="font-medium">{titel}</span>
      </span>
      {children}
    </div>
  );
}

function Antwoorden({ kies }: { kies: (n: number) => void }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {ANTWOORDEN.map(([n, label]) => (
        <button key={n} onClick={() => kies(n)}
          className={`h-10 rounded-xl text-[13px] font-medium ${n >= 4 ? "bg-sky-500/10 text-sky-700 dark:text-sky-300" : "bg-vlak text-rustig"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Nieuw({ leeg, vraag, maak }: { leeg: boolean; vraag: (t: string) => void;
  maak: (onderwerp: string, doel: string, stappen: string[]) => void }) {
  const [onderwerp, setOnderwerp] = useState("");
  const [stappen, setStappen] = useState("");
  const regels = stappen.split("\n").map((t) => t.trim()).filter(Boolean);

  function verstuur(e: FormEvent) {
    e.preventDefault();
    if (onderwerp.trim() && regels.length) maak(onderwerp, "", regels);
  }

  return (
    <form onSubmit={verstuur} className="flex flex-col gap-3 rounded-3xl border border-lijn p-4">
      {leeg && <p className="text-rustig">Wat wil je leren? Een taal, een vak voor school, gitaar, Excel. Je oefent een paar minuten per dag
        en de app laat het terugkomen vlak voordat je het vergeet.</p>}
      <input value={onderwerp} onChange={(e) => setOnderwerp(e.target.value)} placeholder="Bijvoorbeeld Spaans voor op reis"
        aria-label="Wat wil je leren" className={veld} maxLength={120} />
      <button type="button" disabled={!onderwerp.trim()}
        onClick={() => vraag(`Maak een leerplan voor: ${onderwerp.trim()}. Vraag eerst kort wat ik al kan en hoeveel tijd ik heb.`)}
        className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white disabled:opacity-30">
        <Vonk className="size-[18px]" /> Laat de assistent een plan maken
      </button>
      <details className="text-sm">
        <summary className="cursor-pointer py-1 text-rustig">Of schrijf zelf de stappen</summary>
        <textarea value={stappen} onChange={(e) => setStappen(e.target.value)} rows={4} aria-label="Stappen, één per regel"
          placeholder={"Eén stap per regel\nBegroeten\nGetallen tot 20\nEten bestellen"}
          className="mt-2 w-full rounded-2xl bg-vlak p-4 text-base outline-none placeholder:text-zacht" />
        <button disabled={!onderwerp.trim() || !regels.length}
          className="mt-2 h-11 w-full rounded-2xl bg-vlak font-medium disabled:opacity-30">
          Bewaar {regels.length ? `${regels.length} stappen` : "plan"}
        </button>
      </details>
    </form>
  );
}

function Detail({ doel, terug, vraag, score, weghalen, plannen, melding }: { doel: Leerdoel; terug: () => void;
  vraag: (t: string) => void; score: (s: Stap, n: number) => void; weghalen: () => void; plannen: () => void; melding: string }) {
  const [oefen, setOefen] = useState<number | null>(null);
  const [zeker, setZeker] = useState(false);
  const p = voortgang(doel);
  return (
    <>
      <button onClick={terug} className="-mt-2 -ml-2 flex h-10 w-fit items-center gap-1 pr-3 text-rustig">
        <Terug className="size-5" /> Alles wat je leert
      </button>
      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{doel.onderwerp}</h2>
        {doel.doel && <p className="text-rustig">{doel.doel}</p>}
        <span className="h-2 overflow-hidden rounded-full bg-vlak">
          <span className="block h-full rounded-full bg-sky-500" style={{ width: `${p}%` }} />
        </span>
        <span className="text-sm text-rustig">{p}% beheerst{doel.deadline ? ` · klaar op ${doel.deadline.slice(8, 10)}/${Number(doel.deadline.slice(5, 7))}` : ""}</span>
      </section>
      <div className="grid grid-cols-2 gap-2">
        <button onClick={() => vraag(`Overhoor me over ${doel.onderwerp} (leerdoel ${doel.id}). Begin bij de stap die ik het minst goed ken.`)}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-accent font-medium text-white">
          <Vonk className="size-[18px]" /> Overhoor me
        </button>
        <button onClick={plannen} className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-vlak font-medium">
          <Kalender className="size-[18px]" /> Plan oefentijd
        </button>
      </div>
      <section className="flex flex-col gap-2">
        <h2 className={kop}>Stappen</h2>
        {doel.stappen.map((s) => (
          <div key={s.nummer} className="flex flex-col gap-2 rounded-2xl border border-lijn p-3">
            <button onClick={() => setOefen(oefen === s.nummer ? null : s.nummer)} className="flex items-center gap-3 text-left">
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-medium
                ${(s.score ?? 0) >= 4 ? "bg-sky-500 text-white" : "bg-vlak text-rustig"}`}>
                {(s.score ?? 0) >= 4 ? <Vinkje className="size-4" /> : s.nummer}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{s.titel}</span>
                <span className="text-[13px] text-rustig">{s.herhalen_op ? `Terug op ${s.herhalen_op.slice(8, 10)}/${Number(s.herhalen_op.slice(5, 7))}` : "Nog niet geoefend"}</span>
              </span>
            </button>
            {oefen === s.nummer && <Antwoorden kies={(n) => { score(s, n); setOefen(null); }} />}
          </div>
        ))}
      </section>
      {zeker ? (
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => setZeker(false)} className="h-12 rounded-2xl bg-vlak font-medium">Toch niet</button>
          <button onClick={weghalen} className="h-12 rounded-2xl bg-red-600 font-medium text-white">Weghalen</button>
        </div>
      ) : (
        <button onClick={() => setZeker(true)} className="flex h-12 items-center justify-center gap-2 rounded-2xl text-red-600 dark:text-red-400">
          <Prullenbak className="size-[18px]" /> Leerplan weghalen
        </button>
      )}
      {melding && <p role="status" className="text-center text-sm text-rustig">{melding}</p>}
    </>
  );
}
