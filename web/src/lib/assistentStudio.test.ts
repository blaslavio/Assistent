import {afterEach,expect,it,vi} from "vitest";
import {uitvoeren} from "./assistent";
import {studioVerzoekLezen} from "./naar";
import {bijwerken,gegevensLaden} from "../api";
vi.mock("../api",async o=>({...await o<object>(),bijwerken:vi.fn(),gegevensLaden:vi.fn()}));
afterEach(()=>{vi.clearAllMocks();window.dispatchEvent(new Event("assistent-sessie"));});
it("opent vanuit de assistent alleen een scanner of bouwer en wijzigt niets",async()=>{const r=await uitvoeren("studio_openen",{gereedschap:"scannen",evenement:42});expect(studioVerzoekLezen()).toEqual({tool:"scannen",evenement:42});expect(r.resultaat).toContain("Er is niets gepubliceerd");expect(bijwerken).not.toHaveBeenCalled();expect(gegevensLaden).not.toHaveBeenCalled();});
it("weigert een onbekend gereedschap",async()=>{const r=await uitvoeren("studio_openen",{gereedschap:"alles-openen"});expect(r.resultaat).toContain("geldig");expect(studioVerzoekLezen()).toBeNull();});
