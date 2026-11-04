import type { Staat } from "../App";
import { huidigeSessie,rpc,type Gegevens } from "../api";
import { kaartContextLezen,agendaPlekOpenen } from "../lib/naar";
import { BRON_LABELS } from "../lib/kaartverbinding";
import { geldigPunt,leesPlekken,schatReistijd } from "../lib/kaartkompas";
import KaartKompas,{plekOpKaart} from "./KaartKompas";
import { useEffect,useMemo,useRef,useState } from "react";
import { Kalender,KaartVouw,Slot,Zoek,Fiets,Terug,Kruis,Winkelpand,Huis,Ster } from "../iconen";
import { Onderblad } from "./Onderblad";
import { Kaart } from "./Kaart";
import { STANDAARD,afstand,afstandTekst,routeLink,samenvoegen,winkelsInBuurt,zoekPlek,type KaartWinkel,type Punt,type RouteApp,type Reiswijze } from "../lib/kaart";
export type AppWinkel={adres:string;naam:string;lat?:number|null;lon?:number|null;producten?:number;winkeladres?:string};
const knop="min-h-11 rounded-full bg-vlak px-4 py-2 text-[13px] font-medium disabled:opacity-40";
const glas="bg-white/90 shadow-lg ring-1 ring-black/5 backdrop-blur-md dark:bg-[#1c1c21]/90 dark:ring-white/10";
const chipje=(aan:boolean)=>`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium ${glas} ${aan?"!bg-accent text-white":""}`;
const WIJZEN:[Reiswijze,string][]=[["lopen","Lopen"],["fiets","Fiets"],["ov","OV"],["auto","Auto"]];
function WijzeIcoon({wijze}:{wijze:Reiswijze}){return wijze==="fiets"?<Fiets className="size-4"/>:<svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">{wijze==="lopen"?<><circle cx="13" cy="4" r="2"/><path d="m7 21 3-7m3-5 2 5 4 2M7 11l5-4 1 7 3 7"/></>:wijze==="ov"?<><rect x="5" y="3" width="14" height="16" rx="3"/><path d="M5 12h14M8 22l2-3m6 3-2-3M8 6h8"/></>:<><path d="m4 11 2-6h12l2 6v8H4zM4 11h16M7 19v3m10-3v3M7 15h2m6 0h2"/></>}</svg>;}
/** De kaart als eigen app: schermvullend, met zwevende zoekbalk en een blad onderin voor de gekozen plek. */
export function WinkelKaart({winkels:gegeven,thuisadres,open,staat,setData,terug,terugNaam="Terug"}:{winkels?:AppWinkel[];thuisadres?:string;open:(adres:string)=>void;staat:Staat;setData:(g:Gegevens)=>void;terug?:()=>void;terugNaam?:string}){
 const [geladen,setGeladen]=useState<AppWinkel[]>([]);
 useEffect(()=>{if(gegeven)return;rpc<AppWinkel[]>("winkels_zoeken",{p_zoekterm:""}).then(w=>setGeladen(Array.isArray(w)?w:[])).catch(()=>{});},[gegeven]);
 const winkels=gegeven??geladen;
 const [groot,setGroot]=useState(false),[planner,setPlanner]=useState(false);
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
 function zoekNu(e:React.FormEvent){e.preventDefault();if(!zoek.trim())return;const vraag=zoek.trim();(document.activeElement as HTMLElement|null)?.blur();doe(async()=>{const p=await zoekPlek(vraag);if(!geldig())return;if(!p){setMelding("Geen bestemming gevonden. Voeg een plaats of land toe.");return;}setMidden(p);setGekozen({...p,naam:herkomst&&vraag===herkomst.adres?herkomst.titel:vraag.slice(0,120),adres:vraag,soort:"Eigen bestemming",app:false,prive:true});if(vraag!==herkomst?.adres)setHerkomst(null);});}
 const zoekHier=()=>doe(async()=>{const l=await winkelsInBuurt(midden);if(geldig()){setOsm(l.filter(geldigPunt));setLaag("winkels");setMelding(l.length?`${l.length} plekken in dit gebied.`:"Geen winkels in dit gebied gevonden.");}});
 const thuisVertrek=()=>doe(async()=>{if(!thuisadres)return;const p=await zoekPlek(thuisadres);if(!geldig())return;if(p){setThuis(p);setVertrek(null);setMidden(p);}else setMelding("Thuisadres niet gevonden. Kies zelf een vertrekplek.");});
 const lijst=(laag==="eigen"?eigen:laag==="winkels"?alle:[...eigen,...alle]).slice(0,10);
 return <section className="fixed inset-0 z-40 overflow-hidden bg-white text-sm dark:bg-[#16161a]" aria-label="Kaart">
  <Kaart vol midden={midden} zet={setMidden} punten={punten} gekozen={gekozen} kies={kiesPunt} ik={ik} vanaf={oorsprong}/>
  <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2.5 px-3 pt-[max(env(safe-area-inset-top),12px)]">
   <div className="pointer-events-auto flex items-center gap-2">
    {terug&&<button type="button" onClick={terug} aria-label={terugNaam} className={`flex size-12 shrink-0 items-center justify-center rounded-full ${glas}`}><Terug className="size-5"/></button>}
    <form className={`flex h-12 min-w-0 flex-1 items-center gap-2 rounded-full pl-4 pr-1.5 ${glas}`} onSubmit={zoekNu}>
     <Zoek className="size-5 shrink-0 text-rustig"/><input aria-label="Zoek bestemming wereldwijd" value={zoek} onChange={e=>setZoek(e.target.value)} maxLength={300} placeholder="Waar wil je heen?" enterKeyHint="search" className="h-full min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zacht"/>
     {zoek.trim()&&<button disabled={bezig} className="h-9 rounded-full bg-accent px-4 text-[13px] font-semibold text-white disabled:opacity-40">{bezig?"Even…":"Zoek"}</button>}
    </form>
    <button type="button" onClick={bijMij} aria-label="Bij mij" className={`flex size-12 shrink-0 items-center justify-center rounded-full text-accent ${glas}`}><svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden="true"><path d="M21 3 3 10.5l7.5 3 3 7.5z"/></svg></button>
   </div>
   <div className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1 [scrollbar-width:none]" aria-label="Kaartlagen">
    {([["alles","Alles",KaartVouw],["eigen","Mijn plekken",Ster],["winkels","Winkels",Winkelpand]] as const).map(([k,t,Icoon])=><button key={k} type="button" className={chipje(laag===k)} aria-pressed={laag===k} onClick={()=>setLaag(k)}><Icoon className="size-4"/>{t}</button>)}
    <button type="button" className={chipje(false)} disabled={bezig} onClick={zoekHier}><Zoek className="size-4"/>Zoek winkels in dit gebied</button>
   </div>
   {herkomst&&<p className={`pointer-events-auto self-start rounded-full px-3 py-1.5 text-xs ${glas}`}>{BRON_LABELS[herkomst.bron]} · {herkomst.titel}</p>}
   {melding&&<p role="status" className={`pointer-events-auto self-start rounded-2xl px-3 py-2 text-[13px] ${glas}`}>{melding}</p>}
  </div>
  <div className={`absolute inset-x-0 bottom-0 flex flex-col rounded-t-[28px] ${glas} !bg-white/95 dark:!bg-[#16161a]/95 pb-[max(env(safe-area-inset-bottom),16px)] transition-[max-height] duration-300 ${groot?"max-h-[85dvh]":"max-h-[46dvh]"}`}>
   <button type="button" onClick={()=>setGroot(g=>!g)} aria-label={groot?"Blad kleiner":"Blad groter"} className="flex h-6 shrink-0 items-center justify-center"><span className="h-1 w-10 rounded-full bg-lijn"/></button>
   <div className="flex flex-col gap-3 overflow-y-auto px-5 pb-2">
   {gekozen?<article aria-label="Gekozen bestemming" className="flex flex-col gap-3">
    <div className="flex items-start gap-3"><span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-accent/10 text-accent">{gekozen.app?<Winkelpand className="size-5"/>:<KaartVouw className="size-5"/>}</span>
     <div className="min-w-0 flex-1"><h2 className="text-[17px] font-semibold leading-tight break-words">{gekozen.naam}</h2><p className="mt-0.5 text-[13px] text-rustig">{gekozen.app?"Winkel in de app":gekozen.prive?"Privébestemming":gekozen.soort}{oorsprong?` · ${afstandTekst(afstand(oorsprong,gekozen))}`:""}</p></div>
     <button type="button" onClick={()=>setGekozen(null)} aria-label="Plek sluiten" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-vlak"><Kruis className="size-4"/></button></div>
    <div className="grid grid-cols-4 gap-1 rounded-2xl bg-vlak p-1" aria-label="Vervoermiddel">{WIJZEN.map(([k,t])=><button key={k} type="button" className={`flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-xl text-[12px] font-medium ${wijze===k?"bg-white text-accent shadow-sm dark:bg-[#26262b]":"text-rustig"}`} aria-pressed={wijze===k} onClick={()=>{setReiswijze(k);if(routeApp==="waze"&&k!=="auto")setRouteApp("google");}}><WijzeIcoon wijze={k}/>{t}</button>)}</div>
    <p className="text-[13px] text-rustig">{indicatie?<><span className="text-[15px] font-semibold text-inkt">{indicatie.laag}–{indicatie.hoog} min</span> · schatting, zonder live verkeer</>:"Tik op het pijltje rechtsboven voor een reistijd."}</p>
    <a href={routeLink(gekozen,routeApp,wijze)} target="_blank" rel="noreferrer" className="flex min-h-12 items-center justify-center rounded-full bg-accent px-4 text-[15px] font-semibold text-white">Start navigeren · {routeApp==="apple"?"Apple":routeApp==="google"?"Google":"Waze"}</a>
    <div className="-mx-5 flex gap-2 overflow-x-auto px-5 [scrollbar-width:none]">
     <button type="button" className={`${knop} flex shrink-0 items-center gap-2`} onClick={()=>agendaPlekOpenen(gekozen.naam,gekozen)}><Kalender className="size-4"/>Afspraak hier plannen</button>
     {gekozen.app&&gekozen.winkelAdres&&<button type="button" className={`${knop} flex shrink-0 items-center gap-2`} onClick={()=>open(gekozen.winkelAdres!)}><Winkelpand className="size-4"/>Winkel bekijken</button>}
     <button type="button" className={`${knop} flex shrink-0 items-center gap-2`} onClick={()=>setPlanner(true)}><Slot className="size-4"/>Bewaren en route</button>
    </div>
    <details><summary className="min-h-11 cursor-pointer py-2 text-[13px] text-rustig">Navigatie-app</summary><select aria-label="Navigatie-app" value={routeApp} onChange={e=>setRouteApp(e.target.value as RouteApp)} className="min-h-11 w-full rounded-xl bg-vlak px-3"><option value="google">Google Maps</option><option value="apple">Apple Kaarten</option><option value="waze">Waze (auto)</option></select><p className="mt-2 text-xs text-rustig">De navigatie-app krijgt alleen de coördinaten, niet je eigen naam voor de plek.</p></details>
   </article>:<>
    <div className="grid grid-cols-3 gap-2">
     <button type="button" onClick={bijMij} className="flex flex-col items-center gap-1 rounded-2xl bg-vlak py-3 text-[12px] font-medium"><svg viewBox="0 0 24 24" className="size-5 text-accent" fill="currentColor" aria-hidden="true"><path d="M21 3 3 10.5l7.5 3 3 7.5z"/></svg>Waar ben ik</button>
     <button type="button" onClick={thuisVertrek} disabled={!thuisadres||bezig} className="flex flex-col items-center gap-1 rounded-2xl bg-vlak py-3 text-[12px] font-medium disabled:opacity-40"><Huis className="size-5 text-accent"/>Vanaf thuis</button>
     <button type="button" onClick={()=>setPlanner(true)} className="flex flex-col items-center gap-1 rounded-2xl bg-vlak py-3 text-[12px] font-medium"><Slot className="size-5 text-accent"/>Routeplanner</button>
    </div>
    {lijst.length>0?<ul className="flex flex-col">{lijst.map((w,i)=><li key={`${w.plekId??w.naam}-${i}`}><button type="button" className="flex min-h-12 w-full items-center gap-3 border-b border-lijn text-left" onClick={()=>kiesPunt(w)}><span className={`size-2.5 shrink-0 rounded-full ${w.prive?"bg-teal-600":w.app?"bg-accent":"bg-slate-500"}`}/><span className="min-w-0 flex-1 truncate text-[15px]">{w.naam}</span><span className="text-xs text-rustig">{oorsprong?afstandTekst(afstand(oorsprong,w)):w.soort}</span></button></li>)}</ul>
     :<p className="py-1 text-[13px] text-rustig">Zoek een adres of tik op een plek. De kaart weet pas waar je bent als je op Bij mij tikt.</p>}
   </>}
   <p className="text-[11px] text-zacht">Kaart: MapLibre en OpenFreeMap. Winkels zoeken deelt alleen het kaartgebied met OpenStreetMap.</p>
   </div>
  </div>
  {planner&&<Onderblad titel="Mijn plekken en route" sluit={()=>setPlanner(false)}>{!sessieVeranderd&&<KaartKompas reiswijze={wijze} staat={staat} setData={setData} gekozen={gekozen} vanaf={oorsprong} kies={p=>{kiesPunt(p);setPlanner(false);}} vertrekGewijzigd={setVertrek}/>}</Onderblad>}
 </section>;
}
