import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useState } from "react";
import type { Staat } from "../App";
import type { Gegevens } from "../api";
import { bijwerken } from "../api";
import { leesPlekken } from "../lib/kaartkompas";
import KaartKompas from "./KaartKompas";
vi.mock("../api", async o => ({...await o<object>(),bijwerken:vi.fn()}));
const gekozen={lat:52.09,lon:5.12,naam:"Privéarts",soort:"Bestemming",app:false,prive:true};
function Scherm(){const [staat,setStaat]=useState<Staat>({gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}});return <KaartKompas staat={staat} setData={g=>setStaat(s=>({...s,data:g}))} gekozen={gekozen} vanaf={{lat:52.1,lon:5.13}} kies={vi.fn()} reiswijze="auto"/>;}
beforeEach(()=>vi.clearAllMocks());afterEach(()=>{cleanup();vi.unstubAllGlobals();});
it("schat reistijd automatisch en vraagt alleen een bezoekkeuze",()=>{
 render(<Scherm/>);expect(screen.queryByRole("spinbutton")).toBeNull();expect(screen.getByText(/Heenreis: ongeveer/)).toBeTruthy();expect(screen.getByRole("button",{name:"30 min bezoek"})).toBeTruthy();expect(screen.getByText("Nog niet te bepalen")).toBeTruthy();
});
it("maakt na een verloren opslagantwoord geen tweede privéplek",async()=>{
 const g:Gegevens={taken:[],afspraken:[],volgend_id:1};
 vi.mocked(bijwerken).mockImplementationOnce(async f=>{f(g);throw new Error("Verbinding weg");}).mockImplementationOnce(async f=>{f(g);return structuredClone(g);});
 render(<Scherm/>);fireEvent.click(screen.getByRole("button",{name:"Bewaar privéplek"}));fireEvent.click(screen.getByRole("button",{name:"Plek bewaren"}));await screen.findByRole("alert");
 expect(screen.queryByText("Privéplek bewaard.")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Dezelfde plek opnieuw proberen"}));await screen.findByText("Privéplek bewaard.");expect(leesPlekken(g)).toHaveLength(1);
});
it("toont een overdrachtvoorbeeld met privélabels verborgen en verstuurt niets",async()=>{
 const writeText=vi.fn().mockResolvedValue(undefined);vi.stubGlobal("navigator",{clipboard:{writeText}});render(<Scherm/>);
 fireEvent.click(screen.getByRole("button",{name:"Deze plek als stop"}));fireEvent.click(screen.getByRole("button",{name:"Routebriefje voor chat of project"}));const brief=screen.getByRole("textbox",{name:"Voorbeeld routebriefje"}) as HTMLTextAreaElement;
 expect(brief.value).not.toContain("Privéarts");expect(bijwerken).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Kopieer dit routebriefje"}));await waitFor(()=>expect(writeText).toHaveBeenCalledWith(brief.value));
});
