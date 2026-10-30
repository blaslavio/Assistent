import { describe, expect, it } from "vitest";
import type { Afspraak, Gegevens } from "../api";
import { bewaarPlek, leesPlekken, planAfstand, routeBriefje, tijdscontrole, vergelijkVolgordes, verwijderPlek, voegStopToe, type Stop } from "./kaartkompas";
import { routeLink } from "./kaart";
const nu=Date.parse("2026-10-30T09:00:00Z");
const tijden={heen:10,bezoek:20,verder:10,buffer:10};
const afspraak=(start="2026-10-30T11:00:00Z",einde?:string):Afspraak=>({id:1,titel:"Privéafspraak",start,einde});
const punt=(id:string,lon:number,prive=false):Stop=>({id,naam:id,lat:0,lon,prive});
const leeg=():Gegevens=>({taken:[],afspraken:[],volgend_id:1});
describe("lokale tijdscontrole",()=>{
 it("rekent heen, bezoek, verder en buffer vóór de volgende afspraak mee",()=>{
  expect(tijdscontrole([afspraak()],nu,tijden)).toMatchObject({status:"past",marge:70});
  expect(tijdscontrole([afspraak("2026-10-30T09:55:00Z")],nu,tijden)).toMatchObject({status:"krap",marge:5});
  expect(tijdscontrole([afspraak("2026-10-30T09:49:00Z")],nu,tijden)).toMatchObject({status:"niet",marge:-1});
 });
 it("verzint geen vrije tijd bij ontbrekende tijden, actieve afspraken of lege agenda",()=>{
  expect(tijdscontrole([],nu,tijden).status).toBe("onbekend");
  expect(tijdscontrole([afspraak("2026-10-30")],nu,tijden).status).toBe("onbekend");
  expect(tijdscontrole([afspraak("2026-10-30T08:00:00Z","2026-10-30T10:00:00Z")],nu,tijden).status).toBe("niet");
  expect(tijdscontrole([afspraak("2026-10-30T08:00:00Z"),afspraak()],nu,tijden).status).toBe("onbekend");
 });
 it("houdt hele-dagafspraken, verkeerde datums en klokwissels onzeker",()=>{
  for(const a of [afspraak("2026-10-25T02:30"),afspraak("2026-03-29T02:30"),afspraak("2026-99-01"),afspraak("geen tijd"),afspraak("2026-10-30T11:00Z","2026-10-30T10:00Z")]) expect(tijdscontrole([a],nu,tijden).status).toBe("onbekend");
  expect(tijdscontrole([{...afspraak("2026-10-29"),einde:"2026-11-02"}],nu,tijden).status).toBe("onbekend");
 });
 it("weigert oningevulde reistijden en ongeldige getallen",()=>{
  for(const heen of [NaN,Infinity,-1,1.5,43201])expect(()=>tijdscontrole([afspraak()],nu,{...tijden,heen})).toThrow();
  expect(()=>tijdscontrole([],1e100,tijden)).toThrow();
 });
 it("houdt de agenda intact en kiest de eerste volgende afspraak",()=>{
  const a=[afspraak("2026-10-30T13:00Z"),{...afspraak("2026-10-30T10:00Z"),id:2}];const voor=structuredClone(a);
  expect(tijdscontrole(a,nu,tijden).volgende?.id).toBe(2);expect(a).toEqual(voor);
 });
});
describe("eigen stopvergelijking",()=>{
 it("vergelijkt alle volgordes en biedt alleen een voorstel",()=>{
  const s=[punt("A",3),punt("B",1),punt("C",2)],voor=structuredClone(s),r=vergelijkVolgordes({lat:0,lon:0},s);
  expect(r.bekeken).toBe(6);expect(r.stops.map(s=>s.id)).toEqual(["B","C","A"]);expect(r.meters).toBeLessThan(planAfstand({lat:0,lon:0},s));expect(s).toEqual(voor);
 });
 it("begrenst vijf stops, voorkomt dubbelen en weigert ongeldige punten",()=>{
  const s=Array.from({length:5},(_,i)=>punt(String(i),i));expect(voegStopToe(s,s[0])).toBe(s);
  expect(()=>voegStopToe(s,punt("nieuw",6))).toThrow("maximaal vijf");expect(()=>vergelijkVolgordes({lat:91,lon:0},s)).toThrow();
 });
 it("behoudt in 1000 wereldwijde plannen exact de stops zonder een slechtere afstand",()=>{
  let seed=30102026;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/2**32);
  for(let i=0;i<1000;i++){
   const s=Array.from({length:2+i%4},(_,j)=>({...punt(String(j),random()*360-180),lat:random()*160-80}));
   const origin={lat:random()*160-80,lon:random()*360-180},rond=i%2===0,voor=structuredClone(s),r=vergelijkVolgordes(origin,s,rond);
   expect(r.stops.map(x=>x.id).sort()).toEqual(s.map(x=>x.id).sort());expect(r.meters).toBeLessThanOrEqual(planAfstand(origin,s,rond)+.01);expect(Number.isFinite(r.meters)).toBe(true);expect(s).toEqual(voor);
  }
 });
});
describe("privéplekken en overdracht",()=>{
 it("bewaart één plek na een verloren antwoord, met behoud van andere gegevens",()=>{
  const g=leeg(),p=punt("privé",1,true);g.taken.push({id:1,titel:"Blijft",klaar:false});
  bewaarPlek(g,p,[]);bewaarPlek(g,p,[]);expect(leesPlekken(g)).toHaveLength(1);expect(g.taken[0].titel).toBe("Blijft");
 });
 it("overschrijft geen concurrerende wijziging of onbekende gegevens",()=>{
  const g=leeg(),p=punt("A",1,true);bewaarPlek(g,p,[]);const voor=structuredClone(g);
  expect(()=>bewaarPlek(g,punt("B",2,true),[])).toThrow("elders gewijzigd");expect(g).toEqual(voor);
  g.kaartplekken=[{...p,notitie:"Niet wissen"}];expect(()=>bewaarPlek(g,punt("B",2,true),[])).toThrow("onbekende velden");expect((g.kaartplekken as {notitie:string}[])[0].notitie).toBe("Niet wissen");
 });
 it("verwijdert gericht en weigert een gewijzigde plek",()=>{
  const g=leeg(),p=punt("A",1,true);bewaarPlek(g,p,[]);bewaarPlek(g,punt("B",2,true),leesPlekken(g));
  expect(()=>verwijderPlek(g,{...p,naam:"Oude naam"})).toThrow("gewijzigd");verwijderPlek(g,p);verwijderPlek(g,p);expect(leesPlekken(g).map(p=>p.id)).toEqual(["B"]);
 });
 it("stopt bij dertig plekken en verandert de lijst dan niet",()=>{
  const g=leeg();for(let i=0;i<30;i++)bewaarPlek(g,punt(String(i),i,true),leesPlekken(g));const voor=structuredClone(g);
  expect(()=>bewaarPlek(g,punt("31",31,true),leesPlekken(g))).toThrow("dertig");expect(g).toEqual(voor);
 });
 it("deelt geen privélabels, vertrekpunt, agenda of coördinaten zonder extra keuze",()=>{
  const s=[punt("Openbare winkel",1),{...punt("Geheime locatie",5.12345,true),lat:52.12345}];const b=routeBriefje(s,tijden);
  expect(b).not.toContain("Geheime locatie");expect(b).not.toContain("52.12345");expect(b).not.toContain("5.12345");expect(b).toContain("Openbare winkel");
  expect(routeBriefje(s,undefined)).toContain("nog niet beschikbaar");expect(routeBriefje(s,tijden,true)).toContain("Geheime locatie");
  const url=routeLink({...s[1],naam:s[1].naam},"apple");expect(url).not.toContain("Geheime");expect(url).toContain("52.12345");
 });
});

