import { describe, expect, it } from "vitest";
import { masterOverzicht, masterChecklist } from "./mastercode";
import { nieuwFeit, type Feit } from "./projectregie";
const f=(actie:ReturnType<typeof nieuwFeit>,bericht:number):Feit=>({actie,bericht,afzender:2,tijd:"2026-11-01T10:00:00Z"});
const root=f(nieuwFeit("actie","Waarom dit project?"),1);
const stap={id:crypto.randomUUID(),titel:"Uitvoeren",klaarAls:"Resultaat gezien",minuten:30,alternatief:"Overleggen",afhankelijkVan:[],eigenaar:2};
const plan=f(nieuwFeit("aanpak","Actieplan",{soort:"eigen"},{doel:root.actie.sleutel,stappen:[stap]}),2);
const taak={id:1,titel:"Privé afspraak",klaar:false};
describe("mastercode: privacy en enkelvoudige projectie",()=>{
 it("toont geen privé-taken aan een ander projectlid",()=>{
  const uit=masterOverzicht([taak],[root,plan],{actor:2,taakEigenaar:1,projectleden:[2]});
  expect(uit).toHaveLength(1);expect(uit[0].soort).toBe("projectstap");
  expect(uit.map(x=>x.titel)).not.toContain("Privé afspraak");
 });
 it("toont geen projectdetails zonder projectlidmaatschap",()=>{
  const uit=masterOverzicht([taak],[root,plan],{actor:1,taakEigenaar:1,projectleden:[2]});
  expect(uit).toHaveLength(1);expect(uit[0].soort).toBe("taak");
  expect(()=>masterChecklist(plan,[root,plan],{actor:1,taakEigenaar:1,projectleden:[2]})).toThrow();
 });
 it("gebruikt stabiele bron-identiteiten en het bestaande waarom",()=>{
  const uit=masterOverzicht([taak],[root,plan],{actor:2,taakEigenaar:1,projectleden:[2]});
  expect(uit[0].sleutel).toBe(`project:${plan.actie.sleutel}:${stap.id}`);
  expect(uit[0].waarom).toBe("Waarom dit project?");
  expect(masterChecklist(plan,[root,plan],{actor:2,taakEigenaar:1,projectleden:[2]}).voortgang).toBe(0);
 });
 it("wijzigt de brondata niet",()=>{
  const input=[root,plan];const snapshot=JSON.stringify(input);
  masterOverzicht([taak],input,{actor:2,taakEigenaar:1,projectleden:[2]});
  expect(JSON.stringify(input)).toBe(snapshot);
 });
});
