import { useId, useRef, useState } from "react";
const HOOFD=["Overzicht","Bord","Checklist"];
export const PROJECT_LABELS:Record<string,string>={Overzicht:"Overzicht",Bord:"Stappen",Checklist:"Checklist",Voorstel:"Toevoegen",Hoe:"Aanpak",Wanneer:"Planning",Als:"Voorwaarden",Werkdruk:"Werkdruk",Wijzigingen:"Wijzigingen",Oefenen:"Oefenen",Overdracht:"Overdracht",Privacy:"Privacy",Assistent:"Assistent"};
const EXTRA=["Voorstel","Hoe","Wanneer","Als","Werkdruk","Wijzigingen","Oefenen","Overdracht","Privacy","Assistent"];
export default function ProjectNavigatie({deel,kies,wijzigingen}:{deel:string;kies:(d:string)=>void;wijzigingen:number}){
 const [meer,setMeer]=useState(false),[zoek,setZoek]=useState("");const knop=useRef<HTMLButtonElement>(null),id=useId();
 const kiezen=(d:string)=>{kies(d);setMeer(false);setZoek("");};
 return <nav aria-label="Projectonderdelen" className="my-3" onKeyDown={e=>{if(e.key==="Escape"&&meer){setMeer(false);setZoek("");knop.current?.focus();}}}>
  <div className="grid grid-cols-4 gap-1">{HOOFD.map(d=><button key={d} aria-pressed={deel===d} className={`min-h-11 rounded-xl px-1 text-sm ${deel===d?"bg-accent text-white":"bg-vlak"}`} onClick={()=>kiezen(d)}>{PROJECT_LABELS[d]}</button>)}
   <button ref={knop} aria-label="Meer projectmogelijkheden" aria-expanded={meer} aria-controls={id} className="min-h-11 rounded-xl bg-vlak px-1 text-sm" onClick={()=>setMeer(!meer)}>Meer</button>
  </div>
  {!HOOFD.includes(deel)&&<p className="mt-2 text-sm text-rustig">Geopend: {PROJECT_LABELS[deel]??deel}{deel==="Wijzigingen"?` (${wijzigingen})`:""}</p>}
  {meer&&<section id={id} aria-label="Meer projectmogelijkheden" className="mt-2 rounded-xl border border-lijn p-3">
   <label>Zoek een projectfunctie<input type="search" value={zoek} onChange={e=>setZoek(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-vlak p-2"/></label>
   <div className="mt-2 flex flex-wrap gap-2">{EXTRA.filter(d=>PROJECT_LABELS[d].toLocaleLowerCase("nl").includes(zoek.trim().toLocaleLowerCase("nl"))).map(d=><button key={d} aria-pressed={deel===d} className="min-h-11 rounded-xl bg-vlak px-3" onClick={()=>kiezen(d)}>{PROJECT_LABELS[d]}{d==="Wijzigingen"?` (${wijzigingen})`:""}</button>)}</div>
   {EXTRA.every(d=>!PROJECT_LABELS[d].toLocaleLowerCase("nl").includes(zoek.trim().toLocaleLowerCase("nl")))&&<p className="mt-2 text-sm">Geen functie gevonden. Probeer een ander woord.</p>}
  </section>}
 </nav>;
}
