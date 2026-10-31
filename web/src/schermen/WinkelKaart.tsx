import type { Staat } from "../App";
import { huidigeSessie,type Gegevens } from "../api";
import { kaartContextLezen,agendaPlekOpenen } from "../lib/naar";
import { BRON_LABELS } from "../lib/kaartverbinding";
import { geldigPunt,leesPlekken,schatReistijd } from "../lib/kaartkompas";
import KaartKompas,{plekOpKaart} from "./KaartKompas";
import { useEffect,useMemo,useRef,useState } from "react";
import { Kalender,KaartVouw,Slot,Zoek,Fiets } from "../iconen";
import { Kaart } from "./Kaart";
import { STANDAARD,afstand,afstandTekst,routeLink,samenvoegen,winkelsInBuurt,zoekPlek,type KaartWinkel,type Punt,type RouteApp,type Reiswijze } from "../lib/kaart";
export type AppWinkel={adres:string;naam:string;lat?:number|null;lon?:number|null;producten?:number;winkeladres?:string};
const knop="min-h-11 rounded-full bg-vlak px-4 py-2 text-[13px] font-medium disabled:opacity-40";
const WIJZEN:[Reiswijze,string][]=[["lopen","Lopen"],["fiets","Fiets"],["ov","OV"],["auto","Auto"]];
function WijzeIcoon({wijze}:{wijze:Reiswijze}){return wijze==="fiets"?<Fiets className="size-4"/>:<svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{wijze==="lopen"?<><circle cx="13" cy="4" r="2"/><path d="m7 21 3-7m3-5 2 5 4 2M7 11l5-4 1 7 3 7"/></>:wijze==="ov"?<><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 12h14M8 22l2-3m6 3-2-3M8 6h8"/></>:<><path d="m4 11 2-6h12l2 6v8H4zM4 11h16M7 19v3m10-3v3M7 15h2m6 0h2"/></>}</svg>;}
export function WinkelKaart({winkels,thuisadres,open,staat,setData}:{winkels:AppWinkel[];thuisadres?:string;open:(adres:string)=>void;staat:Staat;setData:(g:Gegevens)=>void}){
 const [context]=useState(kaartContextLezen),[herkomst,setHerkomst]=useState(context);
 const [midden,setMidden]=useState<Punt>(context?.punt??STANDAARD),[ik,setIk]=useState<Punt|null>(null),[thuis,setThuis]=useState<Punt|null>(null),[vertrek,setVertrek]=useState<Punt|null>(null);
 const [osm,setOsm]=useState<KaartWinkel[]>([]),[gekozen,setGekozen]=useState<KaartWinkel|null>(context?.punt?{...context.punt,naam:context.titel,adres:context.adres,app:false,prive:true,soort:BRON_LABELS[context.bron]}:null);
 const [zoek,setZoek]=useState(context?.adres??""),[bezig,setBezig]=useState(false),[melding,setMelding]=useState("");
 const [routeApp,setRouteApp]=useState<RouteApp>(()=>/iPad|iPhone|iPod/.test(navigator.userAgent)?"apple":"google"),[reiswijze,setReiswijze]=useState<Reiswijze>("auto");
 const [laag,setLaag]=useState<"alles"|"eigen"|"winkels">("alles");
 const [sessieVeranderd,setSessieVeranderd]=useState(false);
 const actief=useRef(true),account=useRef(huidigeSessie()),slot=useRef(false);
 const geldig=()=>actief.current&&huidigeSessie()===account.current;
 useEffect(()=>{actief.current=true;const wis=()=>{if(huidigeSessie()!==account.current){setSessieVeranderd(true);setGekozen(null);setZoek("");setHerkomst(null);setIk(null);setThuis(null);setVertrek(null);setOsm([]);setMidden(STANDAARD);setMelding("Je sessie is gewijzigd. Open de kaart opnieuw.");}};window.addEventListener("assistent-sessie",wis);return()=>{actief.current=false;window.removeEventListener("assistent-sessie",wis);};},[]);
 const app=useMemo(()=>winkels.flatMap((w):KaartWinkel[]=>w.lat!=null&&w.lon!=null&&geldigPunt({lat:w.lat,lon:w.lon})?[{lat:w.lat,lon:w.lon,naam:w.naam,soort:"Winkel in de app",adres:w.winkeladres||w.adres,app:true,producten:w.producten,winkelAdres:w.adres}]:[]),[winkels]);
 const oorsprong=vertrek??ik??thuis;
 const alle=useMemo(()=>samenvoegen(app,osm.filter(geldigPunt),oorsprong??midden),[app,osm,oorsprong,midden]);
 const eigen=useMemo(()=>{try{if(sessieVeranderd)return [];return leesPlekken(staat.data).map(plekOpKaart);}catch{return[];}},[staat.data,sessieVeranderd]);
 const punten=useMemo(()=>{const lijst=laag==="eigen"?[...eigen]:laag==="winkels"?[...alle]:[...alle,...eigen];if(gekozen&&!lijst.some(p=>p===gekozen||(p.plekId&&p.plekId===gekozen.plekId)))lijst.push(gekozen);return lijst;},[laag,eigen,alle,gekozen]);
 const wijze=routeApp==="waze"?"auto":reiswijze;
 const indicatie=oorsprong&&gekozen?schatReistijd(oorsprong,gekozen,wijze):null;
 function kiesPunt(p:KaartWinkel){setGekozen(p);setMidden({lat:p.lat,lon:p.lon});setHerkomst(null);}
 async function doe(werk:()=>Promise<void>){if(slot.current||!geldig())return;slot.current=true;setBezig(true);setMelding("");try{await werk();}catch{if(geldig())setMelding("Ophalen lukt niet. Je kunt de kaart en je bestaande bestemmingen blijven gebruiken.");}finally{slot.current=false;if(geldig())setBezig(false);}}
 function bijMij(){if(!navigator.geolocation){setMelding("Je locatie is niet beschikbaar. Kies zelf een vertrekpunt.");return;}navigator.geolocation.getCurrentPosition(p=>{if(!geldig())return;const plek={lat:p.coords.latitude,lon:p.coords.longitude};if(!geldigPunt(plek)){setMelding("Geen geldige locatie ontvangen.");return;}setIk(plek);setVertrek(null);setMidden(plek);},()=>{if(geldig())setMelding("Locatie delen is niet gelukt. Kies een plek op de kaart.");},{timeout:8000,maximumAge:30000});}
 return <section className="flex flex-col gap-3 text-sm" aria-label="Assistent-kaart en bestemmingen">
  <form className="flex items-center gap-2 rounded-2xl border border-lijn bg-white p-2 shadow-sm dark:bg-[#1c1c21]" onSubmit={e=>{e.preventDefault();if(!zoek.trim())return;const vraag=zoek.trim();doe(async()=>{const p=await zoekPlek(vraag);if(!geldig())return;if(!p){setMelding("Geen bestemming gevonden. Voeg een plaats of land toe.");return;}setMidden(p);setGekozen({...p,naam:herkomst&&vraag===herkomst.adres?herkomst.titel:vraag.slice(0,120),adres:vraag,soort:"Eigen bestemming",app:false,prive:true});if(vraag!==herkomst?.adres)setHerkomst(null);});}}>
   <Zoek className="ml-2 size-5 shrink-0 text-rustig"/><input aria-label="Zoek bestemming wereldwijd" value={zoek} onChange={e=>setZoek(e.target.value)} maxLength={300} placeholder="Waar wil je heen?" className="h-11 min-w-0 flex-1 bg-transparent outline-none"/>
   <button disabled={bezig||!zoek.trim()} className="min-h-11 rounded-full bg-accent px-4 text-[13px] font-medium text-white disabled:opacity-40">{bezig?"Even…":"Zoek"}</button>
  </form>
  {herkomst&&<p className="px-1 text-xs text-rustig">{BRON_LABELS[herkomst.bron]} · {herkomst.titel}{!herkomst.punt?". Het adres staat klaar; pas na Zoek wordt het opgezocht.":". De bekende kaartplek staat klaar."}</p>}
  <div className="flex flex-wrap gap-2" aria-label="Kaartlagen">{([["alles","Alles"],["eigen","Mijn plekken"],["winkels","Winkels"]] as const).map(([k,t])=><button key={k} className={`${knop} ${laag===k?"ring-2 ring-accent":""}`} aria-pressed={laag===k} onClick={()=>setLaag(k)}>{t}</button>)}<button className={knop} onClick={bijMij}>Bij mij</button></div>
  <Kaart midden={midden} zet={setMidden} punten={punten} gekozen={gekozen} kies={kiesPunt} ik={ik} vanaf={oorsprong}/>
  {gekozen?<article aria-label="Gekozen bestemming" className="flex flex-col gap-3 rounded-3xl border border-lijn bg-white p-4 shadow-sm dark:bg-[#1c1c21]">
   <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-vlak text-accent"><KaartVouw className="size-5"/></span><div className="min-w-0 flex-1"><h2 className="text-[15px] font-semibold break-words">{gekozen.naam}</h2><p className="mt-1 text-xs text-rustig">{gekozen.app?"Winkel in de app":gekozen.prive?"Privébestemming": "OpenStreetMap-plek"}{oorsprong?` · ${afstandTekst(afstand(oorsprong,gekozen))} hemelsbreed`:" · vertrekpunt nog niet gekozen"}</p></div></div>
   <div className="grid grid-cols-4 gap-1" aria-label="Vervoermiddel">{WIJZEN.map(([k,t])=><button key={k} className={`${knop} flex flex-col items-center gap-1 px-1 ${wijze===k?"ring-2 ring-accent":""}`} aria-pressed={wijze===k} onClick={()=>{setReiswijze(k);if(routeApp==="waze"&&k!=="auto")setRouteApp("google");}}><WijzeIcoon wijze={k}/>{t}</button>)}</div>
   <p className="rounded-xl bg-vlak p-3 text-[13px]">{indicatie?`Automatische indicatie: ${indicatie.laag}–${indicatie.hoog} minuten. Geen live verkeer of wegroute.`:"Kies je vertrekpunt via Bij mij of de routeplanner voor een automatische reistijdindicatie."}</p>
   <a href={routeLink(gekozen,routeApp,wijze)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-4 text-[13px] font-semibold text-white">Start navigeren · {routeApp==="apple"?"Apple":routeApp==="google"?"Google":"Waze"}</a>
   <div className="flex flex-wrap gap-2"><button className={`${knop} flex items-center gap-2`} onClick={()=>agendaPlekOpenen(gekozen.naam,gekozen)}><Kalender className="size-4"/>Afspraak hier plannen</button>{gekozen.app&&gekozen.winkelAdres&&<button className={knop} onClick={()=>open(gekozen.winkelAdres!)}>Winkel bekijken</button>}</div>
   <details><summary className="min-h-11 cursor-pointer py-2 text-[13px] text-rustig">Navigatie en gegevensdeling</summary><label className="flex flex-col gap-2 text-[13px]">Navigatie-app<select aria-label="Navigatie-app" value={routeApp} onChange={e=>setRouteApp(e.target.value as RouteApp)} className="min-h-11 rounded-xl bg-vlak px-3"><option value="google">Google Maps</option><option value="apple">Apple Kaarten</option><option value="waze">Waze (auto)</option></select></label><p className="mt-2 text-xs text-rustig">De navigatie-app ontvangt de gekozen coördinaten en berekent de echte route. Privélabels worden niet meegestuurd. Openingstijden en bereikbaarheid zijn hier niet live gecontroleerd.</p></details>
  </article>:<p className="px-1 text-[13px] text-rustig">Zoek een adres of tik op een plek in de kaart. Het kaartmidden is geen bekende locatie van jou.</p>}
  {melding&&<p role="status" className="rounded-xl bg-vlak p-3 text-[13px]">{melding}</p>}
  <details className="rounded-2xl border border-lijn p-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 text-[15px] font-medium"><Slot className="size-5 text-rustig"/>Mijn plekken en routeplanner</summary>{!sessieVeranderd&&<KaartKompas reiswijze={wijze} staat={staat} setData={setData} gekozen={gekozen} vanaf={oorsprong} kies={kiesPunt} vertrekGewijzigd={setVertrek}/>}</details>
  <details className="rounded-2xl border border-lijn p-3"><summary className="min-h-11 cursor-pointer py-2 text-[15px] font-medium">Winkels en vertrekopties</summary>
   <div className="flex flex-wrap gap-2"><button className={knop} disabled={bezig} onClick={()=>doe(async()=>{const l=await winkelsInBuurt(midden);if(geldig()){setOsm(l.filter(geldigPunt));setLaag("winkels");setMelding(`${l.length} plekken gevonden in het gekozen zoekgebied. Verschuiven start geen nieuwe zoekopdracht.`);}})}>Zoek winkels in dit gebied</button>
   {thuisadres&&<button className={knop} disabled={bezig} onClick={()=>doe(async()=>{const p=await zoekPlek(thuisadres);if(!geldig())return;if(p){setThuis(p);setVertrek(null);setMidden(p);}else setMelding("Thuisadres niet gevonden. Kies zelf een vertrekplek.");})}>Gebruik thuisadres als vertrekpunt</button>}</div>
   <p className="mt-2 text-xs text-rustig">Winkels zoeken deelt het kaartmidden met OpenStreetMap. Je thuisadres wordt pas opgezocht wanneer je die knop gebruikt.</p>
   <ul className="mt-2 divide-y divide-lijn">{alle.slice(0,12).map((w,i)=><li key={`${w.naam}-${i}`}><button className="flex min-h-11 w-full items-center gap-2 text-left text-[13px]" onClick={()=>kiesPunt(w)}><span className="min-w-0 flex-1 truncate">{w.naam}</span><span className="text-xs text-rustig">{oorsprong?afstandTekst(afstand(oorsprong,w)):w.soort}</span></button></li>)}</ul>
  </details>
  <p className="px-1 text-xs text-rustig">Eigen bediening en planning op MapLibre/OpenFreeMap. De kaartdienst ontvangt het bekeken kaartgebied.</p>
 </section>;
}
