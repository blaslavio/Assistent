import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { nieuwFeit, type Feit } from "./projectregie";
import { eigenSjablonen, leesSjabloon, projectWerkdruk, sjabloonBewaren, sjabloonInvullen, sjabloonMaken, sjabloonVerwijderen, stapStatusVoorstel, STARTSJABLONEN } from "./projectwerk";
const f=(actie:Feit["actie"],bericht:number,afzender=1):Feit=>({actie,bericht,afzender,tijd:"2026-10-29T08:00:00Z"});
const stappen=()=>{const id=crypto.randomUUID();return[{id,titel:"Ontwerp",klaarAls:"Voorbeeld goedgekeurd",minuten:30,eigenaar:1,alternatief:"Samen bespreken",afhankelijkVan:[]},{id:crypto.randomUUID(),titel:"Bouwen",klaarAls:"Werkt",minuten:60,eigenaar:2,alternatief:"Kleiner beginnen",afhankelijkVan:[id]}];};
const g=()=>({taken:[],afspraken:[],volgend_id:1} as Gegevens);
function basis(){const root=f(nieuwFeit("actie","Maak een pagina"),1),s=stappen(),plan=f(nieuwFeit("aanpak","Uitvoeren",{soort:"eigen"},{doel:root.actie.sleutel,stappen:s}),2);return{root,plan,s,feiten:[root,plan]};}
describe("herbruikbare projectaanpakken",()=>{
 it("genereert nieuwe stap-ID's en bewaart volgorde zonder eigenaren of bronhistorie",()=>{
   const s=stappen(),sj=sjabloonMaken("Eigen route",s),a=sjabloonInvullen(sj),b=sjabloonInvullen(sj);expect(a[0].id).not.toBe(s[0].id);expect(a[0].id).not.toBe(b[0].id);expect(a[1].afhankelijkVan).toEqual([a[0].id]);expect(a[0].eigenaar).toBeUndefined();expect(JSON.stringify(sj)).not.toContain(s[0].id);expect(sj.stappen[0].titel).toBe("Ontwerp");
 });
 it("controleert presets, onbekende velden, cirkels en ongeldige verwijzingen",()=>{
   STARTSJABLONEN.forEach(s=>expect(sjabloonInvullen(s).length).toBeGreaterThan(0));const sj=sjabloonMaken("Route",stappen());expect(()=>leesSjabloon({...sj,leden:[1,2]})).toThrow();sj.stappen[0].na=[1];expect(()=>leesSjabloon(sj)).toThrow("cirkel");sj.stappen[0].na=[9];expect(()=>leesSjabloon(sj)).toThrow();
 });
 it("bewaart idempotent, weigert gewijzigde inhoud en verwijdert alleen het gekozen sjabloon",()=>{
   const data=g(),s=sjabloonMaken("Route",stappen());sjabloonBewaren(data,s);sjabloonBewaren(data,s);expect(eigenSjablonen(data)).toHaveLength(1);expect(()=>sjabloonBewaren(data,{...s,naam:"Anders"})).toThrow("gewijzigd");expect(()=>sjabloonVerwijderen(data,{...s,naam:"Anders"})).toThrow();sjabloonVerwijderen(data,s);sjabloonVerwijderen(data,s);expect(eigenSjablonen(data)).toEqual([]);
 });
 it("weigert beschadigde opslag en een eenentwintigste sjabloon",()=>{
   const data=g();data.projectSjablonen="kapot";expect(()=>eigenSjablonen(data)).toThrow();data.projectSjablonen=[];for(let i=0;i<20;i++)sjabloonBewaren(data,sjabloonMaken("Route "+i,stappen()));expect(()=>sjabloonBewaren(data,sjabloonMaken("Nog een",stappen()))).toThrow("20");
 });
});
describe("bord en werkbelasting gebruiken dezelfde bewijsbasis",()=>{
 it("controleert actor, voorgangers, actuele aanpak en obstakeluitleg",()=>{
   const {plan,s,feiten}=basis();expect(()=>stapStatusVoorstel(plan,s[0].id,feiten,99,"klaar")).toThrow("verantwoordelijke");expect(()=>stapStatusVoorstel(plan,s[1].id,feiten,2,"bezig")).toThrow("voorgangers");expect(()=>stapStatusVoorstel(plan,s[0].id,feiten,1,"vast")).toThrow("obstakel");expect(stapStatusVoorstel(plan,s[0].id,feiten,1,"vast","Wacht op antwoord").tekst).toBe("Wacht op antwoord");
   const nieuw=f(nieuwFeit("aanpak","Andere route",{soort:"eigen"},{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:s}),3);expect(()=>stapStatusVoorstel(plan,s[0].id,[...feiten,nieuw],1,"bezig")).toThrow("vervangen");
 });
 it("laat een bevoegde uitvoerder beginnen zodra de voorganger bevestigd klaar is",()=>{
   const {plan,s,feiten}=basis(),klaar=f(stapStatusVoorstel(plan,s[0].id,feiten,1,"klaar"),3);expect(stapStatusVoorstel(plan,s[1].id,[...feiten,klaar],2,"bezig").keuze).toBe("bezig");
 });
 it("telt open en geblokkeerde minuten en laat afgerond werk weg",()=>{
   const {plan,s,feiten}=basis();const d=projectWerkdruk(feiten);expect(d.personen.get(1)?.minuten).toBe(30);expect(d.personen.get(2)?.geblokkeerd).toBe(60);
   const klaar=f(stapStatusVoorstel(plan,s[0].id,feiten,1,"klaar"),3);const na=projectWerkdruk([...feiten,klaar]);expect(na.personen.has(1)).toBe(false);expect(na.personen.get(2)?.geblokkeerd).toBe(0);
 });
 it("telt conflicterende aanpakken niet dubbel en vermeldt niet toegewezen werk",()=>{
   const {root,plan,s,feiten}=basis();const ander=f(nieuwFeit("aanpak","Alternatief",{soort:"eigen"},{doel:root.actie.sleutel,stappen:s}),3);expect(projectWerkdruk([...feiten,ander]).conflicten).toBe(1);expect(projectWerkdruk([...feiten,ander]).personen.size).toBe(0);
   const nieuw=f(nieuwFeit("aanpak","Nog toewijzen",{soort:"eigen"},{doel:root.actie.sleutel,vervangt:plan.actie.sleutel,stappen:[{...s[0],eigenaar:undefined}]}),4);expect(projectWerkdruk([...feiten,nieuw]).onverdeeld).toBe(30);
 });
});
it("herkent een herhaalde sjabloonopslag ook na herschikking van JSON-velden door de server",()=>{
 const s=sjabloonMaken("Route",stappen()),data=g();data.projectSjablonen=[{stappen:s.stappen.map(x=>({na:x.na,minuten:x.minuten,alternatief:x.alternatief,klaarAls:x.klaarAls,titel:x.titel})),naam:s.naam,versie:s.versie,id:s.id}];expect(()=>sjabloonBewaren(data,s)).not.toThrow();expect(eigenSjablonen(data)).toHaveLength(1);
});
