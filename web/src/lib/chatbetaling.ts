import { huidigeSessie } from "../api";
import { lijst, uitvoeren, type Bestelling } from "./bestellingen";
export type Betaalbericht = {t:"projectbetaling";versie:1;bestelling:number};
export function betaalbericht(b:unknown):Betaalbericht|null {
  if(!b||typeof b!=="object")return null;const v=b as Betaalbericht;
  return Object.keys(v).sort().join() === "bestelling,t,versie" && v.t==="projectbetaling"&&v.versie===1&&Number.isSafeInteger(v.bestelling)&&v.bestelling>0?{...v}:null;
}
export function betaalpartner(b:Bestelling,ander:number,rol:"koper"|"verkoper") {
  if(b.rol!==rol||b.ander_id!==ander||b.betaalwijze!=="app")throw new Error("Dit betaalverzoek hoort niet bij deze gesprekspartner of is geen appbetaling.");
  return b;
}
export async function eigenBetaalverzoek(id:number,ander:number,rol:"koper"|"verkoper"){
  const sessie=huidigeSessie();if(!sessie)throw new Error("Log opnieuw in.");
  const b=(await lijst()).find(b=>b.id===id);
  if(huidigeSessie()!==sessie)throw new Error("Account gewijzigd.");
  if(!b)throw new Error("Deze bestelling staat niet in je eigen administratie.");
  return betaalpartner(b,ander,rol);
}
export async function chatCheckout(id:number,ander:number,verwacht:{bedrag:number;titel:string}){
  const sessie=huidigeSessie(),b=await eigenBetaalverzoek(id,ander,"koper");
  if(b.bedrag!==verwacht.bedrag||b.titel!==verwacht.titel)throw new Error("Bedrag of bestelling gewijzigd. Controleer het betaalverzoek opnieuw.");
  if(b.status!=="geaccepteerd")throw new Error("Deze bestelling kan nu niet worden betaald. Controleer de actuele status.");
  const adres=await uitvoeren(b,"betalen");if(huidigeSessie()!==sessie)throw new Error("Account gewijzigd.");
  const url=new URL(adres??"");
  if(url.protocol!=="https:"||url.hostname!=="checkout.stripe.com"||url.username||url.password||url.port)throw new Error("Onverwacht adres van de betaaldienst.");
  return url.toString();
}
