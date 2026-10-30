import { describe, expect, it } from "vitest";
import type { Gegevens, Afspraak } from "../api";
import { nieuwFeit, projectFeiten, type Feit, type ProjectActie } from "./projectregie";
import { actueleAanpakken, stapStand, valideerStappen, volgendeStappen, type Stap } from "./projectplan";
import { nederlandseInstant, tijdInstant } from "./projecttijd";
import { tijdVoorstellen, tijdVastleggen } from "./projectwanneer";
import { alsRegel, bewaarAlsRegel, beoordeelAls, type AlsRegel } from "./projectals";
const nu=Date.parse("2026-10-29T08:00:00Z");
const f=(actie:ProjectActie,bericht=1,afzender=1):Feit=>({actie,bericht,afzender,tijd:new Date(nu).toISOString()});
const stap=(p:Partial<Stap>={}):Stap=>({id:crypto.randomUUID(),titel:"Ontwerp",klaarAls:"Voorbeeld goedgekeurd",minuten:30,eigenaar:1,alternatief:"Samen bespreken",afhankelijkVan:[],...p});
function basis(){const root=f(nieuwFeit("actie","Bouw de pagina"));const a=stap(),b=stap({titel:"Bouwen",afhankelijkVan:[a.id]});const plan=f(nieuwFeit("aanpak","Uitvoerroute",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[a,b],uiterlijk:"2026-10-29T12:00:00Z"}),2);const ven=f(nieuwFeit("werkvenster","Werkruimte",{soort:"eigen"},{vensters:[{van:"2026-10-29T09:00:00Z",tot:"2026-10-29T12:00:00Z"}]}),3);return{root,a,b,plan,feiten:[root,plan,ven]};}
const gegevens=():Gegevens=>({taken:[],afspraken:[],volgend_id:1} as unknown as Gegevens);
describe("waarom, hoe en wanneer",()=>{
 it("weigert rondlopende en ontbrekende afhankelijkheden",()=>{const a=stap(),b=stap({afhankelijkVan:[a.id]});a.afhankelijkVan=[b.id];expect(()=>valideerStappen([a,b])).toThrow("cirkel");expect(()=>valideerStappen([b])).toThrow("verwijzingen");});
 it("bewaart parallelle aanpakken zonder stilzwijgend een winnaar te kiezen",()=>{const {root,plan,feiten}=basis();const ander=f(nieuwFeit("aanpak","Andere route",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[stap()]}),5);expect(actueleAanpakken(root.actie.sleutel,[...feiten,ander])).toHaveLength(2);expect(plan.actie.stappen).toHaveLength(2);});
 it("accepteert stapstatus uitsluitend van maker of uitvoerder",()=>{const {plan,a,feiten}=basis();const status=nieuwFeit("stapstatus","Gereed",{soort:"eigen"},{doel:plan.actie.sleutel,stap:a.id,keuze:"klaar"});const r=[...feiten,f(status,4,99)].map(x=>({id:x.bericht,afzender:x.afzender,tijd:x.tijd,weg:false,bericht:x.actie}));expect(projectFeiten(r)).toHaveLength(3);expect(stapStand(plan,a,[...feiten,f(status,4,99)])).toBeUndefined();expect(volgendeStappen(plan,[...feiten,f(status,4)])[1].uitvoerbaar).toBe(true);});
 it("reset bevestiging na gewijzigde resultaatcriteria, ook als een latere versie teruggaat",()=>{const {plan,a,feiten}=basis();const status=f(nieuwFeit("stapstatus","Gereed",{soort:"eigen"},{doel:plan.actie.sleutel,stap:a.id,keuze:"klaar"}),4);const p2=f(nieuwFeit("aanpak","Nieuw criterium",{soort:"eigen"},{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:[{...a,klaarAls:"Test geslaagd"}]}),5);const p3=f(nieuwFeit("aanpak","Terug",{soort:"eigen"},{doel:plan.actie.doel,vervangt:p2.actie.sleutel,stappen:[a]}),6);expect(stapStand(p3,a,[...feiten,status,p2,p3])).toBeUndefined();});
 it("weigert onmogelijke en dubbele Nederlandse kloktijden",()=>{expect(()=>nederlandseInstant("2026-03-29T02:30")).toThrow();expect(()=>nederlandseInstant("2026-10-25T02:30")).toThrow();expect(nederlandseInstant("2026-10-29T10:00")).toBe("2026-10-29T09:00:00.000Z");expect(()=>tijdInstant("2026-02-30T10:00:00Z")).toThrow();});
 it("plant om eigen afspraken heen en houdt vervolgstappen voorwaardelijk",()=>{const {plan,feiten}=basis();const agenda=[{id:1,start:"2026-10-29T10:00",einde:"2026-10-29T10:45",titel:"Bezet"}] as Afspraak[];const r=tijdVoorstellen(8,plan,feiten,1,agenda,nu);expect(r[0].van).toBe("2026-10-29T09:45:00.000Z");expect(r[1].voorwaardelijk).toBe(true);expect(r[1].van).toBe(r[0].tot);});
 it("respecteert volle dagen en deadlines",()=>{const {plan,feiten}=basis();const r=tijdVoorstellen(8,plan,feiten,1,[{id:1,start:"2026-10-29",titel:"Vrij"}] as Afspraak[],nu);expect(r[0].van).toBeUndefined();expect(r[1].reden).toContain("voorganger");});
 it("bewaart alleen een actueel eigen voorstel, idempotent met inhoudscontrole",()=>{const {plan,feiten,a}=basis();const g=gegevens(),r=tijdVoorstellen(8,plan,feiten,1,[],nu)[0];const p={opdracht:crypto.randomUUID(),gesprek:8,aanpak:plan.actie.sleutel,stap:a.id,van:r.van!,tot:r.tot!};tijdVastleggen(g,p,feiten,1,nu);tijdVastleggen(g,p,feiten,1,nu);expect(g.afspraken).toHaveLength(1);expect(()=>tijdVastleggen(g,{...p,tot:"2026-10-29T11:00:00Z"},feiten,1,nu)).toThrow();expect(()=>tijdVastleggen(gegevens(),p,feiten,2,nu)).toThrow();});
 it("weigert een inmiddels bezet tijdvak en onveilige ID-teller",()=>{const {plan,feiten,a}=basis();const r=tijdVoorstellen(8,plan,feiten,1,[],nu)[0],p={opdracht:crypto.randomUUID(),gesprek:8,aanpak:plan.actie.sleutel,stap:a.id,van:r.van!,tot:r.tot!};const g=gegevens();g.afspraken.push({id:1,titel:"Nieuwe afspraak",start:"2026-10-29T10:00",einde:"2026-10-29T11:00"} as Afspraak);expect(()=>tijdVastleggen(g,p,feiten,1,nu)).toThrow("gewijzigd");const leeg=gegevens();leeg.volgend_id=NaN;expect(()=>tijdVastleggen(leeg,p,feiten,1,nu)).toThrow("ID");});
});
describe("als-regels met onbekend als afzonderlijke uitkomst",()=>{
 const setup=()=>{const {root,feiten}=basis();const r:AlsRegel={id:crypto.randomUUID(),gesprek:8,waarom:root.actie.sleutel,modus:"alle",voorwaarden:[{soort:"betaling_bevestigd",bron:"42"}],vervolg:"planning"};return{r,feiten};};
 it("behandelt chatclaims, cash en verouderde betaalinformatie nooit als dienstbewijs",()=>{const {r,feiten}=setup();expect(beoordeelAls(r,feiten,[],nu).status).toBe("onbekend");for(const [betaalwijze,gecontroleerd] of [["contant",nu],["app",nu-60001]] as const)expect(beoordeelAls(r,feiten,[{dienst:"betaling",id:42,status:"betaald",gecontroleerd,betaalwijze}],nu).status).toBe("onbekend");});
 it("erkent actuele appbetaling en blokkeert terugbetaald of geschil",()=>{const {r,feiten}=setup();for(const status of ["betaald","terugbetaald","geschil"]){expect(beoordeelAls(r,feiten,[{dienst:"betaling",id:42,status,gecontroleerd:nu,betaalwijze:"app"}],nu).status).toBe(status==="betaald"?"voldaan":"niet_voldaan");}});
 it("combineert voorwaarden met drie uitkomsten en vereist het waarom",()=>{const {r,feiten}=setup();r.voorwaarden.push({soort:"tijd_bereikt",bron:"2026-10-29T09:00:00Z"});expect(beoordeelAls(r,feiten,[],nu).status).toBe("niet_voldaan");r.modus="een";expect(beoordeelAls(r,feiten,[],nu).status).toBe("onbekend");expect(beoordeelAls(r,feiten,[],nu+2*3600000).status).toBe("voldaan");expect(beoordeelAls(r,[],[],nu+2*3600000).status).toBe("onbekend");});
 it("weigert uitvoerbare code, onbegrensde regels en onleesbare opslag",()=>{const {r}=setup();expect(()=>alsRegel({...r,webhook:"https://voorbeeld.invalid"})).toThrow();expect(()=>alsRegel({...r,voorwaarden:Array(6).fill(r.voorwaarden[0])})).toThrow();const g=gegevens();g.projectRegels="kapot";expect(()=>bewaarAlsRegel(g,r)).toThrow("onleesbaar");});
 it("herhaalt persoonlijke opslag zonder duplicaten en weigert gewijzigde inhoud onder hetzelfde ID",()=>{const {r}=setup();const g=gegevens();bewaarAlsRegel(g,r);bewaarAlsRegel(g,r);expect(g.projectRegels).toHaveLength(1);expect(()=>bewaarAlsRegel(g,{...r,vervolg:"betaling"})).toThrow("andere inhoud");});
});
it("verwijdert persoonlijke regels idempotent en beschermt intussen gewijzigde regels",async()=>{
 const {bewaarAlsRegel,verwijderAlsRegel}=await import("./projectals");const {root}=basis();const r:AlsRegel={id:crypto.randomUUID(),gesprek:8,waarom:root.actie.sleutel,modus:"alle",voorwaarden:[{soort:"betaling_bevestigd",bron:"42"}],vervolg:"planning"};
 const g=gegevens();bewaarAlsRegel(g,r);expect(()=>verwijderAlsRegel(g,{...r,vervolg:"betaling"})).toThrow("gewijzigd");verwijderAlsRegel(g,r);verwijderAlsRegel(g,r);expect(g.projectRegels).toEqual([]);
});
describe("hercontrole van bestaande projecttijden",()=>{
 const afspraak=(plan:Feit,s:Stap,start="2026-10-29T10:00",einde="2026-10-29T10:30")=>({id:1,titel:s.titel,start,einde,projectplanning:{gesprek:8,aanpak:plan.actie.sleutel,stap:s.id,opdracht:crypto.randomUUID()}} as Afspraak);
 it("neemt een oud halfuur niet over als de stap nu een uur duurt en blokkeert opvolgers",()=>{
   const {plan,a,feiten}=basis();const nieuw=f(nieuwFeit("aanpak","Een uur nodig",{soort:"eigen"},{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:plan.actie.stappen!.map(s=>s.id===a.id?{...s,minuten:60}:s)}),4);
   const agenda=[afspraak(plan,a)],vooraf=JSON.stringify(agenda);const r=tijdVoorstellen(8,nieuw,[...feiten,nieuw],1,agenda,nu);
   expect(r[0].teControleren).toBe(true);expect(r[0].reden).toContain("te kort");expect(r[1].van).toBeUndefined();expect(JSON.stringify(agenda)).toBe(vooraf);
 });
 it("accepteert de bestaande afspraak weer als de gebruiker hem passend heeft aangepast",()=>{
   const {plan,a,feiten}=basis();const nieuw=f(nieuwFeit("aanpak","Een uur nodig",{soort:"eigen"},{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:[{...a,minuten:60}]}),4);
   const r=tijdVoorstellen(8,nieuw,[...feiten,nieuw],1,[afspraak(plan,a,"2026-10-29T10:00","2026-10-29T11:00")],nu)[0];expect(r.teControleren).not.toBe(true);expect(r.reden).toBe("Al in je eigen agenda");
 });
 it("blokkeert bestaande tijden voorbij een nieuwe deadline",()=>{
   const {plan,a,feiten}=basis();const nieuw=f(nieuwFeit("aanpak","Eerder klaar",{soort:"eigen"},{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:[a],uiterlijk:"2026-10-29T09:15:00Z"}),4);
   const r=tijdVoorstellen(8,nieuw,[...feiten,nieuw],1,[afspraak(plan,a)],nu)[0];expect(r.teControleren).toBe(true);expect(r.reden).toContain("deadline");
 });
 it("weigert een bestaand tijdvak vóór de huidige voorganger eindigt",()=>{
   const {plan,a,b,feiten}=basis();const agenda=[afspraak(plan,a,"2026-10-29T11:00","2026-10-29T11:30"),{...afspraak(plan,b,"2026-10-29T10:00","2026-10-29T10:30"),id:2}];
   const r=tijdVoorstellen(8,plan,feiten,1,agenda,nu);expect(r[1].teControleren).toBe(true);expect(r[1].reden).toContain("voorganger eindigt");
 });
 it("hercontroleert overlap met andere afspraken en verstreken tijden",()=>{
   const {plan,a,feiten}=basis();const agenda=[afspraak(plan,a),{id:2,titel:"Tussengekomen",start:"2026-10-29T10:15",einde:"2026-10-29T11:00"} as Afspraak];
   expect(tijdVoorstellen(8,plan,feiten,1,agenda,nu)[0].reden).toContain("overlap");expect(tijdVoorstellen(8,plan,feiten,1,[afspraak(plan,a)],nu+4*3600000)[0].reden).toContain("verstreken");
 });
 it("past dezelfde duurcontrole toe op tijden van een andere deelnemer",()=>{
   const {plan,a,feiten}=basis();const delen=f(nieuwFeit("staptijd","Mijn tijd",{soort:"eigen"},{doel:plan.actie.sleutel,stap:a.id,afspraak:1,van:"2026-10-29T09:00:00Z",tot:"2026-10-29T09:15:00Z"}),4);
   const r=tijdVoorstellen(8,plan,[...feiten,delen],2,[],nu)[0];expect(r.teControleren).toBe(true);expect(r.reden).toContain("te kort");
 });
 it("vermijdt overlap met gedeelde tijden, ook als die later in de staplijst staan",()=>{
   const {root,a,feiten}=basis();const vrij=stap(),plan=f(nieuwFeit("aanpak","Twee losse stappen",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[vrij,a]}),6);
   const gedeeld=f(nieuwFeit("staptijd","Mijn tijd",{soort:"eigen"},{doel:plan.actie.sleutel,stap:a.id,afspraak:1,van:"2026-10-29T09:00:00Z",tot:"2026-10-29T09:30:00Z"}),7);
   const r=tijdVoorstellen(8,plan,[...feiten,plan,gedeeld],2,[],nu);expect(r[0].van).toBe("2026-10-29T09:30:00.000Z");
 });
});
