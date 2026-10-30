import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ProjectBord from "./ProjectBord";
import ProjectWerkdruk from "./ProjectWerkdruk";
import ProjectSjablonen from "./ProjectSjablonen";
import { nieuwFeit, type Feit } from "../lib/projectregie";
import { bijwerken } from "../api";
import type { Staat } from "../App";
const sessie=vi.hoisted(()=>({naam:"Alice",token:"test"}));vi.mock("../api",async origineel=>({...await origineel<object>(),huidigeSessie:()=>sessie,bijwerken:vi.fn()}));
const f=(actie:Feit["actie"],bericht:number):Feit=>({actie,bericht,afzender:1,tijd:"2026-10-29T08:00:00Z"});
function basis(){const doel=f(nieuwFeit("actie","Pagina maken"),1),a={id:crypto.randomUUID(),titel:"Ontwerpen",klaarAls:"Voorbeeld akkoord",minuten:30,eigenaar:1,alternatief:"Samen bespreken",afhankelijkVan:[]},b={...a,id:crypto.randomUUID(),titel:"Bouwen",minuten:60,eigenaar:2,afhankelijkVan:[a.id]};const plan=f(nieuwFeit("aanpak","Route",{soort:"eigen"},{doel:doel.actie.sleutel,stappen:[a,b]}),2);return{doel,plan,a,b,feiten:[doel,plan]};}
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("toont bevestigde kolommen en bereidt alleen een toegestane statuswijziging voor",()=>{
 const {doel,feiten}=basis(),voorstel=vi.fn();render(<ProjectBord feiten={feiten} ik={1} namen={new Map([[1,"Alice"],[2,"Bob"]])} doelVoorstel={doel.actie.sleutel} schrijven voorstel={voorstel}/>);
 const doen=screen.getByRole("region",{name:"Te doen"});expect(within(doen).getByText("Ontwerpen")).toBeTruthy();const knoppen=screen.getAllByRole("button",{name:"Naar bezig voorbereiden"});expect((knoppen[1] as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(knoppen[0]);expect(voorstel).toHaveBeenCalledWith(expect.objectContaining({soort:"stapstatus",keuze:"bezig"}));expect(screen.getByRole("region",{name:"Bezig"}).textContent).toContain("Bezig (0)");
 fireEvent.click(screen.getByLabelText("Alleen mijn stappen"));expect(screen.queryByText("Bouwen")).toBeNull();
});
it("biedt een onbevoegde deelnemer geen statusknoppen",()=>{
 const {doel,feiten}=basis();render(<ProjectBord feiten={feiten} ik={99} namen={new Map()} doelVoorstel={doel.actie.sleutel} schrijven voorstel={vi.fn()}/>);expect(screen.queryByRole("button",{name:"Resultaat bevestigen"})).toBeNull();
});
it("laat de werkdrukberekening als aanname zien zonder gegevens op te slaan",()=>{
 const {feiten}=basis();render(<ProjectWerkdruk feiten={feiten} namen={new Map([[1,"Alice"],[2,"Bob"]])}/>);expect(screen.getByText(/geen meting van prestaties/)).toBeTruthy();fireEvent.change(screen.getByLabelText("Vergelijk met minuten per werkdag"),{target:{value:"30"}});expect(screen.getByRole("table").textContent).toContain("Bob");expect(bijwerken).not.toHaveBeenCalled();
});
it("laadt een startsjabloon alleen na preview en zonder oude eigenaren",()=>{
 const {a}=basis(),toepassen=vi.fn();render(<ProjectSjablonen stappen={[a]} toepassen={toepassen} schrijven/>);fireEvent.click(screen.getByText("Herbruikbare aanpakken"));fireEvent.click(screen.getByText("Bekijk Overleg naar uitvoering"));expect(toepassen).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Gebruik als bewerkbaar concept"));expect(toepassen).toHaveBeenCalledTimes(1);expect(toepassen.mock.calls[0][0]).toHaveLength(3);expect(toepassen.mock.calls[0][0][0].eigenaar).toBeUndefined();expect(bijwerken).not.toHaveBeenCalled();
});
it("bewaart een eigen sjabloon pas na bevestiging in het eigen account",async()=>{
 const {a}=basis(),data={taken:[],afspraken:[],volgend_id:1},setData=vi.fn();vi.mocked(bijwerken).mockImplementation(async fn=>{fn(data);return data;});
 render(<ProjectSjablonen stappen={[a]} staat={{gebruiker:{id:1,naam:"Alice"},data} as Staat} setData={setData} toepassen={vi.fn()} schrijven/>);fireEvent.click(screen.getByText("Herbruikbare aanpakken"));fireEvent.change(screen.getByLabelText("Naam eigen sjabloon"),{target:{value:"Mijn route"}});fireEvent.click(screen.getByText("Huidige stappen als eigen sjabloon controleren"));expect(bijwerken).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Bevestig privé bewaren"));await waitFor(()=>expect(setData).toHaveBeenCalled());expect(data).toHaveProperty("projectSjablonen");
});
