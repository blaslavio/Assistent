import { lazy, Suspense } from "react";
import type { Staat, Tab } from "../App";
import { Kalender, Terug } from "../iconen";
import BewaarScherm from "./BewaarScherm";
import EersteStappen from "./EersteStappen";
import { Laden } from "./Status";
import Vandaag from "./Vandaag";
const Agenda = lazy(() => import("./Agenda"));
type Props = { staat: Staat; setStaat: (s: Staat) => void; deel: "vandaag" | "agenda"; ga: (t: Tab) => void;
  vernieuw: () => Promise<void>; vraag: (t: string) => void; naarProject: (id: number) => void };
export default function MijnDag({staat,setStaat,deel,ga,vernieuw,vraag,naarProject}:Props) {
  return <section className="relative flex h-full flex-col" aria-label="Mijn dag">
    {/* Eén plek, geen dubbele schakelaar: de agenda is een knop op Mijn dag, met een weg terug. */}
    {deel==="agenda"
      ? <div className="shrink-0 px-4 pt-1"><button type="button" onClick={()=>ga("vandaag")} aria-label="Terug naar Mijn dag"
          className="flex h-10 items-center gap-1 rounded-full pr-3 pl-2 text-[15px] font-medium text-accent"><Terug className="size-5"/>Mijn dag</button></div>
      : <button type="button" onClick={()=>ga("agenda")} aria-label="Agenda"
          className="absolute top-3 right-6 z-10 flex h-9 items-center gap-1.5 rounded-full bg-vlak px-3.5 text-[13px] font-medium text-inkt"><Kalender className="size-4"/>Agenda</button>}
    <div className="min-h-0 flex-1 overflow-y-auto">
      <BewaarScherm actief={deel==="vandaag"} naam="Vandaag">
        <div className="px-6 pt-2">
          <EersteStappen naarAssistent={() => ga("assistent")} bewaard={(data) => setStaat({ ...staat, data })} />
        </div>
        <Vandaag ingebed staat={staat} setStaat={setStaat} ga={ga} vernieuw={vernieuw} vraag={vraag} naarProject={naarProject} naarInstellingen={()=>ga("instellingen")} naarAssistent={()=>ga("assistent")}/>
      </BewaarScherm>
      <BewaarScherm actief={deel==="agenda"} naam="Agenda"><Suspense fallback={<Laden tekst="Agenda laden…" />}><Agenda ingebed staat={staat} setStaat={setStaat}/></Suspense></BewaarScherm>
    </div>
  </section>;
}
