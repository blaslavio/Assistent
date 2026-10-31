import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Werkruimte from "./Werkruimte";
import {winkelAppGevraagd,kaartGevraagd} from "../lib/naar";
vi.mock("./Onderdelen",()=>({Onderdeel:({naam,terug}:{naam:string;terug:()=>void})=><div><h1>App {naam}</h1><button onClick={terug}>Werkruimte terug</button></div>}));
vi.mock("./Projecten",()=>({default:({open}:{open:(id:number)=>void})=><button onClick={()=>open(42)}>Testproject openen</button>}));
afterEach(()=>{cleanup();window.dispatchEvent(new Event("assistent-sessie"));});
const props={staat:{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}},vernieuw:vi.fn(),vraag:vi.fn(),openProject:vi.fn(),naarChat:vi.fn()};
it("zet persoonlijke apps voorop en laat projecten via hun bestaande gesprek openen",async()=>{
 render(<Werkruimte {...props}/>);expect(screen.getByText("Zakelijke opties").closest("details")?.open).toBe(false);expect(screen.getByText("Meer persoonlijke apps").closest("details")?.open).toBe(false);
 fireEvent.click(screen.getByRole("button",{name:/Projecten en samenwerken/}));fireEvent.click(await screen.findByRole("button",{name:"Testproject openen"}));expect(props.openProject).toHaveBeenCalledWith(42);
});
it("vindt ingeklapte apps en bewaart de zoekopdracht na teruggaan",async()=>{
 render(<Werkruimte {...props}/>);fireEvent.change(screen.getByRole("searchbox"),{target:{value:"budget"}});fireEvent.click(screen.getByRole("button",{name:/Budget/}));expect(await screen.findByRole("heading",{name:"App budget"})).toBeTruthy();fireEvent.click(screen.getByRole("button",{name:"Werkruimte terug"}));expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("budget");
});
it("houdt kaart en winkel bereikbaar zonder een bestelling of bericht te maken",()=>{
 render(<Werkruimte {...props}/>);fireEvent.click(screen.getByRole("button",{name:"Winkel en aanbod"}));expect(winkelAppGevraagd()).toBe(true);fireEvent.click(screen.getByRole("button",{name:"Kaart en routes"}));expect(kaartGevraagd()).toBe(true);
});
