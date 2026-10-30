import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectAls from "./ProjectAls";
import { bijwerken } from "../api";
import { nieuwFeit } from "../lib/projectregie";
import { eigenDienstBewijzen } from "../lib/projectdiensten";
import { projectRegelsVers } from "../lib/chat";
import type { Staat } from "../App";
vi.mock("../lib/projectdiensten",()=>({eigenDienstBewijzen:vi.fn()}));
vi.mock("../lib/chat",()=>({projectRegelsVers:vi.fn()}));
const sessie=vi.hoisted(()=>({naam:"Alice",token:"test"}));
vi.mock("../api",async origineel=>({...await origineel<object>(),huidigeSessie:()=>sessie,bijwerken:vi.fn()}));
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("bewaart regels pas na bevestigen in eigen accountgegevens en deelt geen financiële status",async()=>{
 const actie=nieuwFeit("actie","Na betaling ontwerpen"),feiten=[{actie,bericht:1,afzender:1,tijd:"2026-10-29T08:00:00Z"}];const data={taken:[],afspraken:[],volgend_id:1};const setData=vi.fn();
 vi.mocked(bijwerken).mockImplementation(async fn=>{fn(data);return data;});
 render(<ProjectAls gesprek={8} feiten={feiten} staat={{gebruiker:{id:1,naam:"Alice"},data} as Staat} setData={setData} planning={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText("Waarom"),{target:{value:actie.sleutel}});fireEvent.change(screen.getByLabelText("Eigen registratie-ID"),{target:{value:"42"}});fireEvent.click(screen.getByText("Persoonlijke regel controleren"));
 expect(bijwerken).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Bevestig persoonlijke regel"));await waitFor(()=>expect(setData).toHaveBeenCalled());expect(data).toHaveProperty("projectRegels");expect(eigenDienstBewijzen).not.toHaveBeenCalled();
});
it("laat een onbereikbare betaaldienst onbekend en blokkeert het vervolg",async()=>{
 const actie=nieuwFeit("actie","Na betaling ontwerpen"),feiten=[{actie,bericht:1,afzender:1,tijd:"2026-10-29T08:00:00Z"}];
 const data={taken:[],afspraken:[],volgend_id:1,projectRegels:[{id:crypto.randomUUID(),gesprek:8,waarom:actie.sleutel,modus:"alle",voorwaarden:[{soort:"betaling_bevestigd",bron:"42"}],vervolg:"planning"}]};
 vi.mocked(eigenDienstBewijzen).mockResolvedValue({bewijzen:[],fouten:["Betaalstatus niet bereikbaar."]});vi.mocked(projectRegelsVers).mockResolvedValue({regels:[{id:1,afzender:1,tijd:feiten[0].tijd,weg:false,bericht:actie}],gesprek:{id:8,soort:"groep",leden:[],status:"lid",ongelezen:0}});
 const planning=vi.fn();render(<ProjectAls gesprek={8} feiten={feiten} staat={{gebruiker:{id:1,naam:"Alice"},data} as Staat} planning={planning}/>);
 fireEvent.click(screen.getByText("Controleer voorwaarden met eigen actuele diensten"));await screen.findByText("Betaalstatus niet bereikbaar.");expect((screen.getByText("Vervolg voorbereiden") as HTMLButtonElement).disabled).toBe(true);expect(planning).not.toHaveBeenCalled();
});
it("vraagt bevestiging vóór persoonlijke regels worden verwijderd",async()=>{
 const actie=nieuwFeit("actie","Ontwerp"),feiten=[{actie,bericht:1,afzender:1,tijd:"2026-10-29T08:00:00Z"}];
 const data={taken:[],afspraken:[],volgend_id:1,projectRegels:[{id:crypto.randomUUID(),gesprek:8,waarom:actie.sleutel,modus:"alle",voorwaarden:[{soort:"betaling_bevestigd",bron:"42"}],vervolg:"planning"}]};
 vi.mocked(bijwerken).mockImplementation(async fn=>{fn(data);return data;});const setData=vi.fn();
 render(<ProjectAls gesprek={8} feiten={feiten} staat={{gebruiker:{id:1,naam:"Alice"},data} as Staat} setData={setData} planning={vi.fn()}/>);
 fireEvent.click(screen.getByText("Regel verwijderen"));expect(bijwerken).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Behouden"));expect(data.projectRegels).toHaveLength(1);
 fireEvent.click(screen.getByText("Regel verwijderen"));fireEvent.click(screen.getByText("Bevestig regel verwijderen"));await waitFor(()=>expect(setData).toHaveBeenCalled());expect(data.projectRegels).toHaveLength(0);expect(eigenDienstBewijzen).not.toHaveBeenCalled();
});
