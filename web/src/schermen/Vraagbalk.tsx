// Eén balk onderaan Vandaag: typ of zeg wat je wilt. De mascotte laat eerst zien wat hij ervan maakt, met één tik
// staat het erin. Een vraag gaat meteen naar de assistent.
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { bijwerken } from "../api";
import type { Staat } from "../App";
import { Kalender, Kruis, Lijstje, Microfoon, Pijl, Vonk } from "../iconen";
import { Mascotte, mascotteZeg, type Stemming } from "../mascotte";
import { begrijp, type Begrip } from "../lib/snelinvoer";
import { DAGEN, MAANDEN, datumTekst, plusDagen, twee } from "../lib/tijd";

type Herkenning = {
  lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null; onerror: (() => void) | null;
};
const Spraak = (window as unknown as { SpeechRecognition?: new () => Herkenning; webkitSpeechRecognition?: new () => Herkenning })
  .SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: new () => Herkenning }).webkitSpeechRecognition;

type Voorstel = Exclude<Begrip, { soort: "vraag" }>;

/** "Morgen", "Vrijdag 30 okt" of "Vandaag". */
function dagNaam(datum: string) {
  const vandaag = datumTekst(new Date());
  if (datum === vandaag) return "Vandaag";
  if (datum === datumTekst(plusDagen(new Date(), 1))) return "Morgen";
  const d = new Date(`${datum}T12:00`);
  const t = `${DAGEN[d.getDay()]} ${d.getDate()} ${MAANDEN[d.getMonth()].slice(0, 3)}`;
  return t[0].toUpperCase() + t.slice(1);
}

