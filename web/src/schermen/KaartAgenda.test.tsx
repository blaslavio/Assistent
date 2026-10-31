import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import Agenda from "./Agenda";
import { bijwerken,type Gegevens } from "../api";
import { agendaPlekOpenen } from "../lib/naar";
vi.mock("../api",async o=>({...await o<object>(),bijwerken:vi.fn()}));
vi.mock("./Prikken",()=>({stemrondes:async()=>[],teStemmen:()=>0,PrikkenPaneel:()=>null}));
afterEach(()=>{cleanup();vi.clearAllMocks();sessionStorage.clear();window.dispatchEvent(new Event("assistent-sessie"));});
it("laat de gebruiker de afspraak controleren en bewaart het kaartpunt na bevestiging",async()=>{
 HTMLElement.prototype.scrollTo=vi.fn();
 const g:Gegevens={taken:[],afspraken:[],volgend_id:1};vi.mocked(bijwerken).mockImplementation(async f=>{f(g);return g;});agendaPlekOpenen("Eigen plek",{lat:52,lon:5});
 render(<Agenda staat={{gebruiker:{id:1,naam:"test"},data:g}} setStaat={vi.fn()}/>);expect((screen.getByLabelText("Titel") as HTMLInputElement).value).toBe("Eigen plek");expect(bijwerken).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Opslaan"}));await waitFor(()=>expect(g.afspraken).toHaveLength(1));expect(g.afspraken[0].kaartpunt).toEqual({lat:52,lon:5});
});
it("verwijdert verouderde coördinaten wanneer de gebruiker de plaats wijzigt",async()=>{
 HTMLElement.prototype.scrollTo=vi.fn();
 const g:Gegevens={taken:[],afspraken:[],volgend_id:1};vi.mocked(bijwerken).mockImplementation(async f=>{f(g);return g;});agendaPlekOpenen("Eigen plek",{lat:52,lon:5});
 render(<Agenda staat={{gebruiker:{id:1,naam:"test"},data:g}} setStaat={vi.fn()}/>);
 fireEvent.change(screen.getByLabelText("Plaats"),{target:{value:"Een ander adres"}});fireEvent.click(screen.getByRole("button",{name:"Opslaan"}));await waitFor(()=>expect(g.afspraken).toHaveLength(1));expect(g.afspraken[0].locatie).toBe("Een ander adres");expect(g.afspraken[0].kaartpunt).toBeUndefined();
});
