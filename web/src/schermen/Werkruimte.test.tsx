import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Werkruimte from "./Werkruimte";
import {overzicht} from "../lib/chat";
import {winkelAppGevraagd,kaartGevraagd} from "../lib/naar";
const account=vi.hoisted(()=>({sessie:{naam:"test",token:"fixture"}}));
vi.mock("../api",async o=>({...await o<object>(),huidigeSessie:()=>account.sessie}));
vi.mock("../lib/chat",async o=>({...await o<object>(),overzicht:vi.fn()}));
vi.mock("./Onderdelen",()=>({Onderdeel:({naam,terug}:{naam:string;terug:()=>void})=><div><h1>App {naam}</h1><button onClick={terug}>Werkruimte terug</button></div>}));
vi.mock("./Projecten",()=>({default:({open}:{open:(id:number)=>void})=><button onClick={()=>open(42)}>Testproject openen</button>}));
afterEach(()=>{cleanup();vi.clearAllMocks();window.dispatchEvent(new Event("assistent-sessie"));});
const props={staat:{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}},vernieuw:vi.fn(),vraag:vi.fn(),openProject:vi.fn(),naarChat:vi.fn()};
it("toont eerst zes apps als rustige lijst en de rest achter één knop",async()=>{
 render(<Werkruimte {...props}/>);const prive=()=>within(screen.getByRole("region",{name:"Privé"})).getAllByRole("button");expect(prive()[0].getAttribute("aria-label")).toMatch(/^Documenten/);expect(prive()).toHaveLength(7);expect(screen.queryByRole("searchbox")).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:/Alle apps tonen/}));expect(prive().length).toBeGreaterThan(10);
 fireEvent.click(screen.getByRole("button",{name:/Samenwerken/}));fireEvent.click(await screen.findByRole("button",{name:"Testproject openen"}));expect(props.openProject).toHaveBeenCalledWith(42);
});
it("opent een app en houdt de uitgeklapte lijst na teruggaan",async()=>{
 render(<Werkruimte {...props}/>);fireEvent.click(screen.getByRole("button",{name:/Alle apps tonen/}));fireEvent.click(screen.getByRole("button",{name:/^Beleggen/}));expect(await screen.findByRole("heading",{name:"App beleggen"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Werkruimte terug"}));expect(screen.getByRole("button",{name:"Minder tonen"}).getAttribute("aria-expanded")).toBe("true");
});
it("houdt kaart en winkel bereikbaar zonder een bestelling of bericht te maken",()=>{
 render(<Werkruimte {...props}/>);fireEvent.click(within(screen.getByRole("region",{name:"Zakelijk"})).getByRole("button",{name:/^Winkel/}));expect(winkelAppGevraagd()).toBe(true);fireEvent.click(screen.getByRole("button",{name:/Alle apps tonen/}));fireEvent.click(screen.getByRole("button",{name:/^Kaart/}));expect(kaartGevraagd()).toBe(true);
});
it("toont recente apps en alleen projecten waarvoor de gebruiker nog lid is",async()=>{
 vi.mocked(overzicht).mockResolvedValue({gesprekken:[{id:8,naam:"Mijn project",soort:"groep",status:"lid",leden:[],ongelezen:0},{id:9,naam:"Geen toegang meer",soort:"groep",status:"verzoek",leden:[],ongelezen:0}],communities:[]});
 const gebruik=vi.fn();render(<Werkruimte {...props} gebruik={gebruik} staat={{...props.staat,data:{...props.staat.data,werkruimte_recent:[{soort:"app",app:"notities"},{soort:"project",gesprek:8},{soort:"project",gesprek:9}]}}}/>);
 const recent=screen.getByRole("region",{name:"Recent gebruikt"});fireEvent.click(await within(recent).findByRole("button",{name:/Mijn project/}));expect(props.openProject).toHaveBeenCalledWith(8);expect(screen.queryByText("Geen toegang meer")).toBeNull();fireEvent.click(within(recent).getByRole("button",{name:/Notities/}));expect(gebruik).toHaveBeenCalledWith({soort:"app",app:"notities"});
});
it("toont geen laat projectantwoord uit een vorige sessie",async()=>{
 let klaar!:(r:Awaited<ReturnType<typeof overzicht>>)=>void;vi.mocked(overzicht).mockImplementation(()=>new Promise(r=>{klaar=r;}));render(<Werkruimte {...props} staat={{...props.staat,data:{...props.staat.data,werkruimte_recent:[{soort:"project",gesprek:8}]}}}/>);
 act(()=>{account.sessie={naam:"ander",token:"nieuw"};window.dispatchEvent(new Event("assistent-sessie"));});await act(async()=>klaar({gesprekken:[{id:8,naam:"Oud privéproject",soort:"groep",status:"lid",leden:[],ongelezen:0}],communities:[]}));expect(screen.queryByText("Oud privéproject")).toBeNull();
});
