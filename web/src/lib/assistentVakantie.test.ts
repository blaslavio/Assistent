import { expect, it, vi } from "vitest";
import { context, uitvoeren } from "./assistent";
import { bijwerken, gegevensLaden } from "../api";
vi.mock("../api",async origineel=>({...await origineel<object>(),bijwerken:vi.fn(),gegevensLaden:vi.fn()}));
it("assistent opent het bestaande vakantieonderdeel zonder gegevens te lezen of te wijzigen",async()=>{
 const open=vi.fn();window.addEventListener("agenda-vakanties",open);
 try{const r=await uitvoeren("vakantie_openen",{});expect(open).toHaveBeenCalledOnce();expect(r.resultaat).toContain("niets geboekt of betaald");expect(bijwerken).not.toHaveBeenCalled();expect(gegevensLaden).not.toHaveBeenCalled();}
 finally{window.removeEventListener("agenda-vakanties",open);sessionStorage.removeItem("assistent.agendapaneel");}
});
it("voegt privévakantieplannen niet automatisch toe aan de AI-context",()=>{
 const tekst=context({taken:[],afspraken:[],volgend_id:1,vakanties:[{titel:"Geheime bestemming",plaats:"Privéhuis",budget:99999}]});
 expect(tekst).not.toContain("Geheime bestemming");expect(tekst).not.toContain("Privéhuis");expect(tekst).not.toContain("99999");
});
