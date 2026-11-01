import { lazy, Suspense } from "react";
import type { Staat, Tab } from "../App";
import { Ballon, Kalender, Projectmap, Vonk, Zon } from "../iconen";
import BewaarScherm from "./BewaarScherm";
import EersteStappen from "./EersteStappen";
import { Laden } from "./Status";
import Vandaag from "./Vandaag";
const Agenda = lazy(() => import("./Agenda"));
type Props = { staat: Staat; setStaat: (s: Staat) => void; deel: "vandaag" | "agenda"; ga: (t: Tab) => void;
  vernieuw: () => Promise<void>; vraag: (t: string) => void; naarProject: (id: number) => void };
export default function MijnDag({staat,setStaat,deel,ga,vernieuw,vraag,naarProject}:Props) {
  return <section className="flex h-full flex-col" aria-label="Mijn dag">
    <nav aria-label="Mijn dag bekijken" className="grid shrink-0 grid-cols-2 gap-2 px-6 pt-2 pb-1">
      {([["vandaag","Vandaag",Zon],["agenda","Agenda",Kalender]] as const).map(([id,naam,Icoon])=><button key={id} aria-current={deel===id?"page":undefined} onClick={()=>ga(id)}
        className={`flex min-h-11 items-center justify-center gap-2 rounded-full text-[13px] font-medium ${deel===id?"bg-inkt text-white dark:text-black":"bg-vlak text-rustig"}`}><Icoon className="size-4"/>{naam}</button>)}
    </nav>
    {deel==="vandaag"&&<nav aria-label="Snel naar" className="grid grid-cols-3 gap-2 px-6 pb-2">
      {([[ "chat", "Berichten", Ballon ], [ "projecten", "Werkruimte", Projectmap ], [ "assistent", "Assistent", Vonk ]] as const).map(([id,naam,Icoon])=><button key={id} type="button" onClick={()=>ga(id)} className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-lijn px-2 text-xs font-medium text-inkt focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"><Icoon className="size-4 shrink-0"/><span>{naam}</span></button>)}
    </nav>}
    <div className="min-h-0 flex-1 overflow-y-auto">
      <BewaarScherm actief={deel==="vandaag"} naam="Vandaag">
        <div className="px-6 pt-2">
          <EersteStappen naarAssistent={() => ga("assistent")} />
        </div>
        <Vandaag ingebed staat={staat} setStaat={setStaat} ga={ga} vernieuw={vernieuw} vraag={vraag} naarProject={naarProject} naarInstellingen={()=>ga("instellingen")} naarAssistent={()=>ga("assistent")}/>
      </BewaarScherm>
      <BewaarScherm actief={deel==="agenda"} naam="Agenda"><Suspense fallback={<Laden tekst="Agenda laden…" />}><Agenda ingebed staat={staat} setStaat={setStaat}/></Suspense></BewaarScherm>
    </div>
  </section>;
}
