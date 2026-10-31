// Een "app in de app" (chat, winkel, een community): bovenin één stap terug en, onder de titel, een rij om te wisselen.
// Onderin blijven de drie hoofdplekken; de AI-assistent heeft een eigen knop bovenin.
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Terug } from "../iconen";

export type MenuItem<K extends string> = [K, string, (p: { className?: string }) => ReactNode, number?];

export function AppKop({ terug, terugNaam, titel, rechts }: { terug?: () => void; terugNaam?: string; titel: string;
  rechts?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 bg-white/90 pt-4 backdrop-blur dark:bg-[#0b0b0e]/90">
      {terug && (
        <button onClick={terug} className="-mt-2 mb-1 ml-4 flex h-9 items-center gap-0.5 rounded-full pr-3 pl-1 text-[15px] text-accent">
          <Terug className="size-5" /> {terugNaam ?? "Terug"}
        </button>
      )}
      <div className="flex items-center justify-between gap-3 px-6 pb-3">
        <h1 className={`line-clamp-2 min-w-0 font-bold tracking-tight break-words text-2xl leading-tight`}>{titel}</h1>
        {rechts}
      </div>
      <div data-menuplek />
    </header>
  );
}

/** De rij onder de titel. Het menu wordt in de kop getekend, zodat het meeschuift met de kop en altijd bovenin staat. */
export function AppMenu<K extends string>({ naam, items, actief, kies }: { naam: string; items: MenuItem<K>[]; actief: K;
  kies: (k: K) => void }) {
  const anker = useRef<HTMLSpanElement>(null);
  const [plek, setPlek] = useState<Element | null>(null);
  useLayoutEffect(() => {
    const kop = anker.current?.parentElement?.querySelector("[data-menuplek]") ?? document.querySelector("[data-menuplek]");
    setPlek(kop);
  }, []);
  const rij = (
    <nav aria-label={naam} data-appmenu
      className="flex gap-2 overflow-x-auto px-6 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {items.map(([k, label, , telt]) => {
        const aan = actief === k;
        return (
          <button key={k} onClick={() => kies(k)} aria-pressed={aan} aria-label={label}
            className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[14px] transition-colors ${aan
              ? "bg-inkt font-semibold text-white dark:text-black" : "bg-vlak text-rustig"}`}>
            {label}
            {!!telt && telt > 0 && <span className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold ${aan
              ? "bg-white text-inkt dark:bg-black dark:text-white" : "bg-accent text-white"}`}>{telt}</span>}
          </button>
        );
      })}
    </nav>
  );
  return <><span ref={anker} hidden />{plek ? createPortal(rij, plek) : null}</>;
}
