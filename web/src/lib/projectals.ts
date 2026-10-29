/** Eigen projectmotor: begrensde voorwaarden met drie uitkomsten; nooit automatisch geld of diensten wijzigen. */
import type { Gegevens } from "../api";
import type { Feit } from "./projectregie";
import { actueleAanpakken, stapStand } from "./projectplan";
import { tijdInstant } from "./projecttijd";
export type Conditie = { soort:"stap_klaar"|"tijd_bereikt"|"betaling_bevestigd"|"boeking_bevestigd"|"reservering_bevestigd"; bron:string };
export type Vervolg = "planning"|"betaling"|"boeking"|"reservering"|"chatconcept"|"handmatig";
export type AlsRegel = { id:string; gesprek:number; waarom:string; aanpak?:string; modus:"alle"|"een"; voorwaarden:Conditie[]; vervolg:Vervolg; doel?:number };
export type DienstBewijs = { dienst:"betaling"|"boeking"|"reservering"; id:number; status:string; gecontroleerd:number; betaalwijze?:string; rol?:string; ander_id?:number };
export type Beoordeling = { status:"voldaan"|"niet_voldaan"|"onbekend"; uitleg:string[] };
const ID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function alsRegel(r:unknown):AlsRegel {
  if(!r||typeof r!=="object")throw new Error("Ongeldige als-regel.");const b=r as AlsRegel;
  if(Object.keys(b).some(k=>!["id","gesprek","waarom","aanpak","modus","voorwaarden","vervolg","doel"].includes(k))
    ||typeof b.id!=="string"||!ID.test(b.id)||!Number.isSafeInteger(b.gesprek)||b.gesprek<1||typeof b.waarom!=="string"||!ID.test(b.waarom)
    ||(b.aanpak!==undefined&&(typeof b.aanpak!=="string"||!ID.test(b.aanpak)))||!["alle","een"].includes(b.modus)
    ||!["planning","betaling","boeking","reservering","chatconcept","handmatig"].includes(b.vervolg)
    ||!Array.isArray(b.voorwaarden)||!b.voorwaarden.length||b.voorwaarden.length>5
    ||(b.doel!==undefined&&(!Number.isSafeInteger(b.doel)||b.doel<1)))throw new Error("Een regel heeft een projectdoel, een bekend vervolg en 1 tot 5 voorwaarden.");
  for(const c of b.voorwaarden){
    if(!c||Object.keys(c).sort().join()!=="bron,soort"||typeof c.bron!=="string"||!["stap_klaar","tijd_bereikt","betaling_bevestigd","boeking_bevestigd","reservering_bevestigd"].includes(c.soort))throw new Error("Onbekende voorwaarde.");
    if(c.soort==="tijd_bereikt")tijdInstant(c.bron);
    else if(c.soort==="stap_klaar"){if(!b.aanpak||!ID.test(c.bron))throw new Error("Kies de aanpak en stap.");}
    else if(!/^\d+$/.test(c.bron)||!Number.isSafeInteger(Number(c.bron))||Number(c.bron)<1)throw new Error("Kies een bestaande eigen dienstregistratie.");
  }
  return structuredClone(b);
}
export function leesAlsRegels(g:Gegevens,gesprek:number):AlsRegel[]{
  if(g.projectRegels!==undefined&&!Array.isArray(g.projectRegels))throw new Error("De opgeslagen projectregels zijn onleesbaar.");
  return ((g.projectRegels??[]) as unknown[]).map(alsRegel).filter(r=>r.gesprek===gesprek);
}
export function bewaarAlsRegel(g:Gegevens,r:AlsRegel){
  r=alsRegel(r);if(g.projectRegels!==undefined&&!Array.isArray(g.projectRegels))throw new Error("De opgeslagen projectregels zijn onleesbaar.");const alle=((g.projectRegels??[]) as unknown[]).map(alsRegel);
  const oud=alle.find(x=>x.id===r.id);
  if(oud){if(JSON.stringify(oud)!==JSON.stringify(r))throw new Error("Deze regel-ID hoort bij een andere inhoud.");return;}
  if(alle.length>=100)throw new Error("Maximaal 100 persoonlijke projectregels. Verwijder eerst een oude regel.");
  g.projectRegels=[...alle,r];
}
export function beoordeelAls(regel:AlsRegel,feiten:Feit[],diensten:DienstBewijs[],nu=Date.now()):Beoordeling {
  const r=alsRegel(regel),wortel=feiten.find(f=>f.actie.sleutel===r.waarom);
  if(!wortel||!["actie","besluit","vraag"].includes(wortel.actie.soort))return{status:"onbekend",uitleg:["Het bevestigde waarom ontbreekt."]};
  const delen=r.voorwaarden.map((c):{status:Beoordeling["status"];uitleg:string}=>{
    if(c.soort==="stap_klaar"){
      const plan=actueleAanpakken(r.waarom,feiten).find(p=>p.actie.sleutel===r.aanpak),stap=plan?.actie.stappen?.find(s=>s.id===c.bron);
      if(!plan||!stap)return{status:"onbekend",uitleg:"De aanpak of stap is vervangen of ontbreekt."};
      const klaar=stapStand(plan,stap,feiten)?.actie.keuze==="klaar";
      return{status:klaar?"voldaan":"niet_voldaan",uitleg:`Stap ${stap.titel}: ${klaar?"resultaat door verantwoordelijke bevestigd":"nog niet afgerond"}.`};
    }
    if(c.soort==="tijd_bereikt")return{status:nu>=tijdInstant(c.bron)?"voldaan":"niet_voldaan",uitleg:"Tijdvoorwaarde gecontroleerd met de klok van dit apparaat; geen serverbewijs van uitvoering."};
    const dienst=c.soort==="betaling_bevestigd"?"betaling":c.soort==="boeking_bevestigd"?"boeking":"reservering";
    const b=diensten.find(d=>d.dienst===dienst&&d.id===Number(c.bron));
    if(!b||!Number.isFinite(b.gecontroleerd)||nu<b.gecontroleerd||nu-b.gecontroleerd>60_000)return{status:"onbekend",uitleg:`${dienst} ${c.bron}: geen actuele eigen dienstinformatie.`};
    if(dienst==="betaling"&&b.betaalwijze!=="app")return{status:"onbekend",uitleg:"Een handmatig gemelde of contante betaling is geen bevestiging van de betaaldienst."};
    const geldig=dienst==="betaling"?["betaald","geleverd","afgerond"]:dienst==="boeking"?["bevestigd"]:["bevestigd","gekomen"];
    return{status:geldig.includes(b.status)?"voldaan":"niet_voldaan",uitleg:`${dienst} ${b.id}: status ${b.status} volgens de eigen administratie, zojuist opgehaald.`};
  });
  const status=r.modus==="alle"?(delen.some(d=>d.status==="niet_voldaan")?"niet_voldaan":delen.some(d=>d.status==="onbekend")?"onbekend":"voldaan")
    :(delen.some(d=>d.status==="voldaan")?"voldaan":delen.some(d=>d.status==="onbekend")?"onbekend":"niet_voldaan");
  return{status,uitleg:delen.map(d=>d.uitleg)};
}
