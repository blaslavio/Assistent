/** Alleen eigen, actuele status ophalen. Geen betalen, boeken, reserveren of berichten versturen. */
import { alsIk, huidigeSessie } from "../api";
import { lijst } from "./bestellingen";
import { mijnPagina } from "./gasten";
import type { DienstBewijs } from "./projectals";
export async function eigenDienstBewijzen(){
  const sessie=huidigeSessie();if(!sessie)throw new Error("Log opnieuw in.");
  const uit=await Promise.allSettled([lijst(),mijnPagina(),alsIk<{reserveringen:{id:number;status:string}[]}>("mijn_reserveringen")]);
  if(huidigeSessie()!==sessie)throw new Error("Account gewijzigd.");
  const bewijzen:DienstBewijs[]=[],fouten:string[]=[];const gecontroleerd=Date.now();
  if(uit[0].status==="fulfilled")bewijzen.push(...uit[0].value.map(b=>({dienst:"betaling" as const,id:b.id,status:b.status,gecontroleerd,betaalwijze:b.betaalwijze,rol:b.rol,ander_id:b.ander_id})));
  else fouten.push("Betaalstatus niet bereikbaar.");
  if(uit[1].status==="fulfilled")bewijzen.push(...uit[1].value.boekingen.map(b=>({dienst:"boeking" as const,id:b.id,status:b.status,gecontroleerd})));
  else fouten.push("Boekingsstatus niet bereikbaar.");
  if(uit[2].status==="fulfilled")bewijzen.push(...(uit[2].value.reserveringen??[]).map(b=>({dienst:"reservering" as const,id:b.id,status:b.status,gecontroleerd})));
  else fouten.push("Reserveringsstatus niet bereikbaar.");
  return{bewijzen,fouten};
}
