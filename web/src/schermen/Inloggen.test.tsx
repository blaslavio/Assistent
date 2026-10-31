import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import Inloggen from "./Inloggen";
const m=vi.hoisted(()=>({beschikbaar:vi.fn(),begin:vi.fn(),inlog:vi.fn()}));
vi.mock("../lib/externAanmelden",()=>({AANBIEDERS:[{id:"google",naam:"Google"},{id:"apple",naam:"Apple"},{id:"azure",naam:"Microsoft"}],beschikbareAanbieders:m.beschikbaar,externBeginnen:m.begin,externAfronden:vi.fn(),isExterneTerugkomst:()=>false}));
vi.mock("../api",async o=>({...await o<object>(),inloggen:m.inlog}));
vi.mock("../lib/aanmelden",async o=>({...await o<object>(),mailIngesteld:async()=>false}));
vi.mock("../mascotte",()=>({MascotteMetTip:()=>null}));
beforeEach(()=>{vi.clearAllMocks();m.beschikbaar.mockResolvedValue({google:true,apple:false,azure:false});});
afterEach(cleanup);
it("toont Google en Apple op het beginscherm en vraagt toestemming voor doorsturen",async()=>{
 render(<Inloggen opIngelogd={vi.fn()}/>);const google=await screen.findByRole("button",{name:"Doorgaan met Google"});await waitFor(()=>expect((google as HTMLButtonElement).disabled).toBe(false));
 expect((screen.getByRole("button",{name:/Doorgaan met Apple/}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(google);expect(m.begin).not.toHaveBeenCalled();expect((screen.getByRole("button",{name:"Doorgaan naar Google"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Doorgaan naar Google"}));await waitFor(()=>expect(m.begin).toHaveBeenCalledWith("google",true));
});
it("houdt wachtwoordaanmelding beschikbaar als de providers niet beschikbaar zijn",async()=>{
 m.beschikbaar.mockResolvedValue({google:false,apple:false,azure:false});m.inlog.mockResolvedValue({token:"test-session"});const klaar=vi.fn();render(<Inloggen opIngelogd={klaar}/>);
 await screen.findByText(/Nog niet actief: Google, Apple/);
 fireEvent.change(screen.getByLabelText("Gebruikersnaam of mailadres"),{target:{value:"alice"}});fireEvent.click(screen.getByRole("button",{name:"Doorgaan"}));fireEvent.change(screen.getByLabelText("Wachtwoord"),{target:{value:"test-only"}});fireEvent.click(screen.getByRole("button",{name:"Inloggen"}));await waitFor(()=>expect(klaar).toHaveBeenCalled());
});

it("houdt het beginscherm bij twee herkenbare aanbieders en één mailveld",async()=>{
 render(<Inloggen opIngelogd={vi.fn()}/>);await screen.findByRole("button",{name:"Doorgaan met Google"});
 expect(screen.getByRole("button",{name:"Doorgaan met Google"}).querySelector('[data-aanmeldlogo="google"]')).toBeTruthy();
 expect(screen.getByRole("button",{name:"Doorgaan met Apple"}).querySelector('[data-aanmeldlogo="apple"]')).toBeTruthy();
 expect(screen.queryByLabelText("Wachtwoord")).toBeNull();expect(screen.queryByRole("button",{name:"Doorgaan met Microsoft"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Andere aanmeldmethoden"}));expect(screen.getByRole("button",{name:"Doorgaan met Microsoft"})).toBeTruthy();
});
it("vraagt pas het wachtwoord na Doorgaan en laat terugkeren zonder wachtwoord te bewaren",async()=>{
 render(<Inloggen opIngelogd={vi.fn()}/>);fireEvent.change(screen.getByLabelText("Gebruikersnaam of mailadres"),{target:{value:"alice"}});
 fireEvent.click(screen.getByRole("button",{name:"Doorgaan"}));expect(m.inlog).not.toHaveBeenCalled();expect(document.activeElement).toBe(screen.getByLabelText("Wachtwoord"));
 fireEvent.change(screen.getByLabelText("Wachtwoord"),{target:{value:"niet-bewaren"}});fireEvent.click(screen.getByRole("button",{name:"Andere aanmeldmethode"}));
 expect(screen.queryByLabelText("Wachtwoord")).toBeNull();fireEvent.click(screen.getByRole("button",{name:"Doorgaan"}));expect((screen.getByLabelText("Wachtwoord") as HTMLInputElement).value).toBe("");
});
it("houdt tweestapsverificatie intact in de rustigere aanmeldstappen",async()=>{
 m.inlog.mockResolvedValueOnce({code_nodig:true}).mockResolvedValueOnce({token:"test-session"});const klaar=vi.fn();render(<Inloggen opIngelogd={klaar}/>);
 fireEvent.change(screen.getByLabelText("Gebruikersnaam of mailadres"),{target:{value:"alice"}});fireEvent.click(screen.getByRole("button",{name:"Doorgaan"}));fireEvent.change(screen.getByLabelText("Wachtwoord"),{target:{value:"test-only"}});fireEvent.click(screen.getByRole("button",{name:"Inloggen"}));
 await screen.findByLabelText("Code uit je app");expect(klaar).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:"Doorgaan met Google"})).toBeNull();
 fireEvent.change(screen.getByLabelText("Code uit je app"),{target:{value:"123456"}});fireEvent.click(screen.getByRole("button",{name:"Inloggen"}));await waitFor(()=>expect(klaar).toHaveBeenCalled());expect(m.inlog).toHaveBeenLastCalledWith("alice","test-only","123456");
});
