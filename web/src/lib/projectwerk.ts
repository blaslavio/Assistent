/** Eigen projecttechniek: sjablonen zonder deelnemers/bronhistorie, bord en uitlegbare werkdruk. */
import type { Gegevens } from "../api";
import { actueleAanpakken, valideerStappen, volgendeStappen, type Stap } from "./projectplan";
import { isAfgerond, nieuwFeit, type Feit, type ProjectActie } from "./projectregie";
export type SjabloonStap = { titel:string; klaarAls:string; minuten:number; alternatief:string; na:number[] };
export type ProjectSjabloon = { id:string; versie:1; naam:string; stappen:SjabloonStap[] };
const UUID=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function leesSjabloon(waarde:unknown):ProjectSjabloon {
  if(!waarde||typeof waarde!=="object")throw new Error("Onleesbaar projectsjabloon.");const s=waarde as ProjectSjabloon;
  if(Object.keys(s).sort().join()!=="id,naam,stappen,versie"||typeof s.id!=="string"||!UUID.test(s.id)||s.versie!==1||typeof s.naam!=="string"||!s.naam.trim()||s.naam.length>80||/[\p{Cc}\p{Cs}]/u.test(s.naam)||!Array.isArray(s.stappen)||s.stappen.length<1||s.stappen.length>12)throw new Error("Een sjabloon heeft een naam en 1 tot 12 stappen.");
  const ids=s.stappen.map(()=>crypto.randomUUID());
  const stappen=s.stappen.map((stap,i)=>{
    if(!stap||Object.keys(stap).sort().join()!=="alternatief,klaarAls,minuten,na,titel"||!Array.isArray(stap.na)||stap.na.some(i=>!Number.isSafeInteger(i)||i<0||i>=ids.length))throw new Error("Ongeldige sjabloonstap.");
    return{...stap,id:ids[i],afhankelijkVan:stap.na.map(i=>ids[i])};
  });
  // Projectstappen accepteren geen sjabloonvelden.
  valideerStappen(stappen.map(({na,...stap})=>stap));
  if(JSON.stringify(s).length>14000)throw new Error("Het sjabloon is te groot.");return {id:s.id,versie:1,naam:s.naam,stappen:s.stappen.map(stap=>({titel:stap.titel,klaarAls:stap.klaarAls,minuten:stap.minuten,alternatief:stap.alternatief,na:[...new Set(stap.na)].sort((a,b)=>a-b)}))};
}
export function sjabloonMaken(naam:string,stappen:Stap[]):ProjectSjabloon {
  const geldig=valideerStappen(stappen);
  return leesSjabloon({id:crypto.randomUUID(),versie:1,naam:naam.trim(),stappen:geldig.map(s=>({titel:s.titel,klaarAls:s.klaarAls,minuten:s.minuten,alternatief:s.alternatief,na:s.afhankelijkVan.map(id=>geldig.findIndex(v=>v.id===id))}))});
}
export function sjabloonInvullen(s:ProjectSjabloon):Stap[]{
  s=leesSjabloon(s);const ids=s.stappen.map(()=>crypto.randomUUID());
  return valideerStappen(s.stappen.map((stap,i)=>({id:ids[i],titel:stap.titel,klaarAls:stap.klaarAls,minuten:stap.minuten,alternatief:stap.alternatief,afhankelijkVan:stap.na.map(n=>ids[n])})));
}
export function eigenSjablonen(g:Gegevens):ProjectSjabloon[]{
  if(g.projectSjablonen!==undefined&&!Array.isArray(g.projectSjablonen))throw new Error("Je eigen sjablonen zijn onleesbaar.");
  const s=((g.projectSjablonen??[]) as unknown[]).map(leesSjabloon);if(s.length>20||new Set(s.map(x=>x.id)).size!==s.length)throw new Error("Ongeldige sjablonenlijst.");return s;
}
export function sjabloonBewaren(g:Gegevens,s:ProjectSjabloon){
  s=leesSjabloon(s);const alle=eigenSjablonen(g),oud=alle.find(x=>x.id===s.id);
  if(oud){if(JSON.stringify(oud)!==JSON.stringify(s))throw new Error("Dit sjabloon is intussen gewijzigd.");return;}
  if(alle.length>=20)throw new Error("Maximaal 20 eigen sjablonen. Verwijder eerst een oud sjabloon.");g.projectSjablonen=[...alle,s];
}
export function sjabloonVerwijderen(g:Gegevens,s:ProjectSjabloon){
  s=leesSjabloon(s);const alle=eigenSjablonen(g),oud=alle.find(x=>x.id===s.id);if(!oud)return;
  if(JSON.stringify(oud)!==JSON.stringify(s))throw new Error("Dit sjabloon is intussen gewijzigd.");g.projectSjablonen=alle.filter(x=>x.id!==s.id);
}
const bouw=(id:string,naam:string,titels:string[],criteria:string[]):ProjectSjabloon=>({id,versie:1,naam,stappen:titels.map((titel,i)=>({titel,klaarAls:criteria[i],minuten:30,alternatief:"Bespreek een kleinere uitvoerbare stap.",na:i?[i-1]:[]}))});
export const STARTSJABLONEN:ProjectSjabloon[]=[
  bouw("10000000-0000-4000-8000-000000000001","Van idee naar resultaat",["Doel afbakenen","Kleine eerste versie maken","Samen controleren","Overdragen"],["Doel en grenzen zijn bevestigd.","Een werkend voorbeeld is beschikbaar.","Het resultaat voldoet aan de afgesproken criteria.","De eigenaar heeft het resultaat en de vervolgstap ontvangen."]),
  bouw("10000000-0000-4000-8000-000000000002","Overleg naar uitvoering",["Bespreekpunten verzamelen","Besluit bevestigen","Actie uitvoeren"],["Deelnemers hebben hun vragen ingebracht.","Het besluit en de verantwoordelijke zijn bevestigd.","Het afgesproken resultaat is gecontroleerd."]),
  bouw("10000000-0000-4000-8000-000000000003","Dienst voorbereiden en opleveren",["Vraag en prijs afstemmen","Beschikbaarheid controleren","Dienst leveren","Oplevering controleren"],["Opdracht, prijs en voorwaarden zijn bevestigd.","De betrokkenen hebben de afspraak bevestigd.","De afgesproken dienst is geleverd.","Het resultaat is door de betrokkenen gecontroleerd."]),
];
export function stapStatusVoorstel(plan:Feit,stapId:string,feiten:Feit[],ik:number,keuze:string,uitleg=""):ProjectActie {
  if(!actueleAanpakken(plan.actie.doel??"",feiten).some(p=>p.actie.sleutel===plan.actie.sleutel))throw new Error("Deze aanpak is vervangen. Controleer het actuele bord.");
  const r=volgendeStappen(plan,feiten).find(r=>r.stap.id===stapId);
  if(!r||!["te_doen","bezig","vast","klaar"].includes(keuze))throw new Error("Onbekende stapstatus.");
  if(plan.afzender!==ik&&r.stap.eigenaar!==ik)throw new Error("Alleen de maker of verantwoordelijke kan deze stap bijwerken.");
  if(["bezig","klaar"].includes(keuze)&&r.wachtOp.length)throw new Error("Bevestig eerst de voorgangers of wijzig de aanpak.");
  if(keuze==="vast"&&!uitleg.trim())throw new Error("Beschrijf kort het obstakel.");
  return nieuwFeit("stapstatus",keuze==="vast"?uitleg:`${r.stap.titel}: ${keuze}. Resultaatcriterium: ${r.stap.klaarAls}`,{soort:"eigen"},{doel:plan.actie.sleutel,stap:stapId,keuze});
}
export function projectWerkdruk(feiten:Feit[]){
  const personen=new Map<number,{minuten:number;geblokkeerd:number;stappen:number}>();let onverdeeld=0,conflicten=0;
  const doelen=feiten.filter(f=>["actie","besluit","vraag"].includes(f.actie.soort)&&!isAfgerond(f,feiten));
  for(const doel of doelen){const plannen=actueleAanpakken(doel.actie.sleutel,feiten);if(plannen.length>1){conflicten++;continue;}
    if(!plannen.length)continue;
    for(const r of volgendeStappen(plannen[0],feiten)){if(r.status==="klaar")continue;if(!r.stap.eigenaar){onverdeeld+=r.stap.minuten;continue;}
      const p=personen.get(r.stap.eigenaar)??{minuten:0,geblokkeerd:0,stappen:0};p.minuten+=r.stap.minuten;p.stappen++;if(r.status==="vast"||r.wachtOp.length)p.geblokkeerd+=r.stap.minuten;personen.set(r.stap.eigenaar,p);
    }
  }
  return{personen,onverdeeld,conflicten};
}
