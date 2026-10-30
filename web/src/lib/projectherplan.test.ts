import { expect, it } from "vitest";
import type { Gegevens, Afspraak } from "../api";
import { nieuwFeit, type Feit } from "./projectregie";
import { herplanVoorstel, herplanVastleggen } from "./projectherplan";
const nu=Date.parse("2026-10-29T09:00:00Z");
const f=(actie:Feit["actie"],bericht:number):Feit=>({actie,bericht,afzender:1,tijd:"2026-10-29T08:00:00Z"});
function basis(){
 const root=f(nieuwFeit("actie","Ontwerp"),1),s={id:crypto.randomUUID(),titel:"Uitwerken",klaarAls:"Goedgekeurd",minuten:60,eigenaar:1,alternatief:"Samen",afhankelijkVan:[]};
 const plan=f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[s]}),2);
 const ven=f(nieuwFeit("werkvenster","Vrij",{soort:"eigen"},{vensters:[{van:"2026-10-29T10:00:00Z",tot:"2026-10-29T14:00:00Z"}]}),3);
 const g={taken:[],afspraken:[{id:1,titel:"Uitwerken",start:"2026-10-29T09:00",einde:"2026-10-29T09:30",soort:"focus",notitie:"Bewaar mij",projectplanning:{gesprek:8,aanpak:plan.actie.sleutel,stap:s.id,opdracht:crypto.randomUUID()}}],volgend_id:2} as Gegevens;
 return{g,plan,s,feiten:[root,plan,ven]};
}
it("maakt alleen een voorstel en verplaatst na bevestigen dezelfde afspraak zonder gegevensverlies",()=>{
 const {g,plan,s,feiten}=basis(),vooraf=JSON.stringify(g),p=herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten,1,nu);
 expect(JSON.stringify(g)).toBe(vooraf);expect(p.van).toBe("2026-10-29T10:00:00.000Z");herplanVastleggen(g,p,feiten,1,nu);expect(g.afspraken).toHaveLength(1);expect(g.afspraken[0]).toMatchObject({id:1,start:"2026-10-29T11:00",einde:"2026-10-29T12:00",notitie:"Bewaar mij"});herplanVastleggen(g,p,feiten,1,nu);expect(g.afspraken).toHaveLength(1);expect(g.volgend_id).toBe(2);
});
it("weigert een intussen gewijzigde afspraak en een veranderd vrij tijdvak",()=>{
 const {g,plan,s,feiten}=basis(),p=herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten,1,nu);g.afspraken[0].titel="Anders";expect(()=>herplanVastleggen(g,p,feiten,1,nu)).toThrow("intussen gewijzigd");g.afspraken[0].titel="Uitwerken";
 g.afspraken.push({id:2,titel:"Bezet",start:"2026-10-29T11:00",einde:"2026-10-29T12:00"} as Afspraak);expect(()=>herplanVastleggen(g,p,feiten,1,nu)).toThrow("niet meer passend");expect(g.afspraken[0].start).toBe("2026-10-29T09:00");
});
it("verplaatst geen afspraak van een andere eigenaar of buiten dit project",()=>{
 const {g,plan,s,feiten}=basis();expect(()=>herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten,2,nu)).toThrow();expect(()=>herplanVoorstel(g,9,plan.actie.sleutel,s.id,1,feiten,1,nu)).toThrow("eigen focusafspraak");g.afspraken[0].soort="werk";expect(()=>herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten,1,nu)).toThrow();
});
it("weigert inhoud onder een reeds gebruikte herplanningsopdracht te veranderen",()=>{
 const {g,plan,s,feiten}=basis(),p=herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten,1,nu);herplanVastleggen(g,p,feiten,1,nu);expect(()=>herplanVastleggen(g,{...p,tot:"2026-10-29T13:00:00Z"},feiten,1,nu)).toThrow("andere inhoud");
});
it("weigert herplannen zonder beschikbaarheid of bij een vervangen aanpak",()=>{
 const {g,plan,s,feiten}=basis();expect(()=>herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten.slice(0,2),1,nu)).toThrow("Geen zelfstandig");const nieuw=f(nieuwFeit("aanpak","Nieuw",{soort:"eigen"},{doel:plan.actie.doel,vervangt:plan.actie.sleutel,stappen:[s]}),4);expect(()=>herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,[...feiten,nieuw],1,nu)).toThrow("vervangen");
});
it("verplaatst geen externe agenda-afspraak, ook niet met een projectlabel",()=>{
 const {g,plan,s,feiten}=basis();g.afspraken[0].extern=true;expect(()=>herplanVoorstel(g,8,plan.actie.sleutel,s.id,1,feiten,1,nu)).toThrow("eigen focusafspraak");
});
