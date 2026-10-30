import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { bewaren, botsingen, centen, controleer, inAgenda, kosten, nachten, plannen, reisbrief, verwijderen, agendaStand, vertrekKompas, reisVandaag, reisDatum, VOORBEREIDING, type Vakantie } from "./vakantie";
import { dagenVan } from "./club";
const plan = (): Vakantie => ({id:"00000000-0000-4000-8000-000000000001",titel:"Zomervakantie",plaats:"Gent, België",van:"2030-05-01",tot:"2030-05-05",personen:2,budget:100000,verblijf:45000,vervoer:15000,perDag:2000,checklist:[]});
const leeg = (): Gegevens => ({taken:[],afspraken:[],volgend_id:1});
describe("Vakantieplannen",()=>{
 it("telt nachten zonder zomer-/wintertijd-afwijkingen",()=>{
   expect(nachten("2026-03-28","2026-03-30")).toBe(2);
   expect(nachten("2026-10-24","2026-10-26")).toBe(2);
   expect(nachten("2028-02-28","2028-03-01")).toBe(2);
 });
 it("weigert verzonnen datums, omgekeerde periodes en meer dan negentig nachten",()=>{
   for(const [a,b] of [["2030-02-30","2030-03-02"],["2030-05-05","2030-05-01"],["2030-05-01","2030-05-01"],["2030-01-01","2030-05-01"]])expect(()=>nachten(a,b)).toThrow();
 });
 it("rekent in centen en telt dagbudget per reiziger inclusief beide reisdagen",()=>{
   expect(centen("12,95")).toBe(1295);expect(centen("0.10")).toBe(10);
   expect(()=>centen("12.345")).toThrow();expect(()=>centen("-5")).toThrow();expect(()=>centen("1e3")).toThrow();
   expect(kosten(plan())).toEqual({nachten:4,dagen:5,totaal:80000,verschil:20000});
 });
 it("bewaart geen reservering of betaalstatus en herhaalt veilig",()=>{
   const g=leeg();bewaren(g,plan());bewaren(g,plan());
   expect(plannen(g)).toHaveLength(1);expect(g.afspraken).toHaveLength(0);expect(g.reserveringen).toBeUndefined();
 });
 it("bewaart andere gegevens en weigert onleesbare bestaande opslag",()=>{
   const g=leeg();g.vakanties={fout:true};expect(()=>bewaren(g,plan())).toThrow();expect(g.vakanties).toEqual({fout:true});
   for(const x of [null,{}, {...plan(),personen:0},{...plan(),budget:NaN}])expect(()=>controleer(x as Vakantie)).toThrow();
 });
 it("voorkomt overschrijven van elders gewijzigd plan en maakt bijstellen herhaalbaar",()=>{
   const g=leeg(),p=plan();bewaren(g,p);const gewijzigd={...p,budget:110000};bewaren(g,gewijzigd,p);bewaren(g,gewijzigd,p);
   expect(plannen(g)[0].budget).toBe(110000);expect(()=>bewaren(g,{...p,titel:"Verouderde wijziging"},p)).toThrow();
 });
 it("zet één meerdaagse afspraak inclusief terugreisdag in de bestaande agenda",()=>{
   const g=leeg(),p=plan();bewaren(g,p);inAgenda(g,p);inAgenda(g,p);
   expect(g.afspraken).toHaveLength(1);expect(dagenVan(g.afspraken[0])).toEqual(["2030-05-01","2030-05-02","2030-05-03","2030-05-04","2030-05-05"]);
   expect(g.afspraken[0].notitie).toContain("geen reserverings-");
 });
 it("toont ook het laatste deel van een negentig-nachtenreis in de agenda",()=>{
   const g=leeg(),p={...plan(),van:"2030-01-01",tot:"2030-04-01"};bewaren(g,p);inAgenda(g,p);
   expect(dagenVan(g.afspraken[0])).toHaveLength(91);
 });
 it("beschermt een handmatig gewijzigde agenda-afspraak",()=>{
   const g=leeg(),p=plan();bewaren(g,p);inAgenda(g,p);g.afspraken[0].titel="Zelf gewijzigd";
   expect(()=>inAgenda(g,p)).toThrow();expect(g.afspraken[0].titel).toBe("Zelf gewijzigd");
 });
 it("controleert overlap lokaal en neemt onleesbare afspraak mee voor controle",()=>{
   const p=plan();expect(botsingen([{id:1,titel:"Werk",start:"2030-05-03T10:00"},{id:2,titel:"Later",start:"2030-06-01"},{id:3,titel:"Onzeker",start:"fout"}],p).map(a=>a.id)).toEqual([1,3]);
 });
 it("verwijdert alleen het plan, geen agenda-afspraak of reservering",()=>{
   const g=leeg(),p=plan();bewaren(g,p);inAgenda(g,p);g.reserveringen=["bestaand"];verwijderen(g,p);verwijderen(g,p);
   expect(plannen(g)).toHaveLength(0);expect(g.afspraken).toHaveLength(1);expect(g.reserveringen).toEqual(["bestaand"]);
 });
 it("reisbrief bevat alleen eigen planvelden, nooit account of huisadres",()=>{
   const p=plan();const brief=reisbrief(p);expect(brief).toContain("Dit plan is geen boeking");expect(brief).not.toContain(p.id);expect(brief).toContain("Begroting");
 });
});

