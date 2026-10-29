import { useRef, useState } from "react";
import { huidigeSessie } from "../api";
import { lijst, stand, type Bestelling } from "../lib/bestellingen";
import { betaalbericht, chatCheckout, eigenBetaalverzoek } from "../lib/chatbetaling";
import { versturen } from "../lib/chat";
const euro=(n:number)=>new Intl.NumberFormat("nl-NL",{style:"currency",currency:"EUR"}).format(n);
export function BetaalverzoekMaken({gesprek,ander,vernieuw}:{gesprek:number;ander:number;vernieuw:()=>Promise<void>}) {
  const [orders,setOrders]=useState<Bestelling[]>([]);const [pending,setPending]=useState<Bestelling|null>(null);
  const [fout,setFout]=useState("");const [melding,setMelding]=useState("");const [bezig,setBezig]=useState(false);const slot=useRef(false);
  async function doe(taak:()=>Promise<void>){if(slot.current)return;slot.current=true;setBezig(true);setFout("");const sessie=huidigeSessie();try{await taak();}catch(e){if(huidigeSessie()===sessie)setFout((e as Error).message);}finally{slot.current=false;setBezig(false);}}
  return <details className="border-b border-lijn px-4 py-2"><summary className="min-h-11 cursor-pointer">Betaalverzoek in deze chat</summary>
    <p className="text-sm">Alleen een geaccepteerde eigen appbestelling met deze gesprekspartner. De chat deelt alleen het bestelnummer; bedrag en status worden uit de eigen administratie opgehaald.</p>
    {fout&&<p role="alert">{fout}</p>}{melding&&<p role="status">{melding}</p>}
    <button disabled={bezig||!!pending} className="min-h-11 text-accent" onClick={()=>doe(async()=>{const s=huidigeSessie(),bs=await lijst();if(huidigeSessie()!==s)return;const eigen=bs.filter(b=>b.rol==="verkoper"&&b.ander_id===ander&&b.betaalwijze==="app"&&b.status==="geaccepteerd");setOrders(eigen);setMelding(eigen.length?"Kies een bestelling.":"Geen passende bestelling. Maak of accepteer eerst de bestelling bij Bestellingen.");})}>Eigen betaalverzoeken ophalen</button>
    {!pending&&orders.map(b=><button disabled={bezig} key={b.id} className="block min-h-11 text-accent" onClick={()=>setPending(b)}>Controleer #{b.id} · {b.titel} · {euro(b.bedrag)}</button>)}
    {pending&&<div><p>Delen met deze gesprekspartner: betaalverzoek #{pending.id} · {pending.titel} · {euro(pending.bedrag)}. Er wordt geen geld afgeschreven.</p>
      <button disabled={bezig} className="min-h-11 text-accent" onClick={()=>doe(async()=>{const s=huidigeSessie(),vers=await eigenBetaalverzoek(pending.id,ander,"verkoper");if(vers.status!=="geaccepteerd"||vers.bedrag!==pending.bedrag||vers.titel!==pending.titel)throw new Error("Bestelling gewijzigd. Sluit en controleer opnieuw.");await versturen(gesprek,{t:"projectbetaling",versie:1,bestelling:pending.id});if(huidigeSessie()!==s)return;setPending(null);setOrders([]);setMelding("Betaalverzoek gedeeld. Een herhaalde kaart blijft gekoppeld aan dezelfde bestelling.");await vernieuw();})}>Bevestig delen van betaalverzoek</button>
      <button disabled={bezig} className="min-h-11 px-3" onClick={()=>setPending(null)}>Sluiten</button></div>}
  </details>;
}
export function ChatBetaalkaart({bericht,ander,mijn}:{bericht:unknown;ander:number;mijn:boolean}) {
  const [b,setB]=useState<Bestelling|null>(null);const [fout,setFout]=useState("");const [bezig,setBezig]=useState(false);const slot=useRef(false);const v=betaalbericht(bericht);
  async function doe(checkout=false){if(slot.current||!v)return;slot.current=true;setBezig(true);setFout("");const s=huidigeSessie();try{
    if(checkout){if(!b)return;const url=await chatCheckout(v.bestelling,ander,b);if(huidigeSessie()===s)window.location.assign(url);}
    else {const vers=await eigenBetaalverzoek(v.bestelling,ander,mijn?"verkoper":"koper");if(huidigeSessie()===s)setB(vers);}
  }catch(e){if(huidigeSessie()===s){setB(null);setFout((e as Error).message);}}finally{slot.current=false;setBezig(false);}}
  if(!v)return <p>Ongeldig betaalverzoek.</p>;
  return <div className="not-italic"><p className="font-semibold">Betaalverzoek #{v.bestelling}</p><p className="text-xs">Chattekst bewijst geen betaling. Controleer je eigen administratie.</p>
    {fout&&<p role="alert">{fout}</p>}<button disabled={bezig} className="min-h-11 underline" onClick={()=>doe()}>Actueel bedrag en status controleren</button>
    {b&&<><p>{b.titel} · {euro(b.bedrag)}</p><p>{stand(b)}</p>{!mijn&&b.status==="geaccepteerd"&&<button disabled={bezig} className="min-h-11 underline" onClick={()=>doe(true)}>Zelf verder naar beveiligd betalen</button>}</>}
  </div>;
}
