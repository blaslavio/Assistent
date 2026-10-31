import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import BerichtTaak from "./BerichtTaak";
import {bijwerken,type Gegevens} from "../api";
import {chatBronLezen,type Regel} from "../lib/chat";
const account=vi.hoisted(()=>({sessie:{naam:"test",token:"fixture"}}));
vi.mock("../api",async o=>({...await o<object>(),bijwerken:vi.fn(),huidigeSessie:()=>account.sessie}));
vi.mock("../lib/chat",async o=>({...await o<object>(),chatBronLezen:vi.fn()}));
const regel:Regel={id:5,afzender:2,tijd:"2026-10-31T12:00:00Z",weg:false,bericht:{t:"tekst",tekst:"Kun jij vrijdag de offerte nakijken?"}};
const vers=()=>({tekst:"Kun jij vrijdag de offerte nakijken?",regel,gesprek:{id:8,status:"lid" as const,soort:"twee" as const,leden:[],ongelezen:0}});
let g:Gegevens;const setData=vi.fn(),sluit=vi.fn();
beforeEach(()=>{g={taken:[],afspraken:[],volgend_id:1};account.sessie={naam:"test",token:"fixture"};vi.mocked(chatBronLezen).mockResolvedValue(vers());vi.mocked(bijwerken).mockImplementation(async f=>{f(g);return structuredClone(g);});});
afterEach(()=>{cleanup();vi.resetAllMocks();});
function open(){render(<BerichtTaak gesprek={8} regel={regel} staat={{gebruiker:{id:1,naam:"test"},data:g}} setData={setData} sluit={sluit}/>);}
function controleer(){fireEvent.change(screen.getByLabelText("Taaktitel"),{target:{value:"Offerte nakijken"}});fireEvent.change(screen.getByLabelText("Datum (optioneel)"),{target:{value:"2026-11-06"}});fireEvent.click(screen.getByRole("button",{name:"Taak controleren"}));}
it("laat eerst aanpassen en controleren, en schrijft pas na bevestiging met verse broncontrole",async()=>{open();controleer();expect(bijwerken).not.toHaveBeenCalled();expect(chatBronLezen).not.toHaveBeenCalled();fireEvent.click(screen.getByRole("button",{name:"Terug naar aanpassen"}));expect((screen.getByLabelText("Taaktitel")as HTMLInputElement).value).toBe("Offerte nakijken");fireEvent.click(screen.getByRole("button",{name:"Taak controleren"}));fireEvent.click(screen.getByRole("button",{name:"Bevestig persoonlijke taak"}));await screen.findByText("Taak opgeslagen");expect(g.taken[0]).toMatchObject({titel:"Offerte nakijken",deadline:"2026-11-06",chatbron:{gesprek:8,bericht:5}});expect(g.taken[0].notitie).toBeUndefined();expect(chatBronLezen).toHaveBeenCalledWith(8,5);});
it("annuleert zonder iets te schrijven",()=>{open();fireEvent.click(screen.getByRole("button",{name:"Annuleren"}));expect(sluit).toHaveBeenCalledOnce();expect(bijwerken).not.toHaveBeenCalled();});
it("weigert een gewijzigde of inmiddels ontoegankelijke bron",async()=>{vi.mocked(chatBronLezen).mockResolvedValue({...vers(),tekst:"Andere inhoud"});open();controleer();fireEvent.click(screen.getByRole("button",{name:"Bevestig persoonlijke taak"}));await screen.findByRole("alert");expect(bijwerken).not.toHaveBeenCalled();});
it("maakt na verloren opslagantwoord ook bij opnieuw bevestigen slechts één taak",async()=>{vi.mocked(bijwerken).mockImplementationOnce(async f=>{f(g);throw new Error("Opslag niet bevestigd");});open();controleer();fireEvent.click(screen.getByRole("button",{name:"Bevestig persoonlijke taak"}));await screen.findByRole("alert");fireEvent.click(screen.getByRole("button",{name:"Bevestig persoonlijke taak"}));await screen.findByText("Taak opgeslagen");expect(g.taken).toHaveLength(1);});
it("schrijft niet na een accountwissel tijdens het ophalen van de bron",async()=>{vi.mocked(chatBronLezen).mockImplementation(async()=>{account.sessie={naam:"ander",token:"nieuw"};return vers();});open();controleer();fireEvent.click(screen.getByRole("button",{name:"Bevestig persoonlijke taak"}));await waitFor(()=>expect(chatBronLezen).toHaveBeenCalled());await screen.findByRole("alert");expect(bijwerken).not.toHaveBeenCalled();expect(setData).not.toHaveBeenCalled();});
