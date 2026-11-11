import { useId, useRef, useState } from "react";
import { Bel, Envelop, Kalender, Lijstje, Stemmen } from "../iconen";
export type AgendaPaneel = "mail" | "taken" | "herinneringen" | "prikken" | "evenementen" | "vakanties";
export const AGENDA_ONDERDELEN: {id:AgendaPaneel;naam:string;groep:string;icoon:typeof Kalender;zoek:string}[] = [
  {id:"taken",naam:"Taken",groep:"Dagelijks",icoon:Lijstje,zoek:"doen lijst deadline"},
  {id:"prikken",naam:"Datum prikken",groep:"Plannen en organiseren",icoon:Stemmen,zoek:"samen stemmen moment"},
  {id:"evenementen",naam:"Evenementen",groep:"Plannen en organiseren",icoon:Kalender,zoek:"feest groep organiseren deelnemers"},
  {id:"vakanties",naam:"Vakantie en verblijf",groep:"Plannen en organiseren",icoon:Kalender,zoek:"reis woning huren verhuren reserveren"},
  {id:"mail",naam:"Mail",groep:"Berichten en herinneringen",icoon:Envelop,zoek:"email inbox post koppelen"},
  {id:"herinneringen",naam:"Herinneringen",groep:"Berichten en herinneringen",icoon:Bel,zoek:"melding alarm onthouden"},
];
export default function AgendaNavigatie({actief,kies,tellingen={},onMeerChange}:{actief:AgendaPaneel|null;kies:(p:AgendaPaneel|null)=>void;tellingen?:Partial<Record<AgendaPaneel,number>>;onMeerChange?:(open:boolean)=>void}) {
  const [meer,setMeer]=useState(false),[zoek,setZoek]=useState("");
  const knop=useRef<HTMLButtonElement>(null),id=useId();
  const extra=AGENDA_ONDERDELEN.filter(x=>x.id!=="taken");
  const resultaten=extra.filter(x=>`${x.naam} ${x.groep} ${x.zoek}`.toLocaleLowerCase("nl").includes(zoek.trim().toLocaleLowerCase("nl")));
  const aantal=extra.reduce((n,x)=>n+(tellingen[x.id]??0),0);
  const sluit=()=>{setMeer(false);onMeerChange?.(false);setZoek("");};
  const kiezen=(p:AgendaPaneel|null)=>{kies(p);sluit();};
  const badge=(n:number)=>n>0?<span className="ml-1 rounded-full bg-accent px-1.5 text-xs text-white">{n>99?"99+":n}</span>:null;
  const stijl=(aan:boolean)=>`flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full px-2 text-sm font-medium ${aan?"bg-inkt text-white dark:text-black":"bg-vlak text-rustig"}`;
  return <nav aria-label="Onderdelen van je agenda" onKeyDown={e=>{if(e.key==="Escape"&&meer){e.stopPropagation();sluit();knop.current?.focus();}}}>
    <div className="grid grid-cols-3 gap-2">
      <button type="button" className={stijl(actief===null)} aria-current={actief===null?"page":undefined} onClick={()=>kiezen(null)}>Agenda</button>
      <button type="button" className={stijl(actief==="taken")} aria-current={actief==="taken"?"page":undefined} onClick={()=>kiezen("taken")}>Taken{badge(tellingen.taken??0)}</button>
      <button type="button" ref={knop} aria-label="Meer agenda-opties" aria-expanded={meer} aria-controls={id} className={stijl(meer||actief!==null&&actief!=="taken")} onClick={()=>{const next=!meer;setMeer(next);onMeerChange?.(next);if(meer)setZoek("");}}>Meer{badge(aantal)}</button>
    </div>
    {meer&&<section id={id} aria-label="Meer agenda-opties" className="mt-3 rounded-2xl border border-lijn p-4">
      <label className="text-sm">Zoek in je agenda<input type="search" value={zoek} onChange={e=>setZoek(e.target.value)} placeholder="Bijvoorbeeld vakantie of mail" className="mt-2 min-h-11 w-full rounded-xl bg-vlak px-3"/></label>
      {["Plannen en organiseren","Berichten en herinneringen"].map(groep=>{const items=resultaten.filter(x=>x.groep===groep);return !!items.length&&<section key={groep} className="mt-4"><h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-rustig">{groep}</h2>
        <ul>{items.map(({id,naam,icoon:Icoon})=><li key={id}><button type="button" aria-current={actief===id?"page":undefined} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-vlak" onClick={()=>{kiezen(id);knop.current?.focus();}}><Icoon className="size-5 shrink-0 text-rustig"/><span className="min-w-0 flex-1">{naam}</span>{badge(tellingen[id]??0)}</button></li>)}</ul>
      </section>;})}
      {!resultaten.length&&<p role="status" className="mt-4 text-sm text-rustig">Geen onderdeel gevonden. Probeer bijvoorbeeld vakantie, mail of een datum prikken.</p>}
    </section>}
  </nav>;
}
