/** Eigen kaartlogica: geen netwerk, AI, volglocatie of automatische boeking. */
import type { Afspraak, Gegevens } from "../api";
import { afstand, type Punt } from "./kaart";
import { gelijk } from "./dagacties";
import { lokaleTijd, nederlandseInstant, tijdInstant } from "./projecttijd";
export type Stop = Punt & { id: string; naam: string; prive: boolean };
export type Plek = Stop;
export type Tijden = { heen: number; bezoek: number; verder: number; buffer: number };
export type Tijdscontrole = { status: "past" | "krap" | "niet" | "onbekend"; uitleg: string; marge?: number; volgende?: Afspraak };
export function geldigPunt(p: Punt) {
  return Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
}
function controleerStop(p: Stop): Stop {
  if (!p || !geldigPunt(p) || typeof p.id !== "string" || !p.id || p.id.length > 400 || typeof p.naam !== "string"
    || !p.naam.trim() || p.naam.length > 120 || /[\p{Cc}\p{Cs}]/u.test(p.naam) || typeof p.prive !== "boolean") throw new Error("Controleer de naam en locatie van de plek.");
  return { id:p.id, naam:p.naam.trim(), lat:p.lat, lon:p.lon, prive:p.prive };
}
export function controleerTijden(t: Tijden) {
  if (![t.heen,t.bezoek,t.verder,t.buffer].every(n => Number.isSafeInteger(n) && n >= 0 && n <= 43200) || t.bezoek < 1)
    throw new Error("De berekende tijdsindicatie ontbreekt of valt buiten het ondersteunde bereik.");
}
const instant = (s: string) => tijdInstant(/[Zz]|[+-]\d{2}:\d{2}$/.test(s) ? s : nederlandseInstant(s));
export function tijdscontrole(afspraken: Afspraak[], nu: number, t: Tijden): Tijdscontrole {
  controleerTijden(t);
  if (!Number.isFinite(new Date(nu).getTime())) throw new Error("Ongeldig controletijdstip.");
  const dag = lokaleTijd(nu).slice(0,10);
  const getimed: { a:Afspraak; start:number; eind?:number }[]=[];
  for (const a of afspraken) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(a.start)) {
      try { nederlandseInstant(a.start+"T12:00"); if(a.einde) { nederlandseInstant(a.einde.slice(0,10)+"T12:00"); if(a.einde.slice(0,10)<a.start)throw new Error(); } }
      catch { return {status:"onbekend",uitleg:"Een hele-dagafspraak heeft ongeldige datums. Controleer je agenda."}; }
      // Een meerdaagse hele-dagafspraak is geen bewijs van vrije tijd.
      if (a.start <= dag && (a.einde?.slice(0,10) ?? a.start) >= dag) return {status:"onbekend",uitleg:"Je agenda bevat vandaag een afspraak zonder tijden. Controleer die eerst."};
      continue;
    }
    try {
      const start=instant(a.start), eind=a.einde?instant(a.einde):undefined;
      if (eind !== undefined && eind <= start) return {status:"onbekend",uitleg:"Een afspraak heeft ongeldige tijdgrenzen. Controleer je agenda."};
      getimed.push({a,start,eind});
    } catch { return {status:"onbekend",uitleg:"Niet alle agendatijden zijn eenduidig. Controleer de datum of klokwissel."}; }
  }
  if(getimed.some(a=>a.start<=nu&&a.eind===undefined&&lokaleTijd(a.start).slice(0,10)===dag))return{status:"onbekend",uitleg:"Een afspraak is vandaag al begonnen zonder bekende eindtijd. Controleer eerst of die is afgelopen."};
  if(getimed.some(a=>a.start<=nu&&a.eind!==undefined&&a.eind>nu))return{status:"niet",uitleg:"Er loopt nu al een afspraak. Controleer die voordat je een extra stop plant."};
  const volgende=getimed.filter(a=>a.start>nu).sort((a,b)=>a.start-b.start)[0];
  if(!volgende)return{status:"onbekend",uitleg:"Er is geen volgende afspraak bekend. Dat bewijst niet dat je hele dag vrij is."};
  const klaar=nu+(t.heen+t.bezoek+t.verder+t.buffer)*60_000;
  const marge=Math.floor((volgende.start-klaar)/60_000);
  return {status:marge<0?"niet":marge<10?"krap":"past",marge,volgende:volgende.a,
    uitleg:marge<0?`Dit voorstel komt ${-marge} minuten tekort, inclusief je buffer.`:marge<10?`Krap: nog ${marge} minuten over ná je buffer.`:`Met de ruime reistijdindicatie blijven ${marge} minuten over ná je buffer.`};
}
export function voegStopToe(stops: Stop[], stop: Stop) {
  const p=controleerStop(stop);
  if(stops.some(s=>s.id===p.id))return stops;
  if(stops.length>=5)throw new Error("Een routeplan heeft maximaal vijf stops.");
  return [...stops,p];
}
export function planAfstand(vanaf: Punt, stops: Stop[], rond=false) {
  if(!geldigPunt(vanaf)||stops.length>5||new Set(stops.map(s=>s.id)).size!==stops.length)throw new Error("Controleer het vertrekpunt en maximaal vijf unieke stops.");
  let laatste=vanaf,totaal=0;
  for(const s of stops){controleerStop(s);totaal+=afstand(laatste,s);laatste=s;}
  return totaal+(rond&&stops.length?afstand(laatste,vanaf):0);
}
/** Exacte vergelijking van maximaal 120 volgordes; een geometrisch voorstel, geen verkeersroute. */
export function vergelijkVolgordes(vanaf: Punt, stops: Stop[], rond=false) {
  let best=[...stops],meters=planAfstand(vanaf,stops,rond),bekeken=0;
  function loop(klaar:Stop[],over:Stop[]){
    if(!over.length){bekeken++;const d=planAfstand(vanaf,klaar,rond);if(d<meters-0.01){meters=d;best=[...klaar];}return;}
    over.forEach((s,i)=>loop([...klaar,s],over.filter((_,j)=>i!==j)));
  }
  loop([],stops);
  return {stops:best,meters,bekeken,besparing:Math.max(0,planAfstand(vanaf,stops,rond)-meters)};
}
export function leesPlekken(g: Gegevens): Plek[] {
  if(g.kaartplekken===undefined)return[];
  if(!Array.isArray(g.kaartplekken)||g.kaartplekken.length>30)throw new Error("De opgeslagen kaartplekken hebben een onbekende indeling. Er wordt niets overschreven.");
  if(g.kaartplekken.some(p=>!p||typeof p!=="object"||Object.keys(p).sort().join()!=="id,lat,lon,naam,prive"))throw new Error("De opgeslagen plekken bevatten onbekende velden. Er wordt niets overschreven.");
  const p=g.kaartplekken.map(controleerStop);
  if(p.some(p=>!p.prive)||new Set(p.map(p=>p.id)).size!==p.length)throw new Error("Controleer de opgeslagen privéplekken.");
  return p;
}
export function bewaarPlek(g:Gegevens, plek:Plek, basis:Plek[]) {
  const p=controleerStop(plek),lijst=leesPlekken(g);
  if(!p.prive)throw new Error("Bewaar een eigen plek alleen als privéplek.");
  const eigen=lijst.find(s=>s.id===p.id);
  if(eigen){if(!gelijk(eigen,p))throw new Error("Deze plek is intussen gewijzigd.");return;}
  if(lijst.some(s=>s.naam===p.naam&&s.lat===p.lat&&s.lon===p.lon))return;
  if(!gelijk(lijst,basis))throw new Error("Je plekken zijn elders gewijzigd. Vernieuw en controleer opnieuw.");
  if(lijst.length>=30)throw new Error("Je kunt maximaal dertig privéplekken bewaren.");
  g.kaartplekken=[...lijst,p];
}
export function verwijderPlek(g:Gegevens, verwacht:Plek) {
  const lijst=leesPlekken(g),p=lijst.find(p=>p.id===verwacht.id);
  if(!p)return;
  if(!gelijk(p,verwacht))throw new Error("Deze plek is intussen gewijzigd. Controleer eerst de nieuwe gegevens.");
  g.kaartplekken=lijst.filter(p=>p.id!==verwacht.id);
}
export function routeBriefje(stops: Stop[], tijden:Tijden|undefined, priveLabels=false) {
  if(tijden)controleerTijden(tijden);
  if(stops.length>5)throw new Error("Maximaal vijf stops.");
  return ["Mijn routebriefje",...stops.map((s,i)=>`${i+1}. ${controleerStop(s).prive&&!priveLabels?"Privéstop (naam en locatie niet gedeeld)":s.naam}`),
    tijden?`Geschatte planning: heen ${tijden.heen} min; bezoek ${tijden.bezoek} min; verder ${tijden.verder} min; buffer ${tijden.buffer} min.`:"Volledige reistijdplanning nog niet beschikbaar.",
    "Dit is een plan, geen reservering of actuele verkeersroute. Agenda, vertrekadres en coördinaten zijn niet opgenomen."].join("\n");
}

