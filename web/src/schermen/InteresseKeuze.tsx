// Kies waar je de app vooral voor gebruikt. Niets gaat uit; je ziet je keuzes alleen als eerste.
import { useState } from "react";
import { instellingenBijwerken, type Gegevens } from "../api";
import { INTERESSES, type Interesse } from "../lib/interesses";

export function InteresseKeuze({ begin, klaar }: { begin: Interesse[]; klaar: (g: Gegevens | null) => void }) {
  const [gekozen, setGekozen] = useState<Interesse[]>(begin);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const wissel = (id: Interesse) => setGekozen((g) => (g.includes(id) ? g.filter((x) => x !== id) : [...g, id]));
  async function bewaar() {
    setBezig(true);
    setFout("");
    try {
      const g = await instellingenBijwerken((i) => { i.interesses = gekozen; });
      klaar(g);
    } catch {
      setFout("Bewaren lukte niet. Probeer het opnieuw.");
    } finally {
      setBezig(false);
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Waar gebruik je de app voor?">
        {INTERESSES.map((i) => {
          const aan = gekozen.includes(i.id);
          return (
            <button key={i.id} type="button" aria-pressed={aan} onClick={() => wissel(i.id)}
              className={`flex min-h-11 flex-col items-start rounded-2xl px-3.5 py-2 text-left ${aan ? "bg-accent text-white" : "bg-white ring-1 ring-lijn dark:bg-[#121216]"}`}>
              <span className="text-[14px] font-medium">{i.naam}</span>
              <span className={`text-[12px] ${aan ? "text-white/80" : "text-rustig"}`}>{i.uitleg}</span>
            </button>
          );
        })}
      </div>
      {fout && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
      <div className="flex items-center gap-2">
        <button type="button" disabled={bezig} onClick={bewaar}
          className="min-h-10 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-50">
          {bezig ? "Bewaren…" : "Bewaren"}
        </button>
        <button type="button" onClick={() => klaar(null)} className="min-h-10 px-3 text-sm text-rustig">Later</button>
      </div>
      <p className="text-[12px] text-zacht">Alles blijft beschikbaar. Je keuze bepaalt alleen wat je als eerste ziet in Werkruimte.</p>
    </div>
  );
}
