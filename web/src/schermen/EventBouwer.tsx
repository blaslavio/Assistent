import {EVENT_TYPES} from "../lib/studio";
import {useEffect,useRef,useState} from "react";
import {overzicht,type Community} from "../lib/chat";
import {eventGegevens,eventMaken,type EventConcept} from "../lib/tickets";
import {datumTekst,plusDagen,nuTekst} from "../lib/tijd";
import {useStudioSessie} from "./useStudioSessie";
const veld="mt-1 min-h-11 w-full rounded-xl bg-vlak px-3 outline-none",knop="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40";

export default function EventBouwer({klaar}:{klaar:(groep:number,event:number)=>void}){
 const {geldig,vervallen}=useStudioSessie(),[groepen,setGroepen]=useState<Community[]>([]),[stap,setStap]=useState(1),[fout,setFout]=useState(""),[bezig,setBezig]=useState(false);
 const morgen=datumTekst(plusDagen(new Date(),1)),[p,setP]=useState<EventConcept>({event_type:"bijeenkomst",groep:0,titel:"",start:`${morgen}T14:00`,einde:`${morgen}T16:00`,plaats:"",notitie:""});
 const [voorbeeld,setVoorbeeld]=useState<EventConcept|null>(null),opdracht=useRef(crypto.randomUUID()),slot=useRef(false);
 useEffect(()=>{overzicht(false).then(r=>{if(geldig())setGroepen(r.communities.filter(c=>c.status==="lid"&&!c.herinnering));}).catch(()=>{if(geldig())setFout("Je groepen konden niet worden opgehaald.");});},[geldig]);
 const wijzig=(x:Partial<EventConcept>)=>setP(oud=>({...oud,...x}));
 async function bewaar(){if(!voorbeeld||slot.current||!geldig())return;slot.current=true;setBezig(true);setFout("");try{const r=await eventMaken(voorbeeld,opdracht.current);if(geldig())klaar(voorbeeld.groep,r.id);}catch(e){if(geldig())setFout(e instanceof Error?e.message:"Opslag is niet bevestigd. Probeer dezelfde opdracht opnieuw.");}finally{slot.current=false;if(geldig())setBezig(false);}}
 return <section aria-label="Evenement bouwen" className="flex flex-col gap-4">
  <p className="text-xs font-medium text-rustig">Stap {stap} van 3 · {stap===1?"Basis":stap===2?"Programma en locatie":"Controleren"}</p>
  {vervallen?<p role="alert">Je aanmelding is gewijzigd. Open de bouwer opnieuw.</p>:<>
  {stap===1&&<><p className="text-sm text-rustig">Kies een beginpunt. Je past alle teksten zelf aan. Bewaren maakt een evenement voor je groep; ticketinschrijving open je daarna apart.</p><label className="text-sm">Type evenement<select value={p.event_type} className={veld} onChange={e=>{const t=EVENT_TYPES.find(t=>t.id===e.target.value)!;const einde=new Date(p.start);if(Number.isFinite(einde.getTime())){einde.setHours(einde.getHours()+t.uren);wijzig({event_type:t.id,einde:nuTekst(einde)});}else wijzig({event_type:t.id});}}>{EVENT_TYPES.map(t=><option key={t.id} value={t.id}>{t.naam}</option>)}</select></label>
   <label className="text-sm">Groep<select value={p.groep||""} onChange={e=>wijzig({groep:Number(e.target.value)})} className={veld}><option value="">Kies een groep</option>{groepen.map(g=><option key={g.id} value={g.id}>{g.naam}</option>)}</select></label>
   {!groepen.length&&<p className="text-xs text-rustig">Je hebt een groep nodig om samen te organiseren. Je kunt die in Chat maken.</p>}
   <label className="text-sm">Naam evenement<input maxLength={120} value={p.titel} onChange={e=>wijzig({titel:e.target.value})} className={veld}/></label><button disabled={!p.groep||!p.titel.trim()} className={knop} onClick={()=>setStap(2)}>Verder naar programma</button>
  </>}
  {stap===2&&<><label className="text-sm">Begin<input type="datetime-local" value={p.start} onChange={e=>wijzig({start:e.target.value})} className={veld}/></label><label className="text-sm">Einde<input type="datetime-local" value={p.einde} onChange={e=>wijzig({einde:e.target.value})} className={veld}/></label><label className="text-sm">{p.event_type==="online"?"Platform of deelnamelink":"Locatie"}<input maxLength={200} value={p.plaats} onChange={e=>wijzig({plaats:e.target.value})} className={veld}/></label><label className="text-sm">Programma en praktische informatie<textarea rows={5} maxLength={1000} value={p.notitie} onChange={e=>wijzig({notitie:e.target.value})} className={veld+" py-3"}/></label><button className={knop} onClick={()=>{try{eventGegevens(p);setVoorbeeld({...p});setFout("");setStap(3);}catch(e){setFout((e as Error).message);}}}>Bekijk het voorbeeld</button><button className="min-h-11 text-sm text-accent" onClick={()=>setStap(1)}>Terug naar basis</button></>}
  {stap===3&&voorbeeld&&<><article className="rounded-2xl bg-vlak p-4"><h3 className="text-lg font-semibold break-words">{voorbeeld.titel}</h3><p className="mt-2 text-sm">{EVENT_TYPES.find(t=>t.id===voorbeeld.event_type)?.naam}</p><p className="mt-2 text-sm">{groepen.find(g=>g.id===voorbeeld.groep)?.naam}</p><p className="mt-2 text-sm">{new Date(voorbeeld.start).toLocaleString("nl-NL")} – {new Date(voorbeeld.einde).toLocaleString("nl-NL")}</p><p className="mt-2 text-sm">{voorbeeld.plaats||"Locatie volgt"}</p><p className="mt-2 whitespace-pre-wrap break-words text-sm">{voorbeeld.notitie}</p></article><p className="text-xs text-rustig">Na bevestiging staat dit in de groepsagenda. Er wordt niets betaald en de ticketinschrijving blijft gesloten totdat je die instelt.</p><button disabled={bezig} className={knop} onClick={bewaar}>{bezig?"Evenement bewaren…":"Bevestig evenement"}</button><button disabled={bezig} className="min-h-11 text-sm text-accent" onClick={()=>setStap(2)}>Terug naar aanpassen</button></>}
  </>}{fout&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
 </section>;
}
