import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Werkruimte from "./Werkruimte";
import {overzicht} from "../lib/chat";
import {kaartGevraagd} from "../lib/naar";
const account=vi.hoisted(()=>({sessie:{naam:"test",token:"fixture"}}));
vi.mock("../api",async o=>({...await o<object>(),huidigeSessie:()=>account.sessie}));
vi.mock("../lib/chat",async o=>({...await o<object>(),overzicht:vi.fn()}));
vi.mock("./Onderdelen",()=>({Onderdeel:({naam,terug}:{naam:string;terug:()=>void})=><div><h1>App {naam}</h1><button onClick={terug}>Werkruimte terug</button></div>}));
vi.mock("./Projecten",()=>({default:({open}:{open:(id:number)=>void})=><button onClick={()=>open(42)}>Testproject openen</button>}));
afterEach(()=>{cleanup();vi.clearAllMocks();window.dispatchEvent(new Event("assistent-sessie"));});
const props={staat:{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}},vernieuw:vi.fn(),vraag:vi.fn(),openProject:vi.fn(),naarChat:vi.fn()};
it("zet persoonlijke apps voorop en laat projecten via hun bestaande gesprek openen",async()=>{
 render(<Werkruimte {...props}/>);expect(screen.getByText("Zakelijke opties").closest("details")?.open).toBe(false);expect(screen.getByText("Meer persoonlijke apps").closest("details")?.open).toBe(false);
 fireEvent.click(screen.getByRole("button",{name:/Projecten en samenwerken/}));fireEvent.click(await screen.findByRole("button",{name:"Testproject openen"}));expect(props.openProject).toHaveBeenCalledWith(42);
});
it("vindt ingeklapte apps en bewaart de zoekopdracht na teruggaan",async()=>{
 render(<Werkruimte {...props}/>);fireEvent.change(screen.getByRole("searchbox"),{target:{value:"budget"}});fireEvent.click(screen.getByRole("button",{name:/Budget/}));expect(await screen.findByRole("heading",{name:"App budget"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Werkruimte terug"}));expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("budget");
});
it("houdt kaart en winkel bereikbaar zonder een bestelling of bericht te maken",()=>{
 render(<Werkruimte {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Winkel en aanbod"}));expect(screen.getByRole("heading",{name:"App studio"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Werkruimte terug"}));fireEvent.click(screen.getByRole("button",{name:"Kaart en routes"}));expect(kaartGevraagd()).toBe(true);
});

it("toont recente apps en alleen projecten waarvoor de gebruiker nog lid is",async()=>{
 vi.mocked(overzicht).mockResolvedValue({gesprekken:[{id:8,naam:"Mijn project",soort:"groep",status:"lid",leden:[],ongelezen:0},{id:9,naam:"Geen toegang meer",soort:"groep",status:"verzoek",leden:[],ongelezen:0}],communities:[]});
 const gebruik=vi.fn();render(<Werkruimte {...props} gebruik={gebruik} staat={{...props.staat,data:{...props.staat.data,werkruimte_recent:[{soort:"app",app:"notities"},{soort:"project",gesprek:8},{soort:"project",gesprek:9}]}}}/>);
 const recent=screen.getByRole("region",{name:"Verdergaan"});fireEvent.click(await within(recent).findByRole("button",{name:/Mijn project/}));expect(props.openProject).toHaveBeenCalledWith(8);expect(screen.queryByText("Geen toegang meer")).toBeNull();fireEvent.click(within(recent).getByRole("button",{name:/Notities/}));expect(gebruik).toHaveBeenCalledWith({soort:"app",app:"notities"});
});
it("toont geen laat projectantwoord uit een vorige sessie",async()=>{
 let klaar!:(r:Awaited<ReturnType<typeof overzicht>>)=>void;vi.mocked(overzicht).mockImplementation(()=>new Promise(r=>{klaar=r;}));render(<Werkruimte {...props} staat={{...props.staat,data:{...props.staat.data,werkruimte_recent:[{soort:"project",gesprek:8}]}}}/>);
 act(()=>{account.sessie={naam:"ander",token:"nieuw"};window.dispatchEvent(new Event("assistent-sessie"));});await act(async()=>klaar({gesprekken:[{id:8,naam:"Oud privéproject",soort:"groep",status:"lid",leden:[],ongelezen:0}],communities:[]}));expect(screen.queryByText("Oud privéproject")).toBeNull();
});
