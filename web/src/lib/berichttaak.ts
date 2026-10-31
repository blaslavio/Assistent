import type { Gegevens, Taak } from "../api";
import { taakVoorstel, taakUitvoeren, taakResultaat, gelijk, type DagActie } from "./dagacties";
export type Chatbron={gesprek:number;bericht:number};
export const geldigeChatbron=(v:unknown):v is Chatbron=>!!v&&typeof v==="object"&&[ (v as Chatbron).gesprek,(v as Chatbron).bericht ].every(n=>Number.isSafeInteger(n)&&n>0);
export function taakBron(t:Taak):Chatbron|null {
 const bron=t.chatbron??(t as Taak&{projectbron?:unknown}).projectbron;
 return geldigeChatbron(bron)?{gesprek:bron.gesprek,bericht:bron.bericht}:null;
}
function datum(d:string){if(d&&!/^\d{4}-\d{2}-\d{2}$/.test(d))throw new Error("Kies een geldige datum.");if(d&&(!Number.isFinite(Date.parse(d))||new Date(d).toISOString().slice(0,10)!==d))throw new Error("Kies een geldige datum.");return d||null;}
export type BerichtTaak={actie:Extract<DagActie,{soort:"toevoegen"}>;deadline:string|null;bron:Chatbron};
export function berichtTaakVoorstel(titel:string,deadline:string,bron:Chatbron,basis:Taak[],opdracht?:string):BerichtTaak {
 if(!geldigeChatbron(bron))throw new Error("Dit bronbericht kan niet worden gekoppeld.");
 return {actie:taakVoorstel(titel,basis,opdracht) as BerichtTaak["actie"],deadline:datum(deadline),bron:{gesprek:bron.gesprek,bericht:bron.bericht}};
}
export function berichtTaakBewaren(g:Gegevens,p:BerichtTaak):Taak {
 berichtTaakVoorstel(p.actie.titel,p.deadline??"",p.bron,p.actie.basis,p.actie.opdracht);
 const eerder=g.taken.find(t=>(t as Taak&{vandaag_opdracht?:string}).vandaag_opdracht===p.actie.opdracht);
 if(eerder){if(eerder.titel!==p.actie.titel||eerder.deadline!==p.deadline||!gelijk(taakBron(eerder),p.bron))throw new Error("Deze taak is al opgeslagen en intussen gewijzigd. Controleer je taken.");return eerder;}
 taakUitvoeren(g,p.actie);const t=taakResultaat(g,p.actie);Object.assign(t,{deadline:p.deadline,chatbron:p.bron});return t;
}
