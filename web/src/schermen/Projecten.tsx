import { useEffect, useRef, useState } from "react";
import { huidigeSessie } from "../api";
import type { Staat } from "../App";
import { overzicht, type Gesprek } from "../lib/chat";
export default function Projecten({staat,open,naarChat,ingebed}:{staat:Staat;open:(gesprek:number)=>void;naarChat:()=>void;ingebed?:boolean}){
 const [alle,setAlle]=useState(false);
 const [lijst,setLijst]=useState<Gesprek[]>([]),[zoek,setZoek]=useState(""),[bezig,setBezig]=useState(false),[fout,setFout]=useState("");const slot=useRef(false),actief=useRef(true);
 async function laden(){if(slot.current)return;slot.current=true;setBezig(true);setFout("");const sessie=huidigeSessie();
  try{if(!sessie)throw new Error();const r=await overzicht(false);if(!actief.current)return;if(huidigeSessie()!==sessie){setLijst([]);setFout("Je sessie is gewijzigd. Haal je werkruimtes opnieuw op.");return;}setLijst(r.gesprekken.filter(g=>g.status==="lid"));}
  catch{if(actief.current&&huidigeSessie()===sessie)setFout("Je werkruimtes konden niet worden opgehaald. Probeer opnieuw.");}finally{slot.current=false;if(actief.current)setBezig(false);}
 }
 useEffect(()=>{actief.current=true;laden();const wissel=()=>{setLijst([]);setFout("Je sessie is gewijzigd. Haal je werkruimtes opnieuw op.");};window.addEventListener("assistent-sessie",wissel);return()=>{actief.current=false;window.removeEventListener("assistent-sessie",wissel);};},[]);
 const naam=(g:Gesprek)=>g.naam||g.leden.filter(l=>l.id!==staat.gebruiker.id&&l.status==="lid").map(l=>l.naam).join(", ")||"Gesprek";
 const zichtbaar=lijst.filter(g=>naam(g).toLocaleLowerCase("nl").includes(zoek.trim().toLocaleLowerCase("nl")));
 return <section className={`flex flex-col gap-4 px-6 pb-6 ${ingebed?"pt-1":"pt-14"}`} aria-label="Projecten">{!ingebed&&<header><h1 className="text-[32px] font-bold">Projecten</h1><p className="mt-2 text-rustig">Werk samen vanuit een gesprek. Kies een werkruimte om het doel, de volgende stap en bestanden te bekijken.</p></header>}
   {lijst.length>6&&<input type="search" aria-label="Zoek een werkruimte" placeholder="Zoek een project" value={zoek} onChange={e=>{setZoek(e.target.value);setAlle(false);}} className="min-h-11 w-full rounded-full bg-vlak px-4"/>}
   {fout&&<div role="alert"><p>{fout}</p><button disabled={bezig} onClick={laden} className="min-h-11 text-accent">Opnieuw proberen</button></div>}{bezig&&<p role="status">Werkruimtes ophalen…</p>}
   {!bezig&&!fout&&!lijst.length&&<div className="rounded-2xl bg-vlak p-5"><p className="font-medium">Je eerste project begint met een gesprek.</p><p className="mt-2 text-sm">Open of start een chat en kies daar de projectwerkruimte.</p><button onClick={naarChat} className="mt-3 min-h-11 rounded-xl bg-accent px-4 text-white">Open Chat</button></div>}
   {!bezig&&!fout&&lijst.length>0&&!zichtbaar.length&&<p>Geen werkruimte gevonden. Probeer een andere naam.</p>}
   <ul className="flex flex-col gap-3">{(alle?zichtbaar:zichtbaar.slice(0,6)).map(g=><li key={g.id} className="rounded-2xl border border-lijn p-4"><p className="font-semibold break-words">{naam(g)}</p><p className="text-sm text-rustig">{g.soort==="groep"?"Groepswerkruimte":"Samen werken"}{g.alleen_beheer&&!g.beheerder?" · alleen lezen":""}{g.verdwijnen?" · verdwijnende berichten staan aan":""}</p><button className="mt-2 min-h-11 text-accent" onClick={()=>open(g.id)}>Open werkruimte</button></li>)}</ul>
   {zichtbaar.length>6&&<button className="min-h-11 text-accent" aria-expanded={alle} onClick={()=>setAlle(!alle)}>{alle?"Toon zes werkruimtes":`Bekijk alle ${zichtbaar.length} werkruimtes`}</button>}
 </section>;
}
