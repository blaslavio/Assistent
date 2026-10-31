import { lazy, Suspense, useEffect, useState } from "react";
import type { Staat } from "../App";
import { ONDERDELEN, type OnderdeelNaam } from "../lib/onderdeel-lijst";
import { kaartOpenen, winkelAppOpenen } from "../lib/naar";
import { KaartVouw, Projectmap, Tas, Terug, Zoek } from "../iconen";
import BewaarScherm from "./BewaarScherm";
const Onderdeel=lazy(()=>import("./Onderdelen").then(m=>({default:m.Onderdeel})));
const Projecten=lazy(()=>import("./Projecten"));
type Deel=OnderdeelNaam|"projecten"|null;
type Props={staat:Staat;vernieuw:()=>Promise<void>;vraag:(t:string)=>void;openProject:(id:number)=>void;naarChat:()=>void;start?:{naam:OnderdeelNaam;n:number}|null};
const UIT:Record<string,string>={notities:"Snel iets vastleggen",documenten:"Lezen, schrijven en bewaren",huishouden:"Samen thuis organiseren",leren:"Oefenen en ontwikkelen",boodschappen:"Wat je nog wilt halen",kooplijst:"Je aankopen voorbereiden",wenslijst:"Je ideeën bewaren",budget:"Je inkomsten en uitgaven",beleggen:"Je portefeuille en volglijst",sport:"Bewegen en je gezondheid",zakelijk:"Klanten, rooster en administratie"};
export default function Werkruimte({staat,vernieuw,vraag,openProject,naarChat,start}:Props){
 const [deel,setDeel]=useState<Deel>(start?.naam??null),[zoek,setZoek]=useState("");
 useEffect(()=>{if(start)setDeel(start.naam);},[start]);
 const persoonlijk=ONDERDELEN.filter(([id])=>id!=="zakelijk"),term=zoek.trim().toLocaleLowerCase("nl");
 const match=(id:string,naam:string)=>`${naam} ${UIT[id]??""}`.toLocaleLowerCase("nl").includes(term);
 const rijen=(items:typeof ONDERDELEN)=><ul className="divide-y divide-lijn overflow-hidden rounded-3xl bg-vlak">{items.map(([id,naam,Icoon])=><li key={id}><button onClick={()=>setDeel(id)} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white"><Icoon className="size-[18px]"/></span><span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{naam}</span><span className="block truncate text-[13px] text-rustig">{UIT[id]}</span></span><Terug className="size-4 rotate-180 text-rustig"/></button></li>)}</ul>;
 const hoofd=persoonlijk.filter(([id])=>["notities","documenten"].includes(id)),extra=persoonlijk.filter(([id])=>!["notities","documenten"].includes(id));
 const resultaten=ONDERDELEN.filter(([id,naam])=>match(id,naam)),projectMatch=match("projecten","Projecten samen werken gesprekken"),kaartMatch=match("kaart","Kaart routes locaties reizen"),winkelMatch=match("winkel","Winkel aanbod verkopen bestellingen");
 return <section className="h-full" aria-label="Werkruimte">
  <BewaarScherm actief={deel===null} naam="Werkruimte overzicht"><div className="flex flex-col gap-4 px-6 pt-4 pb-8">
   <header><h1 className="text-2xl font-bold">Werkruimte</h1><p className="mt-1 text-[13px] text-rustig">Je eigen apps en wat je samen doet.</p></header>
   <label className="flex items-center gap-2 rounded-2xl bg-vlak px-3"><Zoek className="size-5 shrink-0 text-rustig"/><input type="search" aria-label="Zoek in je werkruimte" placeholder="Zoek een app of project" value={zoek} onChange={e=>setZoek(e.target.value)} className="h-12 min-w-0 flex-1 bg-transparent outline-none"/></label>
   {(!term||projectMatch)&&<button onClick={()=>setDeel("projecten")} className="flex min-h-16 items-center gap-3 rounded-3xl bg-vlak px-4 py-3 text-left"><span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white"><Projectmap className="size-[18px]"/></span><span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">Projecten en samenwerken</span><span className="block text-[13px] text-rustig">Doelen, taken en bestanden bij je gesprekken</span></span><Terug className="size-4 rotate-180 text-rustig"/></button>}
   {term?<>{resultaten.length>0&&rijen(resultaten)}{!resultaten.length&&!projectMatch&&!kaartMatch&&!winkelMatch&&<p role="status" className="text-sm text-rustig">Niets gevonden. Probeer documenten, budget of projecten.</p>}</>:<><h2 className="text-xs font-semibold uppercase tracking-wide text-rustig">Voor jezelf</h2>{rijen(hoofd)}<details className="rounded-2xl border border-lijn p-3"><summary className="min-h-11 cursor-pointer py-2 text-[15px] font-medium">Meer persoonlijke apps</summary>{rijen(extra)}</details></>}
   {(!term||kaartMatch)&&<button onClick={kaartOpenen} className="flex min-h-12 items-center gap-3 rounded-2xl bg-vlak px-4 text-left text-[15px]"><KaartVouw className="size-5 text-accent"/>Kaart en routes</button>}
   {(!term||winkelMatch)&&<button onClick={winkelAppOpenen} className="flex min-h-12 items-center gap-3 rounded-2xl bg-vlak px-4 text-left text-[15px]"><Tas className="size-5 text-accent"/>Winkel en aanbod</button>}
   {!term&&<details className="rounded-2xl border border-lijn p-3"><summary className="min-h-11 cursor-pointer py-2 text-[15px] font-medium">Zakelijke opties</summary>{rijen(ONDERDELEN.filter(([id])=>id==="zakelijk"))}</details>}
  </div></BewaarScherm>
  <BewaarScherm actief={deel==="projecten"} naam="Samenwerken"><button onClick={()=>setDeel(null)} className="mx-4 mt-2 flex min-h-11 items-center gap-1 text-sm text-accent"><Terug className="size-5"/>Werkruimte</button><Suspense fallback={<p role="status" className="p-6">Projecten laden…</p>}><Projecten ingebed staat={staat} open={openProject} naarChat={naarChat}/></Suspense></BewaarScherm>
  {deel&&deel!=="projecten"&&<Suspense fallback={<p role="status" className="p-6">App laden…</p>}><Onderdeel key={deel} naam={deel} staat={staat} vernieuw={vernieuw} vraag={vraag} terug={()=>setDeel(null)} terugNaam="Werkruimte"/></Suspense>}
 </section>;
}
