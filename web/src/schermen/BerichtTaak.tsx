import {useEffect,useRef,useState} from "react";
import {bijwerken,huidigeSessie,type Gegevens} from "../api";
import type {Staat} from "../App";
import {chatBronLezen,type Regel} from "../lib/chat";
import {berichtTaakBewaren,berichtTaakVoorstel,type BerichtTaak as Voorstel} from "../lib/berichttaak";
export default function BerichtTaak({gesprek,regel,staat,setData,sluit}:{gesprek:number;regel:Regel;staat:Staat;setData:(data:Gegevens)=>void;sluit:()=>void}){
 const tekst=regel.bericht?.t==="tekst"?String(regel.bericht.tekst):"";
 const [titel,setTitel]=useState(tekst.replace(/\s+/g," ").trim().slice(0,160)),[dag,setDag]=useState("");
 const [voorstel,setVoorstel]=useState<Voorstel|null>(null),[bezig,setBezig]=useState(false),[fout,setFout]=useState(""),[klaar,setKlaar]=useState(false);
 const vak=useRef<HTMLElement>(null),slot=useRef(false),actief=useRef(true),account=useRef(huidigeSessie());
 useEffect(()=>{actief.current=true;vak.current?.scrollIntoView?.({block:"nearest"});vak.current?.focus({preventScroll:true});return()=>{actief.current=false;};},[]);
 const geldig=()=>actief.current&&huidigeSessie()===account.current;
 async function bewaren(){if(!voorstel||slot.current)return;if(!geldig()){if(actief.current)setFout("Je aanmelding is gewijzigd. Open het taakvoorstel opnieuw.");return;}slot.current=true;setBezig(true);setFout("");
  try{const vers=await chatBronLezen(gesprek,regel.id);if(!geldig())return;if(vers.tekst!==tekst)throw new Error("Het bericht is gewijzigd. Open het opnieuw en controleer je taak.");
   const data=await bijwerken(g=>{if(!geldig())throw new Error("Account gewijzigd.");berichtTaakBewaren(g,voorstel);});if(!geldig())return;setData(data);setKlaar(true);
  }catch(e){if(geldig())setFout(e instanceof Error?e.message:"Opslaan is nog niet bevestigd. Controleer je taken voordat je opnieuw probeert.");}
  finally{slot.current=false;if(actief.current){setBezig(false);if(!geldig())setFout("Je aanmelding is gewijzigd. Open het taakvoorstel opnieuw.");}}
 }
 return <section ref={vak} tabIndex={-1} aria-label="Taak uit bericht voorbereiden" className="my-3 flex flex-col gap-3 rounded-2xl border border-lijn bg-vlak p-4">
  <h2 className="text-[15px] font-semibold">{klaar?"Taak opgeslagen":"Maak een persoonlijke taak"}</h2>
  {klaar?<><p role="status" className="text-sm">Je taak staat in Mijn dag, met een knop naar dit bronbericht.</p><button onClick={sluit} className="min-h-11 text-sm text-accent">Klaar</button></>:<>
   <p className="text-[13px] text-rustig">Een taak voor jezelf. Pas de titel uit het bericht aan en kies een datum.</p>
   {!voorstel?<form className="flex flex-col gap-3" onSubmit={e=>{e.preventDefault();try{setVoorstel(berichtTaakVoorstel(titel,dag,{gesprek,bericht:regel.id},staat.data.taken));setFout("");}catch(e){setFout((e as Error).message);}}}>
    <label className="text-sm">Taaktitel<input value={titel} maxLength={160} onChange={e=>setTitel(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-white px-3 dark:bg-[#26262b]"/></label>
    <label className="text-sm">Datum (optioneel)<input type="date" value={dag} onChange={e=>setDag(e.target.value)} className="mt-1 min-h-11 w-full rounded-xl bg-white px-3 dark:bg-[#26262b]"/></label>
    <button disabled={!titel.trim()} className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40">Taak controleren</button>
   </form>:<><p className="break-words text-sm font-medium">{voorstel.actie.titel}</p><p className="text-sm text-rustig">{voorstel.deadline?`Datum: ${new Date(voorstel.deadline+"T12:00:00").toLocaleDateString("nl-NL",{day:"numeric",month:"long",year:"numeric"})}`:"Geen datum gekozen"} · bronbericht gekoppeld</p><p className="text-xs text-rustig">Je bewaart de titel, datum en bronverwijzing in je eigen account. De deelnemers krijgen geen bericht.</p><button disabled={bezig} onClick={bewaren} className="min-h-11 rounded-full bg-accent px-4 text-sm font-medium text-white disabled:opacity-40">{bezig?"Controleren en opslaan…":"Bevestig persoonlijke taak"}</button><button disabled={bezig} onClick={()=>{setVoorstel(null);setFout("");}} className="min-h-11 text-sm text-accent">Terug naar aanpassen</button></>}
   <button disabled={bezig} onClick={sluit} className="min-h-11 text-sm text-rustig">Annuleren</button>
  </>}{fout&&<p role="alert" className="text-sm text-red-600 dark:text-red-400">{fout}</p>}
 </section>;
}
