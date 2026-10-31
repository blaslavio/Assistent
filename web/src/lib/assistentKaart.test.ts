import {afterEach,expect,it,vi} from "vitest";
import {uitvoeren} from "./assistent";
import {bijwerken,gegevensLaden} from "../api";
import {kaartContextLezen,kaartGevraagd} from "./naar";
vi.mock("../api",async o=>({...await o<object>(),bijwerken:vi.fn(),gegevensLaden:vi.fn()}));
afterEach(()=>{vi.clearAllMocks();window.dispatchEvent(new Event("assistent-sessie"));});
it("zet een chatadres alleen lokaal klaar zonder geocodering of gegevenswijziging",async()=>{
 await uitvoeren("kaart_openen",{adres:"Utrecht"});expect(kaartGevraagd()).toBe(true);expect(kaartContextLezen()).toEqual({adres:"Utrecht",bron:"chat",titel:"Bestemming uit gesprek"});expect(bijwerken).not.toHaveBeenCalled();expect(gegevensLaden).not.toHaveBeenCalled();
});
it("weigert een ongeldig adres zonder de kaart te openen",async()=>{
 const r=await uitvoeren("kaart_openen",{adres:"a".repeat(301)});expect(r.resultaat).toContain("ongeldig");expect(kaartGevraagd()).toBe(false);
});
