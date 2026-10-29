// Een "app in de app" (chat, winkel, een community): bovenin één stap terug, onderin een eigen menu.
import type { ReactNode } from "react";
import { Terug } from "../iconen";

export type MenuItem<K extends string> = [K, string, (p: { className?: string }) => ReactNode, number?];

export function AppKop({ terug, terugNaam, titel, rechts }: { terug?: () => void; terugNaam?: string; titel: string;
  rechts?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-white/90 pt-14 backdrop-blur dark:bg-[#0b0b0e]/90">
      {terug && (
        <button onClick={terug} className="-mt-2 mb-1 ml-4 flex h-9 items-center gap-0.5 rounded-full pr-3 pl-1 text-[15px] text-accent">
          <Terug className="size-5" /> {terugNaam ?? "Terug"}
        </button>
      )}
      <div className="flex items-center justify-between gap-3 px-6 pb-3">
        <h1 className={`line-clamp-2 min-w-0 font-bold tracking-tight break-words ${titel.length > 16 ? "text-[26px] leading-tight" : "text-[32px]"}`}>{titel}</h1>
        {rechts}
      </div>
    </header>
  );
}

export function AppMenu<K extends string>({ naam, items, actief, kies }: { naam: string; items: MenuItem<K>[]; actief: K;
  kies: (k: K) => void }) {
  return (
    <nav aria-label={naam} data-appmenu
      className="sticky bottom-0 z-10 mt-auto border-t border-lijn bg-white/95 px-1 pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur dark:bg-[#0b0b0e]/95">
      <div className="grid" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(([k, label, Icoon, telt]) => {
          const aan = actief === k;
          return (
            <button key={k} onClick={() => kies(k)} aria-pressed={aan} aria-label={label}
              className={`relative flex flex-col items-center gap-1 text-[11px] ${aan ? "font-semibold text-inkt" : "text-rustig"}`}>
              <span className={`flex h-8 w-14 items-center justify-center rounded-full ${aan ? "bg-accent/15 text-accent dark:text-accent-donker" : ""}`}>
                <Icoon className="size-5" />
              </span>
              {label}
              {!!telt && telt > 0 && <span className="absolute -top-0.5 left-[calc(50%+6px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{telt}</span>}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
