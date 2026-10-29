import { expect, it } from "vitest";
import type { Gegevens } from "../api";
import { nieuwFeit, type Feit } from "./projectregie";
import { tijdVoorstellen, tijdVastleggen } from "./projectwanneer";
import { lokaleTijd, nederlandseInstant } from "./projecttijd";
import { privacyVoorbeeld } from "./projectprivacy";
const f=(actie:Feit["actie"],bericht:number,afzender=1):Feit=>({actie,bericht,afzender,tijd:"2026-10-29T08:00:00Z"});
function basis(van:string,tot:string){const root=f(nieuwFeit("actie","Controle"),1),stap={id:crypto.randomUUID(),titel:"Werk",klaarAls:"Gecontroleerd",minuten:30,eigenaar:1,alternatief:"Bespreken",afhankelijkVan:[]},plan=f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[stap]}),2),ven=f(nieuwFeit("werkvenster","Vrij",{soort:"eigen"},{vensters:[{van,tot}]}),3);return{root,stap,plan,feiten:[root,plan,ven]};}
it("slaat geen afgerond tijdvak op vóór de opgegeven beschikbaarheid met seconden",()=>{
 const {stap,plan,feiten}=basis("2026-10-29T09:00:30Z","2026-10-29T12:00:00Z"),nu=Date.parse("2026-10-29T08:00:00Z"),r=tijdVoorstellen(8,plan,feiten,1,[],nu)[0];
 const g={taken:[],afspraken:[],volgend_id:1} as Gegevens;tijdVastleggen(g,{opdracht:crypto.randomUUID(),gesprek:8,aanpak:plan.actie.sleutel,stap:stap.id,van:r.van!,tot:r.tot!},feiten,1,nu);
 expect(Date.parse(nederlandseInstant(g.afspraken[0].start))).toBeGreaterThanOrEqual(Date.parse("2026-10-29T09:00:30Z"));
});
it("biedt alleen kloktijden aan die na opslag eenduidig terug te lezen zijn",()=>{
 const {plan,feiten}=basis("2026-10-25T00:00:00Z","2026-10-25T04:00:00Z"),r=tijdVoorstellen(8,plan,feiten,1,[],Date.parse("2026-10-24T23:50:00Z"))[0];expect(r.van).toBeTruthy();
 expect(()=>nederlandseInstant(lokaleTijd(Date.parse(r.van!)))).not.toThrow();expect(()=>nederlandseInstant(lokaleTijd(Date.parse(r.tot!)))).not.toThrow();
});
it("gebruikt overlappende gedeelde tijden van dezelfde uitvoerder niet als betrouwbare basis",()=>{
 const {root,stap}=basis("2026-10-29T09:00:00Z","2026-10-29T12:00:00Z"),b={...stap,id:crypto.randomUUID(),titel:"Ander werk"},c={...stap,id:crypto.randomUUID(),titel:"Daarna",eigenaar:2,afhankelijkVan:[stap.id,b.id]};
 const plan=f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[stap,b,c]}),2);
 const tijden=[f(nieuwFeit("staptijd","Tijd A",{soort:"eigen"},{doel:plan.actie.sleutel,stap:stap.id,afspraak:1,van:"2026-10-29T09:00:00Z",tot:"2026-10-29T10:00:00Z"}),3),f(nieuwFeit("staptijd","Tijd B",{soort:"eigen"},{doel:plan.actie.sleutel,stap:b.id,afspraak:2,van:"2026-10-29T09:30:00Z",tot:"2026-10-29T10:30:00Z"}),4)];
 const r=tijdVoorstellen(8,plan,[root,plan,...tijden],2,[],Date.parse("2026-10-29T08:00:00Z"));expect(r[0].teControleren).toBe(true);expect(r[1].teControleren).toBe(true);expect(r[2].van).toBeUndefined();
});
it("blokkeert ook herkenbare OpenAI-, GitHub- en AWS-toegangssleutels",()=>{
 for(const s of ["sk-proj-"+"x".repeat(40),"ghp_"+"x".repeat(36),"github_pat_"+"x".repeat(50),"AKIA"+"A".repeat(16)])expect(()=>privacyVoorbeeld(s)).toThrow("geheime sleutel");
});
it("blokkeert herkenbare bearer-tokens zonder gewone uitleg over tokens te weigeren",()=>{
 const jwt=["x".repeat(12),"y".repeat(16),"z".repeat(24)].join(".");expect(()=>privacyVoorbeeld("Authorization: Bearer "+jwt)).toThrow("geheime sleutel");expect(()=>privacyVoorbeeld('refresh_token = "'+jwt+'"')).toThrow("geheime sleutel");expect(privacyVoorbeeld("Bespreek access_token en gebruik een voorbeeld zonder echte sleutel.").inhoud).toContain("access_token");
});
