import type { Punt } from "./kaart";
export type KaartBron = "agenda" | "vakantie" | "verblijf" | "evenement" | "project" | "chat" | "winkel" | "eigen";
export type KaartContext = {adres:string;bron:KaartBron;titel:string;punt?:Punt};
export const BRON_LABELS:Record<KaartBron,string>={agenda:"Je agenda",vakantie:"Je vakantieplan",verblijf:"Je verblijf",evenement:"Je evenement",project:"Je project",chat:"Je gesprek",winkel:"Je winkel",eigen:"Eigen bestemming"};
export function geldigKaartpunt(p:unknown):p is Punt {
  if(!p||typeof p!=="object")return false;const v=p as Punt;
  return Number.isFinite(v.lat)&&Number.isFinite(v.lon)&&Math.abs(v.lat)<=90&&Math.abs(v.lon)<=180;
}
const schoon=(s:unknown,max:number)=>typeof s==="string"&&s.trim().length<=max&&!/[\p{Cc}\p{Cs}]/u.test(s)?s.trim():null;
export function kaartContext(adres:string,extra:Partial<Omit<KaartContext,"adres">>={}):KaartContext|null {
  const a=schoon(adres,300),titel=schoon(extra.titel??"Bestemming",120),bron=extra.bron??"eigen";
  if(!a||!titel||!Object.hasOwn(BRON_LABELS,bron)||(extra.punt!==undefined&&!geldigKaartpunt(extra.punt)))return null;
  return {adres:a,titel,bron,...(extra.punt?{punt:{lat:extra.punt.lat,lon:extra.punt.lon}}:{})};
}
export type AgendaKaartplek={titel:string;locatie:string;kaartpunt:Punt};
export function agendaKaartplek(naam:string,p:Punt):AgendaKaartplek|null {
  const titel=schoon(naam,120);if(!titel||!geldigKaartpunt(p))return null;
  return {titel,locatie:`${p.lat.toFixed(6)}, ${p.lon.toFixed(6)}`,kaartpunt:{lat:p.lat,lon:p.lon}};
}
/** Pure projectie voor een eigen, schematische lijn; nooit een berekende wegroute. */
export function routeSchets(van:Punt|null,naar:Punt|null) {
  const features=van&&naar&&geldigKaartpunt(van)&&geldigKaartpunt(naar)?[{type:"Feature" as const,properties:{soort:"schematisch"},geometry:{type:"LineString" as const,coordinates:[[van.lon,van.lat],[naar.lon+(naar.lon-van.lon>180?-360:naar.lon-van.lon< -180?360:0),naar.lat]]}}]:[];
  return {type:"FeatureCollection" as const,features};
}
