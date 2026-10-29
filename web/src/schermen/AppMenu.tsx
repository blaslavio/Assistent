// Een "app in de app" (chat, winkel, een community): bovenin één stap terug, onderin een eigen menu.
import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Ballon, Huis, Kalender, Tandwiel, Terug, Vonk, Zon } from "../iconen";
import { Mascotte } from "../mascotte";
import { naar, type Bestemming } from "../lib/naar";
import { ONDERDELEN } from "../lib/onderdeel-lijst";

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

type Icoon = (p: { className?: string }) => ReactNode;
const APPS: [string, Icoon, Bestemming][] = [
  ["Vandaag", Zon, { tab: "vandaag" }],
  ["Agenda", Kalender, { tab: "agenda" }],
  ["Chat", Ballon, { tab: "chat" }],
  ["Assistent", Vonk, { tab: "assistent" }],
  ...ONDERDELEN.map(([id, naam, I]) => [naam, I, { tab: "instellingen", onderdeel: id }] as [string, Icoon, Bestemming]),
  ["Instellingen", Tandwiel, { tab: "instellingen" }],
];

/** Alle onderdelen van de app op één paneel, zodat je vanuit een app in de app overal heen kunt. */
export function JeApps({ sluit, hier }: { sluit: () => void; hier: string }) {
  // Buiten het menu getekend: een vervaagde balk zou het paneel anders in zichzelf opsluiten.
  return createPortal(
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/30 opkomen" onClick={sluit}>
      <div role="dialog" aria-label="Je apps" onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85%] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-t-3xl bg-white px-5 pt-3 pb-[max(env(safe-area-inset-bottom),24px)] dark:bg-[#16161a]">
        <span className="mx-auto h-1 w-10 shrink-0 rounded-full bg-lijn" />
        <div className="flex items-center gap-3 px-1">
          <Mascotte stemming="wijst" className="h-12 w-[39px] shrink-0" />
          <div>
            <h2 className="text-xl font-bold tracking-tight">Je apps</h2>
            <p className="text-sm text-rustig">Waar wil je heen?</p>
          </div>
        </div>
        <div className="grid grid-cols-4 gap-x-2 gap-y-4">
          {APPS.map(([naam, I, b]) => {
            const aan = naam === hier;
            return (
              <button key={naam} onClick={() => { sluit(); if (!aan) naar(b); }} aria-current={aan ? "page" : undefined}
                className="flex flex-col items-center gap-1.5 text-[12px]">
                <span className={`flex size-14 items-center justify-center rounded-2xl ${aan ? "bg-accent text-white" : "bg-vlak text-inkt"}`}>
                  <I className="size-6" />
                </span>
                <span className={`max-w-full truncate ${aan ? "font-semibold" : "text-rustig"}`}>{naam}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Het menu onderin een app in de app. Links het huisje naar al je apps; past het niet, dan schuif je de rij opzij. */
export function AppMenu<K extends string>({ naam, items, actief, kies }: { naam: string; items: MenuItem<K>[]; actief: K;
  kies: (k: K) => void }) {
  const [apps, setApps] = useState(false);
  const schuift = items.length > 4;
  return (
    <nav aria-label={naam} data-appmenu
      className="sticky bottom-0 z-10 mt-auto flex items-stretch border-t border-lijn bg-white/95 pt-2.5 pb-[max(env(safe-area-inset-bottom),12px)] backdrop-blur dark:bg-[#0b0b0e]/95">
      <button onClick={() => setApps(true)} aria-label="Je apps" aria-haspopup="dialog"
        className="flex shrink-0 flex-col items-center gap-1 border-r border-lijn px-3 text-[11px] text-rustig">
        <span className="flex h-8 w-10 items-center justify-center"><Huis className="size-5" /></span>
        Apps
      </button>
      <div className={schuift ? "flex flex-1 snap-x overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" : "grid flex-1 px-1"}
        style={schuift ? undefined : { gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map(([k, label, Icoon, telt]) => {
          const aan = actief === k;
          return (
            <button key={k} onClick={() => kies(k)} aria-pressed={aan} aria-label={label}
              className={`relative flex flex-col items-center gap-1 text-[11px] ${schuift ? "min-w-[4.25rem] shrink-0 snap-start" : ""} ${aan ? "font-semibold text-inkt" : "text-rustig"}`}>
              <span className={`flex h-8 w-14 items-center justify-center rounded-full ${aan ? "bg-accent/15 text-accent dark:text-accent-donker" : ""}`}>
                <Icoon className="size-5" />
              </span>
              {label}
              {!!telt && telt > 0 && <span className="absolute -top-0.5 left-[calc(50%+6px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-white">{telt}</span>}
            </button>
          );
        })}
      </div>
      {apps && <JeApps sluit={() => setApps(false)} hier="Chat" />}
    </nav>
  );
}
