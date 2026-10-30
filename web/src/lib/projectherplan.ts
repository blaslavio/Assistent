/** Eén eigen projectafspraak herplannen: preview, actuele hercontrole en inhoudsgebonden herhaling. */
import type { Afspraak, Gegevens } from "../api";
import type { Feit } from "./projectregie";
import { lokaleTijd, tijdInstant } from "./projecttijd";
import { tijdVoorstellen } from "./projectwanneer";
type Koppeling={gesprek:number;aanpak:string;stap:string;opdracht:string};
type EigenAfspraak=Afspraak&{projectplanning?:Koppeling};
export type HerplanPoging={opdracht:string;gesprek:number;aanpak:string;stap:string;afspraak:number;basis:string;oudVan:string;oudTot:string;van:string;tot:string};
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const basis=(a:EigenAfspraak)=>JSON.stringify([a.id,a.titel,a.start,a.einde,a.soort,a.projectplanning?.gesprek,a.projectplanning?.aanpak,a.projectplanning?.stap,a.projectplanning?.opdracht]);
export function herplanVoorstel(g:Gegevens,gesprek:number,aanpak:string,stap:string,afspraak:number,feiten:Feit[],ik:number,nu=Date.now()):HerplanPoging {
  const a=g.afspraken.find(a=>a.id===afspraak) as EigenAfspraak|undefined;
  if(!a||!Number.isSafeInteger(afspraak)||afspraak<1||a.soort!=="focus"||a.extern===true||a.projectplanning?.gesprek!==gesprek||a.projectplanning.stap!==stap)throw new Error("Kies een eigen focusafspraak uit dit project.");
  if(g.afspraken.filter(b=>b.id===afspraak).length!==1)throw new Error("De afspraak-ID is niet eenduidig.");
  const plan=feiten.find(f=>f.actie.soort==="aanpak"&&f.actie.sleutel===aanpak);
  if(!plan)throw new Error("De aanpak ontbreekt.");
  const oud=tijdVoorstellen(gesprek,plan,feiten,ik,g.afspraken,nu).find(r=>r.stap.id===stap);
  if(!oud||oud.persoon!==ik||oud.afspraak?.id!==afspraak||!oud.teControleren||!oud.van||!oud.tot)throw new Error("Deze afspraak is niet jouw te herstellen projecttijd.");
  const nieuw=tijdVoorstellen(gesprek,plan,feiten,ik,g.afspraken.filter(b=>b.id!==afspraak),nu).find(r=>r.stap.id===stap);
  if(!nieuw||nieuw.persoon!==ik||nieuw.afspraak||nieuw.voorwaardelijk||!nieuw.reden.startsWith("Voorstel")||!nieuw.van||!nieuw.tot)throw new Error("Geen zelfstandig passend tijdvak. Los eerst de voorgangers op of pas beschikbaarheid/deadline aan.");
  return{opdracht:crypto.randomUUID(),gesprek,aanpak,stap,afspraak,basis:basis(a),oudVan:oud.van,oudTot:oud.tot,van:nieuw.van,tot:nieuw.tot};
}
export function herplanVastleggen(g:Gegevens,p:HerplanPoging,feiten:Feit[],ik:number,nu=Date.now()) {
  if(!UUID.test(p.opdracht))throw new Error("Ongeldige herplanningsopdracht.");
  const a=g.afspraken.find(a=>a.id===p.afspraak) as EigenAfspraak|undefined;
  if(!a)throw new Error("De oorspronkelijke afspraak ontbreekt.");
  const klaar=(g.afspraken as EigenAfspraak[]).find(b=>b.projectplanning?.opdracht===p.opdracht);
  if(klaar){
    if(klaar.id!==p.afspraak||klaar.projectplanning?.gesprek!==p.gesprek||klaar.projectplanning.aanpak!==p.aanpak||klaar.projectplanning.stap!==p.stap||klaar.start!==lokaleTijd(tijdInstant(p.van)).slice(0,16)||klaar.einde!==lokaleTijd(tijdInstant(p.tot)).slice(0,16))throw new Error("Deze opdracht hoort bij andere inhoud.");
    return klaar;
  }
  if(basis(a)!==p.basis)throw new Error("De oorspronkelijke afspraak is intussen gewijzigd. Maak een nieuw voorstel.");
  const vers=herplanVoorstel(g,p.gesprek,p.aanpak,p.stap,p.afspraak,feiten,ik,nu);
  if(vers.van!==p.van||vers.tot!==p.tot)throw new Error("Het voorgestelde tijdvak is niet meer passend. Controleer opnieuw.");
  a.start=lokaleTijd(tijdInstant(p.van)).slice(0,16);a.einde=lokaleTijd(tijdInstant(p.tot)).slice(0,16);
  a.projectplanning={gesprek:p.gesprek,aanpak:p.aanpak,stap:p.stap,opdracht:p.opdracht};
  return a;
}
