// Drie vaste hoofdplekken. Oude agenda- en dokkeuzes blijven compatibel, zonder Chat te verstoppen.
import type { Tab } from "../App";
import { Ballon, Projectmap, Zon } from "../iconen";
export const DOK_KEUZES: { id: Tab; naam: string; Icoon: typeof Zon }[] = [
  { id: "vandaag", naam: "Mijn dag", Icoon: Zon },
  { id: "chat", naam: "Chat", Icoon: Ballon },
  { id: "projecten", naam: "Werkruimte", Icoon: Projectmap },
];
export const DOK_STANDAARD: Tab[] = ["vandaag", "chat", "projecten"];
export function dokVan(_gekozen?: unknown): Tab[] { return [...DOK_STANDAARD]; }
export default function HoofdNavigatie({ actief, kies, ongelezen=0 }: { actief: Tab; kies: (t: Tab) => void; ongelezen?: number }) {
  const plek = actief === "agenda" ? "vandaag" : actief;
  return <nav aria-label="Hoofdmenu" data-dok className="grid shrink-0 grid-cols-3 border-t border-lijn px-4 pt-1.5 pb-[max(env(safe-area-inset-bottom),10px)]">
    {DOK_KEUZES.map(({id,naam,Icoon})=><button key={id} onClick={()=>kies(id)} aria-current={plek===id?"page":undefined}
      aria-label={id==="chat"&&ongelezen>0?`Chat, ${ongelezen} ongelezen gesprekken`:naam}
      className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] ${plek===id?"font-semibold text-inkt":"text-rustig"}`}>
      <span className={`relative flex h-8 w-14 items-center justify-center rounded-full ${plek===id?"bg-vlak":""}`}><Icoon className="size-[22px]"/>{id==="chat"&&ongelezen>0&&<span className="absolute -top-1 right-0 rounded-full bg-accent px-1.5 text-[10px] text-white">{ongelezen>99?"99+":ongelezen}</span>}</span>{naam}
    </button>)}
  </nav>;
}