describe("automatische eigen reistijdindicatie",()=>{
 it("geeft zonder gebruikersminuten een bandbreedte per vervoermiddel",async()=>{
  const {schatReistijd}=await import("./kaartkompas");
  for(const wijze of ["auto","fiets","lopen","ov"] as const){const r=schatReistijd({lat:52.09,lon:5.12},{lat:52.37,lon:4.89},wijze);expect(r.laag).toBeGreaterThan(0);expect(r.hoog).toBeGreaterThan(r.laag);}
 });
 it("maakt verre reizen niet korter en markeert de onzekerheid",async()=>{
  const {schatReistijd}=await import("./kaartkompas");const o={lat:0,lon:0};
  const dichtbij=schatReistijd(o,{lat:0,lon:1},"auto"),ver=schatReistijd(o,{lat:0,lon:5},"auto");expect(ver.hoog).toBeGreaterThan(dichtbij.hoog);expect(ver.toelichting).toContain("lange afstand");
  expect(()=>schatReistijd({lat:NaN,lon:0},o,"auto")).toThrow();
 });
});

it("houdt autoschattingen oplopend bij wisselen van afstandssegment",async()=>{
 const {schatReistijd}=await import("./kaartkompas");let vorig=0;
 for(let i=0;i<1000;i++){const r=schatReistijd({lat:0,lon:0},{lat:0,lon:i*.001},"auto");expect(r.hoog).toBeGreaterThanOrEqual(vorig);vorig=r.hoog;}
});