export type Reisschatting = { laag: number; hoog: number; hemelsbreed: number; toelichting: string };
/** Eigen afstandsmodel met brede onzekerheid. Geen route-, verkeers- of dienstregelingsclaim. */
export function schatReistijd(van:Punt, naar:Punt, wijze:import("./kaart").Reiswijze):Reisschatting {
  if(!geldigPunt(van)||!geldigPunt(naar))throw new Error("Kies een geldig vertrekpunt en bestemming.");
  const meters=afstand(van,naar),km=meters/1000;
  let factor:number,snel:number,traag:number,extra:number,toelichting:string;
  if(wijze==="lopen"){factor=1.25;snel=5;traag=3.5;extra=2;toelichting="Loopindicatie; oversteekplaatsen en toegankelijkheid zijn niet bekend.";}
  else if(wijze==="fiets"){factor=1.3;snel=19;traag=11;extra=4;toelichting="Fietsindicatie; wind, hellingen en geschikte fietspaden zijn niet bekend.";}
  else if(wijze==="ov"){factor=1.4;snel=80;traag=25;extra=45;toelichting="Zeer ruwe OV-indicatie; wachttijd en overstappen zijn geschat. Controleer de dienstregeling.";}
  else if(wijze==="auto"){factor=km<5?1.45:km<30?1.3:1.2;snel=km<5?30:km<30?65:100;traag=km<5?15:km<30?35:65;extra=km<30?10:20;toelichting="Auto-indicatie; parkeren en een ruime marge tellen mee. Geen live files of wegafsluitingen.";}
  else throw new Error("Kies een bekend vervoermiddel.");
  const segmenten = wijze==="auto" ? [Math.min(km,5),Math.min(Math.max(km-5,0),25),Math.max(km-30,0)] : null;
  const snelMin = segmenten ? (segmenten[0]*1.45/30+segmenten[1]*1.3/65+segmenten[2]*1.2/100)*60 : km*factor/snel*60;
  const traagMin = segmenten ? (segmenten[0]*1.45/15+segmenten[1]*1.3/35+segmenten[2]*1.2/65)*60 : km*factor/traag*60;
  const laag=Math.max(1,Math.ceil(snelMin));
  const hoog=Math.max(laag+2,Math.ceil(traagMin+extra));
  return {laag,hoog,hemelsbreed:meters,toelichting:toelichting+(km>150?" Voor deze lange afstand kunnen omwegen, water en grenzen de werkelijke reis sterk veranderen.":"")};
}
