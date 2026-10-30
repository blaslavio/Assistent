// Het dok onderin: drie vaste plekken (standaard Vandaag, Agenda en Chat). Welke drie, kies je zelf in
// Instellingen › Weergave. Al het andere bereik je via je foto linksonder (Instellingen) of door het de assistent te vragen.
import type { Tab } from "../App";
import { Ballon, Kalender, Projectmap, Zon } from "../iconen";

export const DOK_KEUZES: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Vandaag", Icoon: Zon },
  { id: "agenda", naam: "Agenda", Icoon: Kalender },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "projecten", naam: "Projecten", Icoon: Projectmap },
];
export const DOK_STANDAARD: Tab[] = ["vandaag", "agenda", "chat"];

/** De drie plekken uit je instellingen, in vaste volgorde; onbekende of te weinig keuzes vullen we aan. */
export function dokVan(gekozen: unknown): Tab[] {
  const lijst = Array.isArray(gekozen) ? gekozen.filter((t): t is Tab => DOK_KEUZES.some((k) => k.id === t)) : [];
  const uniek = [...new Set(lijst)].slice(0, 3);
  for (const t of DOK_STANDAARD) if (uniek.length < 3 && !uniek.includes(t)) uniek.push(t);
  return DOK_KEUZES.filter((k) => uniek.includes(k.id)).map((k) => k.id);
}

export default function HoofdNavigatie({ actief, kies, tabs = DOK_STANDAARD }: { actief: Tab; kies: (t: Tab) => void; tabs?: Tab[] }) {
  return (
    <nav aria-label="Hoofdmenu" data-dok
      className="grid shrink-0 grid-cols-3 px-6 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)]">
      {DOK_KEUZES.filter((k) => tabs.includes(k.id)).map(({ id, naam, Icoon }) => {
        const aan = actief === id;
        return (
          <button key={id} onClick={() => kies(id)} aria-current={aan ? "page" : undefined}
            className={`flex min-h-12 flex-col items-center justify-center gap-1 text-[11px] ${aan ? "font-semibold text-inkt" : "text-zacht"}`}>
            <span className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${aan ? "bg-vlak" : ""}`}>
              <Icoon className="size-[22px]" />
            </span>
            {naam}
          </button>
        );
      })}
    </nav>
  );
}
