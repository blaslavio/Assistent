import {lazy,Suspense,useEffect,useState} from "react";
import type {Staat} from "../App";
import {STUDIO_TOOLS,studioZoeken,ticketAdres,ticketAdresVerbruiken,type StudioVerzoek} from "../lib/studio";
import {instellingenOpenen,studioVerzoekBekijken,studioVerzoekLezen} from "../lib/naar";
import {Ballon,Kalender,Winkelpand,Tas,Slot,Terug,Zoek} from "../iconen";
const Winkel=lazy(()=>import("./MijnWinkel").then(m=>({default:m.MijnWinkel})));
const Product=lazy(()=>import("./Verkopen").then(m=>({default:m.Verkopen})));
const Bestellingen=lazy(()=>import("./Bestellingen"));
const Evenementen=lazy(()=>import("./Evenementen"));
const EventBouwer=lazy(()=>import("./EventBouwer"));
const Delen=lazy(()=>import("./StudioDelen"));
const Tickets=lazy(()=>import("./TicketDesk"));
export default function Studio({staat,vernieuw,terug}:{staat:Staat;vernieuw:()=>Promise<void>;terug:()=>void}){
 const [verzoek,setVerzoek]=useState<StudioVerzoek|null>(()=>{const vraag=studioVerzoekBekijken(),id=ticketAdres();return vraag??(id?{tool:"tickets",evenement:id}:null);}),[zoek,setZoek]=useState(""),[ronde,setRonde]=useState(0),[melding,setMelding]=useState("");
 useEffect(()=>{const eerste=studioVerzoekLezen(),ticket=ticketAdresVerbruiken();if(eerste)setVerzoek(eerste);else if(ticket)setVerzoek({tool:"tickets",evenement:ticket});const open=()=>{const p=studioVerzoekLezen();if(p){setVerzoek(p);setRonde(n=>n+1);setMelding("");}};window.addEventListener("studio-openen",open);return()=>window.removeEventListener("studio-openen",open);},[]);
 const open=(p:StudioVerzoek)=>{setVerzoek(p);setRonde(n=>n+1);setMelding("");};
 const gekozen=STUDIO_TOOLS.find(t=>t.id===verzoek?.tool),resultaten=studioZoeken(zoek);
 const groepen=[...new Set(STUDIO_TOOLS.map(t=>t.groep))],iconen=[Winkelpand,Tas,Kalender,Slot,Ballon];
 let inhoud:React.ReactNode=null;
 if(verzoek){const t=verzoek.tool;
  if(["winkel","ontwerp","voorbeeld","voorraad","levering","contact"].includes(t))inhoud=<Winkel start={t as "winkel"} bekijk={adres=>{import("../lib/mijnwinkel").then(m=>{m.winkelVragen(adres);import("../lib/naar").then(n=>n.naar({tab:"chat"}));});}}/>;
  else if(t==="product")inhoud=<><p className="text-sm text-rustig">Je maakt een product of dienst als aanbod. Kies daarna bij Producten en voorraad wat in je webshop staat.</p><button className="min-h-11 rounded-full bg-vlak px-4 text-sm" onClick={()=>setRonde(n=>n+1)}>Productformulier opnieuw openen</button><Product key={ronde} sluit={()=>setVerzoek(null)} geplaatst={()=>open({tool:"voorraad"})}/></>;
  else if(t==="bestellingen")inhoud=<Bestellingen/>;
  else if(t==="betalingen")inhoud=<><p className="text-sm text-rustig">Betalingen gebruiken dezelfde beveiligde betaalvoorziening als de rest van de app. Je opent hier de instellingen om die zelf te koppelen.</p><button className="min-h-11 rounded-full bg-accent px-4 text-sm text-white" onClick={()=>instellingenOpenen("betalingen")}>Open betaalinstellingen</button></>;
  else if(t==="deellinks")inhoud=<Delen/>;
  else if(t==="evenementen")inhoud=<Evenementen staat={staat} setStaat={()=>{void vernieuw();}}/>;
  else if(t==="event_maken")inhoud=<EventBouwer klaar={(groep,evenement)=>{open({tool:"tickets",groep,evenement});setMelding("Evenement opgeslagen. Stel nu je gratis ticketinschrijving in als je die wilt gebruiken.");}}/>;
  else inhoud=<Tickets key={`${ronde}:${verzoek.evenement??0}`} start={verzoek}/>;
 }
 const rijen=(tools:typeof resultaten)=><ul className="divide-y divide-lijn overflow-hidden rounded-2xl bg-vlak">{tools.map(t=><li key={t.id}><button onClick={()=>open({tool:t.id})} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left"><span className="min-w-0 flex-1"><span className="block text-[15px] font-medium">{t.naam}</span><span className="block text-[13px] text-rustig">{t.uitleg}</span></span><Terug className="size-4 shrink-0 rotate-180 text-rustig"/></button></li>)}</ul>;
 return <section aria-label="Studio" className="flex flex-col gap-4 px-6 pt-4 pb-8">
  <button onClick={()=>{if(verzoek){setVerzoek(null);setMelding("");}else terug();}} className="flex min-h-11 self-start items-center gap-1 text-sm text-accent"><Terug className="size-5"/>{verzoek?"Studio":"Werkruimte"}</button>
  <header><h1 className="text-2xl font-bold">{gekozen?.naam??"Studio"}</h1><p className="mt-1 text-[13px] text-rustig">{gekozen?.uitleg??"Winkel, evenementen en deellinks samen. Bouwen, verkopen en beheren."}</p></header>
  {melding&&<p role="status" className="rounded-xl bg-vlak p-3 text-sm">{melding}</p>}
  {verzoek?<Suspense fallback={<p role="status" className="text-sm text-rustig">Gereedschap laden…</p>}>{inhoud}</Suspense>:<>
   <label className="flex items-center gap-2 rounded-2xl bg-vlak px-3"><Zoek className="size-5 shrink-0 text-rustig"/><input type="search" value={zoek} maxLength={100} onChange={e=>setZoek(e.target.value)} placeholder="Zoek bijvoorbeeld ontwerp of scanner" aria-label="Zoek in Studio" className="h-12 min-w-0 flex-1 bg-transparent outline-none"/></label>
   {zoek.trim()?<>{rijen(resultaten)}{!resultaten.length&&<p role="status" className="text-sm text-rustig">Geen gereedschap gevonden. Probeer winkel, evenement, voorraad of tickets.</p>}</>:<>
    <div className="grid grid-cols-1 gap-2"><button className="flex min-h-14 items-center gap-3 rounded-2xl bg-accent px-4 text-left text-sm font-medium text-white" onClick={()=>open({tool:"winkel"})}><Winkelpand className="size-5"/>Winkel bouwen</button><button className="flex min-h-14 items-center gap-3 rounded-2xl bg-vlak px-4 text-left text-sm font-medium" onClick={()=>open({tool:"event_maken"})}><Kalender className="size-5 text-accent"/>Evenement bouwen</button><button className="flex min-h-14 items-center gap-3 rounded-2xl bg-vlak px-4 text-left text-sm font-medium" onClick={()=>open({tool:"scannen"})}><Slot className="size-5 text-accent"/>Tickets scannen</button></div>
    <button className="flex min-h-14 items-center gap-3 rounded-2xl bg-vlak px-4 text-left text-sm font-medium" onClick={()=>open({tool:"deellinks"})}><Ballon className="size-5 text-accent"/>Deellinks</button>
    <h2 className="text-xs font-semibold uppercase tracking-wide text-rustig">Alle gereedschappen · {STUDIO_TOOLS.length}</h2>
    {groepen.map((groep,i)=>{const Icoon=iconen[i];const tools=STUDIO_TOOLS.filter(t=>t.groep===groep);return <details key={groep} className="rounded-2xl border border-lijn p-3"><summary className="flex min-h-11 cursor-pointer items-center gap-2 py-2 text-[15px] font-medium"><Icoon className="size-5 text-accent"/>{groep}<span className="ml-auto text-xs text-rustig">{tools.length}</span></summary>{rijen(tools)}</details>;})}
   </>}
  </>}
 </section>;
}