export function Vraagbalk({ staat, setStaat, vraag, links, plek = "Wat wil je doen?" }: { staat: Staat; setStaat: (s: Staat) => void;
  vraag?: (t: string) => void; links?: ReactNode; plek?: string }) {
  const [invoer, setInvoer] = useState("");
  const [voorstel, setVoorstel] = useState<Voorstel | null>(null);
  const [zin, setZin] = useState("");
  const [stemming, setStemming] = useState<Stemming>("denkt");
  const [luistert, setLuistert] = useState(false);
  const [bezig, setBezig] = useState(false);
  const herkenning = useRef<Herkenning | null>(null);

  function begrijpZin(tekst: string) {
    const t = tekst.trim();
    if (!t) return;
    const b = begrijp(t);
    if (b.soort === "vraag") {
      setInvoer("");
      if (vraag) vraag(b.tekst);
      return;
    }
    setZin(t);
    setVoorstel(b);
    setStemming("denkt");
    window.setTimeout(() => setStemming("wijst"), 500);
  }

  function verstuur(e: FormEvent) {
    e.preventDefault();
    begrijpZin(invoer);
  }

  function luister() {
    if (!Spraak) return;
    if (luistert) { herkenning.current?.stop(); return; }
    const h = new Spraak();
    h.lang = "nl-NL";
    h.interimResults = true;
    h.continuous = false;
    let gehoord = "";
    h.onresult = (e) => { gehoord = Array.from(e.results).map((r) => r[0].transcript).join(""); setInvoer(gehoord); };
    h.onerror = () => setLuistert(false);
    h.onend = () => { setLuistert(false); begrijpZin(gehoord); };
    herkenning.current = h;
    setLuistert(true);
    h.start();
  }

  async function zetErin() {
    if (!voorstel || bezig) return;
    const v = voorstel;
    setBezig(true);
    try {
      const nieuw = await bijwerken((g) => {
        if (v.soort === "afspraak") {
          const [u, m] = v.tijd.split(":").map(Number);
          const eind = `${twee(Math.min(23, u + 1))}:${twee(u >= 23 ? 59 : m)}`;
          g.afspraken.push({ id: g.volgend_id, titel: v.titel.slice(0, 120), start: `${v.datum}T${v.tijd}`, einde: `${v.datum}T${eind}`,
            locatie: v.locatie.slice(0, 120), soort: "afspraak" });
        } else {
          g.taken.push({ id: g.volgend_id, titel: v.titel.slice(0, 160), deadline: v.deadline, klaar: false });
        }
        g.volgend_id += 1;
      });
      setStaat({ ...staat, data: nieuw });
      mascotteZeg(v.soort === "afspraak" ? `Staat in je agenda: ${dagNaam(v.datum).toLowerCase()} om ${v.tijd}.` : "Staat op je lijst.");
      setVoorstel(null);
      setInvoer("");
    } finally {
      setBezig(false);
    }
  }

  const titel = (t: string) => voorstel && setVoorstel({ ...voorstel, titel: t });

  return (
    <div className="relative z-10 shrink-0 bg-white px-4 pt-2 pb-1 dark:bg-[#0b0b0e]">
      {voorstel && (
        <section aria-label="Zo begrijp ik het" className="opkomen mb-2 flex flex-col gap-3 rounded-3xl bg-vlak p-4">
          <div className="flex items-end gap-2.5">
            <Mascotte stemming={stemming} className="h-12 w-[39px] shrink-0" />
            <p className="mb-1 flex-1 text-[15px] text-rustig">Zo begrijp ik het. Klopt dit?</p>
            <button onClick={() => setVoorstel(null)} aria-label="Niet doen" className="flex size-8 items-center justify-center rounded-full text-rustig">
              <Kruis className="size-4" />
            </button>
          </div>
          <div className="flex flex-col divide-y divide-lijn rounded-2xl bg-white dark:bg-[#16161a]">
            <label className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/12 text-accent dark:text-accent-donker">
                {voorstel.soort === "afspraak" ? <Kalender className="size-4" /> : <Lijstje className="size-4" />}
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-[12px] text-rustig">{voorstel.soort === "afspraak" ? "Afspraak" : "Taak"}</span>
                <input value={voorstel.titel} onChange={(e) => titel(e.target.value)} aria-label="Titel"
                  className="min-w-0 bg-transparent font-medium outline-none" />
              </span>
            </label>
            {voorstel.soort === "afspraak" && (
              <p className="px-3.5 py-2.5 pl-[3.6rem] text-[15px]">
                {dagNaam(voorstel.datum)} om {voorstel.tijd}{voorstel.locatie ? ` · ${voorstel.locatie}` : ""}
              </p>
            )}
            {voorstel.soort === "taak" && (
              <p className="px-3.5 py-2.5 pl-[3.6rem] text-[15px] text-rustig">
                {voorstel.deadline ? `Af op ${dagNaam(voorstel.deadline).toLowerCase()}` : "Zonder datum"}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={zetErin} disabled={bezig || !voorstel.titel.trim()}
              className="h-11 flex-1 rounded-2xl bg-accent font-semibold text-white disabled:opacity-40">Zet erin</button>
            {vraag && (
              <button onClick={() => { setVoorstel(null); setInvoer(""); vraag(zin); }}
                className="flex h-11 items-center gap-1.5 rounded-2xl bg-white px-4 font-medium text-inkt dark:bg-[#16161a]">
                <Vonk className="size-4" /> Assistent
              </button>
            )}
          </div>
        </section>
      )}
      <form onSubmit={verstuur} className="flex items-center gap-2">
        {links}
        <label className="flex h-13 min-w-0 flex-1 items-center gap-1.5 rounded-full bg-vlak pr-1.5 pl-5">
          <span className="sr-only">{plek}</span>
          <input value={invoer} onChange={(e) => setInvoer(e.target.value)} placeholder={luistert ? "Ik luister…" : plek}
            enterKeyHint="send" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-zacht" />
          {Spraak && !invoer.trim() && (
            <button type="button" onClick={luister} aria-label={luistert ? "Stop met luisteren" : "Inspreken"}
              className={`flex size-10 items-center justify-center rounded-full ${luistert ? "bg-accent text-white" : "text-rustig"}`}>
              <Microfoon className="size-5" />
            </button>
          )}
          <button aria-label="Versturen" disabled={!invoer.trim()}
            className="flex size-10 items-center justify-center rounded-full bg-inkt text-white disabled:opacity-30 dark:text-black">
            <Pijl className="size-5" />
          </button>
        </label>
      </form>
    </div>
  );
}

/** Een smalle balk boven het menu, op elk scherm zonder eigen invoer: zo is de assistent altijd één tik weg. */
export function AltijdVragen({ vraag }: { vraag: (t: string) => void }) {
  const [tekst, setTekst] = useState("");
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (tekst.trim()) { vraag(tekst.trim()); setTekst(""); } }}
      className="mx-4 mb-2 flex h-11 shrink-0 items-center gap-2 rounded-full bg-vlak pr-1 pl-4">
      <Vonk className="size-4 shrink-0 text-accent" />
      <input value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Vraag de assistent" aria-label="Vraag de assistent"
        enterKeyHint="send" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zacht" />
      {tekst.trim() && (
        <button aria-label="Vragen" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-white">
          <Pijl className="size-4" />
        </button>
      )}
    </form>
  );
}
