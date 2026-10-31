import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,expect,it,vi} from "vitest";
import Chat from "./Chat";
import BewaarScherm from "./BewaarScherm";
import {berichten,chatBronLezen} from "../lib/chat";
import {openVragen} from "../lib/bestellingen";
import {chatOpenen,winkelAppOpenen} from "../lib/naar";
vi.mock("../lib/chat",async o=>({...await o<object>(),starten:async()=>1,overzicht:async()=>({gesprekken:[],communities:[]}),berichten:vi.fn(),chatBronLezen:vi.fn()}));
vi.mock("../lib/gasten",async o=>({...await o<object>(),gesprekken:async()=>({gesprekken:[]})}));
vi.mock("../lib/bellen",async o=>({...await o<object>(),luisteren:vi.fn()}));
vi.mock("./Bellen",()=>({useBellen:()=>({bel:null})}));
vi.mock("./ProjectWerkruimte",()=>({default:()=>null}));
vi.mock("./Bestellingen",()=>({default:()=> <p>Bestellingencontrole</p>}));
vi.mock("../api",async o=>({...await o<object>(),rpc:async()=>[]}));
vi.mock("../lib/bestellingen",async o=>({...await o<object>(),lijst:async()=>[]}));
vi.mock("../lib/winkelen",async o=>({...await o<object>(),zoeken:async()=>[]}));
afterEach(()=>{cleanup();vi.resetAllMocks();window.dispatchEvent(new Event("assistent-sessie"));});
it("pauzeert een verborgen gesprek, weigert een late leesbevestiging en hervat vanaf de oude positie",async()=>{
 const g={id:8,soort:"twee" as const,status:"lid" as const,naam:"Testgesprek",leden:[],ongelezen:1};
 const resultaat={gesprek:g,regels:[{id:5,afzender:2,tijd:"2026-10-31T12:00:00Z",weg:false,bericht:{t:"tekst" as const,tekst:"Bericht voor jou"}}],hoogste:5,meer:false};
 let klaar!:(r:typeof resultaat)=>void;vi.mocked(berichten).mockImplementationOnce(()=>new Promise(r=>{klaar=r;})).mockResolvedValue(resultaat);
 chatOpenen(8);const beeld=(aan:boolean)=><BewaarScherm actief={aan} naam="Chat"><Chat staat={{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}}} naarInstellingen={vi.fn()} bestel={vi.fn()}/></BewaarScherm>;
 const r=render(beeld(true));await waitFor(()=>expect(berichten).toHaveBeenCalledOnce());const magLezen=vi.mocked(berichten).mock.calls[0][2]!;expect(magLezen()).toBe(true);r.rerender(beeld(false));expect(magLezen()).toBe(false);
 await act(async()=>klaar(resultaat));expect(screen.queryByText("Bericht voor jou")).toBeNull();r.rerender(beeld(true));await screen.findByText("Bericht voor jou");expect(vi.mocked(berichten).mock.calls[1][1]).toBe(0);expect(vi.mocked(berichten).mock.calls[1][2]!()).toBe(true);
 fireEvent.change(screen.getByPlaceholderText("Bericht"),{target:{value:"Concept ook na teruggaan"}});fireEvent.click(screen.getByRole("button",{name:"Terug"}));act(()=>chatOpenen(8));expect((await screen.findByPlaceholderText("Bericht") as HTMLInputElement).value).toBe("Concept ook na teruggaan");
});

it("opent nieuwe winkelopdrachten ook nadat Chat en de winkel al bezocht zijn",async()=>{
 render(<Chat staat={{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}}} naarInstellingen={vi.fn()} bestel={vi.fn()}/>);
 await screen.findByRole("searchbox",{name:"Zoek een gesprek"});act(()=>winkelAppOpenen());await screen.findByRole("heading",{name:"Winkel"});act(()=>openVragen());await screen.findByText("Bestellingencontrole");act(()=>winkelAppOpenen());await screen.findByRole("heading",{name:"Winkel"});
});
it("geeft een vanuit een andere hoofdplek geopende winkel de juiste terugroute",async()=>{
 const verlaat=vi.fn();render(<Chat verlaat={verlaat} terugNaam="Werkruimte" staat={{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}}} naarInstellingen={vi.fn()} bestel={vi.fn()}/>);
 await screen.findByRole("searchbox",{name:"Zoek een gesprek"});act(()=>winkelAppOpenen());fireEvent.click(await screen.findByRole("button",{name:"Werkruimte"}));expect(verlaat).toHaveBeenCalledOnce();
});

it("opent ook een bronbericht dat buiten de eerste geladen berichten ligt",async()=>{
 const gesprek={id:8,naam:"Bron",status:"lid" as const,soort:"groep" as const,leden:[],ongelezen:0};
 vi.mocked(berichten).mockResolvedValue({gesprek,regels:[],hoogste:0,meer:false});vi.mocked(chatBronLezen).mockResolvedValue({gesprek,regel:{id:777,afzender:2,tijd:"2026-10-31T12:00:00Z",weg:false,bericht:{t:"tekst",tekst:"Specifieke bron verder terug"}},tekst:"Specifieke bron verder terug"});
 chatOpenen(8,777);render(<Chat staat={{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}}} naarInstellingen={vi.fn()} bestel={vi.fn()}/>);await screen.findByText("Specifieke bron verder terug");expect(chatBronLezen).toHaveBeenCalledWith(8,777,false);expect(screen.getByText("Bronbericht bij je taak")).toBeTruthy();
});
it("verbergt een eerder geladen bronbericht zodra de verse broncontrole faalt",async()=>{
 const gesprek={id:8,naam:"Bron",status:"lid" as const,soort:"groep" as const,leden:[],ongelezen:0};
 vi.mocked(berichten).mockResolvedValue({gesprek,regels:[{id:777,afzender:2,tijd:"2026-10-31T12:00:00Z",weg:false,bericht:{t:"tekst",tekst:"Oude broninhoud"}}],hoogste:777,meer:false});vi.mocked(chatBronLezen).mockRejectedValue(new Error("Het bronbericht is verwijderd."));
 chatOpenen(8);render(<Chat staat={{gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}}} naarInstellingen={vi.fn()} bestel={vi.fn()}/>);await screen.findByText("Oude broninhoud");act(()=>chatOpenen(8,777));await screen.findByText("Het bronbericht is verwijderd.");expect(screen.queryByText("Oude broninhoud")).toBeNull();
});
