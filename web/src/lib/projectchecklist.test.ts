import { describe, expect, it } from "vitest";
import { nieuwFeit, type Feit } from "./projectregie";
import { checklistGoedkeuring, checklistStem, checklistOverzicht, checklistStap, AKKOORD, AFWIJZEN } from "./projectchecklist";
const maak=(a:ReturnType<typeof nieuwFeit>,bericht:number,afzender=1):Feit=>({actie:a,bericht,afzender,tijd:"2026-11-01T10:00:00Z"});
const root=maak(nieuwFeit("actie","Een resultaat opleveren"),1);
const step=()=>({id:crypto.randomUUID(),titel:"Controleren",klaarAls:"Gecontroleerd",minuten:20,alternatief:"Later",afhankelijkVan:[] as string[],eigenaar:1});
const plan=maak(nieuwFeit("aanpak","Checklist",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[step()]}),2);
const basis=[root,plan];
describe("persistente projectchecklist op bestaande projectfeiten",()=>{
 it("vereist expliciet akkoord van alle actieve leden",()=>{
  expect(checklistGoedkeuring(plan,basis,[1,2]).goedgekeurd).toBe(false);
  const a=maak(checklistStem(plan,basis,1,[1,2],true),3);
  expect(checklistGoedkeuring(plan,[...basis,a],[1,2]).wachtOp).toEqual([2]);
  const b=maak(checklistStem(plan,basis,2,[1,2],true),4,2);
  expect(checklistGoedkeuring(plan,[...basis,a,b],[1,2]).goedgekeurd).toBe(true);
  expect(checklistGoedkeuring(plan,[...basis,a,b],[1,2,3]).goedgekeurd).toBe(false);
 });
 it("laat intrekking winnen boven eerdere goedkeuring",()=>{
  const a=maak(nieuwFeit("besluit",AKKOORD,{soort:"eigen"},{doel:plan.actie.sleutel}),3);
  const b=maak(nieuwFeit("besluit",AFWIJZEN,{soort:"eigen"},{doel:plan.actie.sleutel}),4);
  expect(checklistGoedkeuring(plan,[...basis,a,b],[1]).afgewezen).toBe(true);
 });
 it("weigert stemmen door buitenstaanders en op vervangen plan",()=>{
  expect(()=>checklistStem(plan,basis,3,[1,2],true)).toThrow();
  const nieuw=maak(nieuwFeit("aanpak","Andere versie",{soort:"eigen"},{doel:root.actie.sleutel,vervangt:plan.actie.sleutel,stappen:[step()]}),5);
  expect(()=>checklistStem(plan,[...basis,nieuw],1,[1],true)).toThrow();
 });
 it("blokkeert afronden zonder akkoord en geeft na akkoord voortgang",()=>{
  expect(()=>checklistStap(plan,plan.actie.stappen![0].id,basis,1,[1],"klaar")).toThrow();
  const stem=maak(checklistStem(plan,basis,1,[1],true),3);
  const actie=checklistStap(plan,plan.actie.stappen![0].id,[...basis,stem],1,[1],"klaar");
  const klaar=maak(actie,4);
  expect(checklistOverzicht(plan,[...basis,stem,klaar],[1]).voortgang).toBe(100);
 });
 it("laat lege ledenlijst nooit automatisch akkoord zijn",()=>{
  expect(checklistGoedkeuring(plan,basis,[]).goedgekeurd).toBe(false);
 });
});
