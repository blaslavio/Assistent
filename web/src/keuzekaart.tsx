import { Vinkje } from "./iconen";
import type { Keuze } from "./lib/assistent";

/** Een vraag met knoppen: één tik en de assistent gaat verder. De aanbevolen optie staat bovenaan en valt op. */
export function KeuzeKaart({ keuze, gekozen, open, kies, compact = false }:
  { keuze: Keuze; gekozen?: number; open: boolean; kies: (j: number) => void; compact?: boolean }) {
  if (compact) return <KleineKaart keuze={keuze} gekozen={gekozen} open={open} kies={kies} />;
  const volgorde = keuze.opties.map((o, j) => ({ ...o, j }))
    .sort((a, b) => Number(b.j === keuze.aanbevolen) - Number(a.j === keuze.aanbevolen));
  return (
    <div role="group" aria-label={keuze.vraag} className="flex flex-col gap-2.5 rounded-3xl border border-lijn p-3">
      <p className="px-1 pt-0.5 font-medium">{keuze.vraag}</p>
      {volgorde.map((o) => {
        const aanbevolen = o.j === keuze.aanbevolen;
        const deze = gekozen === o.j;
        if (gekozen !== undefined && !deze) return null;
        return (
          <button key={o.j} onClick={() => kies(o.j)} disabled={!open}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${deze ? "bg-vlak"
              : aanbevolen ? "bg-accent text-white" : "bg-vlak"} ${!open && !deze ? "opacity-50" : ""}`}>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-medium">{o.label}{aanbevolen && !deze && <span className="ml-2 text-xs font-normal opacity-80">Aanbevolen</span>}</span>
              <span className={`text-[13px] ${aanbevolen && !deze ? "text-white/80" : "text-rustig"}`}>{o.gevolg}</span>
            </span>
            {deze && <Vinkje className="size-5 shrink-0 text-accent" />}
          </button>
        );
      })}
    </div>
  );
}

/** Rustige variant voor Vandaag: de vraag met een rij knoppen, zonder uitleg per optie. */
function KleineKaart({ keuze, gekozen, open, kies }: { keuze: Keuze; gekozen?: number; open: boolean; kies: (j: number) => void }) {
  return (
    <div role="group" aria-label={keuze.vraag} className="flex flex-col gap-3 rounded-[20px] bg-vlak p-4">
      <p className="text-[15px] font-medium">{keuze.vraag}</p>
      <div className="flex flex-wrap gap-2">
        {keuze.opties.map((o, j) => (
          <button key={j} onClick={() => kies(j)} disabled={!open} title={o.gevolg}
            className={`h-9 rounded-full px-4 text-sm font-medium disabled:opacity-60 ${j === keuze.aanbevolen
              ? "bg-accent text-white" : "bg-white text-inkt dark:bg-white/10"} ${gekozen !== undefined && gekozen !== j ? "opacity-40" : ""}`}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