it("laat een ongewijzigde vakantie-afspraak atomair meeschuiven met het plan",()=>{
 const g=leeg(),p=plan();bewaren(g,p);inAgenda(g,p);
 const nieuw={...p,titel:"Andere reis",van:"2030-06-01",tot:"2030-06-05",plaats:"Brugge"};bewaren(g,nieuw,p);bewaren(g,nieuw,p);
 expect(g.afspraken).toHaveLength(1);expect(g.afspraken[0]).toMatchObject({start:nieuw.van,einde:nieuw.tot,locatie:nieuw.plaats});expect(agendaStand(g.afspraken,nieuw)).toBe("actueel");
});
it("behoudt eigen agenda-aanpassingen bij een planwijziging, ook extra velden",()=>{
 const g=leeg(),p=plan();bewaren(g,p);inAgenda(g,p);g.afspraken[0].notitie="Mijn sleutelafspraak";
 const nieuw={...p,tot:"2030-05-06"};bewaren(g,nieuw,p);
 expect(g.afspraken[0].einde).toBe(p.tot);expect(g.afspraken[0].notitie).toBe("Mijn sleutelafspraak");expect(agendaStand(g.afspraken,nieuw)).toBe("aangepast");
 const h=leeg();bewaren(h,p);inAgenda(h,p);h.afspraken[0].extern=true;bewaren(h,nieuw,p);expect(h.afspraken[0].einde).toBe(p.tot);
});
it("een verouderde planwijziging raakt ook de agenda niet",()=>{
 const g=leeg(),p=plan();bewaren(g,p);inAgenda(g,p);bewaren(g,{...p,budget:120000},p);
 const vooraf=structuredClone(g.afspraken);expect(()=>bewaren(g,{...p,tot:"2030-05-06"},p)).toThrow();expect(g.afspraken).toEqual(vooraf);
});
it("vertrekkompas gebruikt Amsterdamse kalenderdagen rond middernacht",()=>{
 expect(reisVandaag(new Date("2026-10-30T23:30:00Z"))).toBe("2026-10-31");
 expect(reisVandaag(new Date("2026-03-29T22:30:00Z"))).toBe("2026-03-30");
 expect(reisDatum("2030-05-01")).toContain("2030");expect(()=>reisDatum("2030-02-30")).toThrow();
});
it("vertrekkompas geeft een volgende stap en doet geen boekingsbelofte",()=>{
 const p=plan(),g=leeg();expect(vertrekKompas(p,[],"2030-04-01").stap).toContain("agenda");
 expect(vertrekKompas({...p,budget:100},[],"2030-04-01").stap).toContain("overschrijdt");
 expect(vertrekKompas(p,[],"2030-04-30").stap).toBe(VOORBEREIDING[0]);
 expect(vertrekKompas(p,[],p.van).fase).toContain("vandaag");expect(vertrekKompas(p,[],"2030-05-06").fase).toContain("voorbij");
 bewaren(g,p);inAgenda(g,p);const klaar={...p,checklist:[...VOORBEREIDING]};expect(vertrekKompas(klaar,g.afspraken,"2030-04-30").stap).toContain("bevestigingen");
});
