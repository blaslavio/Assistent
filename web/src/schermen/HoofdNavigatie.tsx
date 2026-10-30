import { useRef, useState } from "react";
import type { Tab } from "../App";
import { Ballon, Kalender, Meer, Projectmap, Tandwiel, Vonk, Zon } from "../iconen";
const HOOFD=[{id:"vandaag",naam:"Vandaag",Icoon:Zon},{id:"chat",naam:"Chat",Icoon:Ballon},{id:"projecten",naam:"Projecten",Icoon:Projectmap}] as const;
const EXTRA=[{id:"agenda",naam:"Agenda",Icoon:Kalender},{id:"assistent",naam:"Assistent",Icoon:Vonk},{id:"instellingen",naam:"Instellingen",Icoon:Tandwiel}] as const;
export default function HoofdNavigatie({actief,kies}:{actief:Tab;kies:(t:Tab)=>void}){
 const [meer,setMeer]=useState(false);const knop=useRef<HTMLButtonElement>(null);
 return <nav aria-label="Hoofdmenu" className="relative shrink-0 border-t border-lijn bg-white px-3 pt-2 pb-[max(env(safe-area-inset-bottom),12px)] dark:bg-[#0b0b0e]" onKeyDown={e=>{if(e.key==="Escape"&&meer){setMeer(false);knop.current?.focus();}}}>
   {meer&&<div className="mb-3 rounded-2xl border border-lijn bg-vlak p-2" aria-label="Meer onderdelen">{EXTRA.map(({id,naam,Icoon})=><button key={id} className="flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left" aria-current={actief===id?"page":undefined} onClick={()=>{setMeer(false);kies(id);}}><Icoon className="size-5"/>{naam}</button>)}</div>}
   <div className="grid grid-cols-4 gap-2">{HOOFD.map(({id,naam,Icoon})=><button key={id} aria-current={actief===id?"page":undefined} className={`flex min-h-12 flex-col items-center gap-1 text-xs ${actief===id?"font-semibold text-accent":"text-rustig"}`} onClick={()=>{setMeer(false);kies(id);}}><Icoon className="size-5"/>{naam}</button>)}
    <button ref={knop} aria-expanded={meer} aria-label="Meer onderdelen" className={`flex min-h-12 flex-col items-center gap-1 text-xs ${EXTRA.some(x=>x.id===actief)?"font-semibold text-accent":"text-rustig"}`} onClick={()=>setMeer(!meer)}><Meer className="size-5"/>Meer</button>
   </div>
 </nav>;
}
