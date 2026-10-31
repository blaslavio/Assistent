import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {useEffect,useState} from "react";
import App from "./App";
import {naar} from "./lib/naar";
const test=vi.hoisted(()=>({staat:{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}}}));
vi.mock("./api",async o=>({...await o<object>(),huidigeSessie:()=>({naam:"test",token:"fixture"}),opstarten:()=>({vorige:Promise.resolve(null),vers:Promise.resolve(test.staat)}),gegevensLaden:async()=>test.staat,overstappen:async()=>{},momentopnameBewaren:async()=>{}}));
vi.mock("./lib/sport",async o=>({...await o<object>(),vanzelf:async()=>false}));
vi.mock("./lib/chat",async o=>({...await o<object>(),startenAlsBekend:async()=>null}));
vi.mock("./schermen/Bellen",()=>({default:()=>null}));
vi.mock("./mascotte",async o=>({...await o<object>(),MascotteFeest:()=>null}));
vi.mock("./schermen/Vandaag",()=>({default:()=>{const[v,setV]=useState("");return <input aria-label="Vandaag invoer" value={v} onChange={e=>setV(e.target.value)}/>;}}));
vi.mock("./schermen/Agenda",()=>({default:()=>{const[v,setV]=useState("");return <input aria-label="Agenda invoer" value={v} onChange={e=>setV(e.target.value)}/>;}}));
vi.mock("./schermen/Chat",()=>({default:({werkGesprek,ongelezenGewijzigd}:{werkGesprek?:{id:number};ongelezenGewijzigd:(n:number)=>void})=>{const[v,setV]=useState("");useEffect(()=>ongelezenGewijzigd(3),[ongelezenGewijzigd]);return <div><h1>Gesprekken met mensen {werkGesprek?.id}</h1><input aria-label="Chatconcept" value={v} onChange={e=>setV(e.target.value)}/></div>;}}));
vi.mock("./schermen/Onderdelen",()=>({Onderdeel:({naam}:{naam:string})=><h1>Persoonlijke app {naam}</h1>}));
vi.mock("./schermen/Projecten",()=>({default:({open}:{open:(id:number)=>void})=><button onClick={()=>open(42)}>Open samenwerkingsproject</button>}));
vi.mock("./schermen/Assistent",()=>({default:({sluit}:{sluit:()=>void})=><div><h1>AI-hulp</h1><button onClick={sluit}>Terug naar mijn scherm</button></div>}));
vi.mock("./schermen/Instellingen",()=>({default:({terug,opUitgelogd}:{terug:()=>void;opUitgelogd:()=>void})=><div><h1>Mijn instellingen</h1><button onClick={terug}>Terug naar vorige plek</button><button onClick={opUitgelogd}>Uitloggen test</button></div>}));
vi.mock("./schermen/Inloggen",()=>({default:({opIngelogd}:{opIngelogd:()=>void})=><button onClick={opIngelogd}>Nieuw account openen</button>}));
afterEach(()=>{cleanup();window.dispatchEvent(new Event("assistent-sessie"));});
beforeEach(()=>{test.staat={gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}};});
const hoofd=(naam:string)=>fireEvent.click(within(screen.getByRole("navigation",{name:"Hoofdmenu"})).getByRole("button",{name:new RegExp(`^${naam}`)}));
it("combineert vandaag en agenda, houdt chat apart van AI en bewaart invoer bij wisselen en teruggaan",async()=>{
 render(<App/>);await screen.findByRole("textbox",{name:"Vandaag invoer"});expect(within(screen.getByRole("navigation",{name:"Hoofdmenu"})).getAllByRole("button")).toHaveLength(3);
 fireEvent.change(screen.getByLabelText("Vandaag invoer"),{target:{value:"Dagconcept"}});fireEvent.click(screen.getByRole("button",{name:"Agenda"}));fireEvent.change(await screen.findByRole("textbox",{name:"Agenda invoer"}),{target:{value:"Afspraakconcept"}});
 hoofd("Chat");fireEvent.change(await screen.findByRole("textbox",{name:"Chatconcept"}),{target:{value:"Nog niet versturen"}});hoofd("Mijn dag");expect((screen.getByRole("textbox",{name:"Agenda invoer"})as HTMLInputElement).value).toBe("Afspraakconcept");expect(within(screen.getByRole("navigation",{name:"Hoofdmenu"})).getByRole("button",{name:"Mijn dag"}).getAttribute("aria-current")).toBe("page");
 fireEvent.click(screen.getByRole("button",{name:"Vandaag"}));expect((screen.getByRole("textbox",{name:"Vandaag invoer"})as HTMLInputElement).value).toBe("Dagconcept");hoofd("Chat");expect((screen.getByRole("textbox",{name:"Chatconcept"})as HTMLInputElement).value).toBe("Nog niet versturen");
 fireEvent.click(screen.getByRole("button",{name:"Open de AI-assistent"}));await screen.findByRole("heading",{name:"AI-hulp"});fireEvent.click(screen.getByRole("button",{name:"Terug naar mijn scherm"}));expect(screen.getByRole("heading",{name:/Gesprekken met mensen/})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Profiel en instellingen"}));await screen.findByRole("heading",{name:"Mijn instellingen"});fireEvent.click(screen.getByRole("button",{name:"Terug naar vorige plek"}));expect((screen.getByRole("textbox",{name:"Chatconcept"})as HTMLInputElement).value).toBe("Nog niet versturen");
});
it("houdt bestaande appverwijzingen en projectgesprekken bereikbaar vanuit de nieuwe hoofdplekken",async()=>{
 render(<App/>);await screen.findByRole("textbox",{name:"Vandaag invoer"});act(()=>naar({tab:"instellingen",onderdeel:"budget"}));await screen.findByRole("heading",{name:"Persoonlijke app budget"});expect(within(screen.getByRole("navigation",{name:"Hoofdmenu"})).getByRole("button",{name:"Werkruimte"}).getAttribute("aria-current")).toBe("page");
 act(()=>naar({tab:"agenda"}));await screen.findByRole("textbox",{name:"Agenda invoer"});
});
it("wist schermconcepten en oude ongelezentellingen wanneer een ander account inlogt",async()=>{
 render(<App/>);await screen.findByRole("textbox",{name:"Vandaag invoer"});hoofd("Chat");fireEvent.change(await screen.findByRole("textbox",{name:"Chatconcept"}),{target:{value:"Alleen van account één"}});fireEvent.click(screen.getByRole("button",{name:"Profiel en instellingen"}));fireEvent.click(await screen.findByRole("button",{name:"Uitloggen test"}));test.staat={...test.staat,gebruiker:{id:2,naam:"ander"}};fireEvent.click(screen.getByRole("button",{name:"Nieuw account openen"}));await screen.findByRole("heading",{name:"Mijn instellingen"});expect(within(screen.getByRole("navigation",{name:"Hoofdmenu"})).getByRole("button",{name:"Chat"})).toBeTruthy();hoofd("Chat");expect((await screen.findByRole("textbox",{name:"Chatconcept"})as HTMLInputElement).value).toBe("");
});
