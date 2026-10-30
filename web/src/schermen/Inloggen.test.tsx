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
 render(<Inloggen opIngelogd={vi.fn()}/>);const google=await screen.findByRole("button",{name:"Verder met Google"});await waitFor(()=>expect((google as HTMLButtonElement).disabled).toBe(false));
 expect((screen.getByRole("button",{name:/Verder met Apple/}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(google);expect(m.begin).not.toHaveBeenCalled();expect((screen.getByRole("button",{name:"Doorgaan naar Google"}) as HTMLButtonElement).disabled).toBe(true);
 fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("button",{name:"Doorgaan naar Google"}));await waitFor(()=>expect(m.begin).toHaveBeenCalledWith("google",true));
});
it("houdt wachtwoordaanmelding beschikbaar als de providers niet beschikbaar zijn",async()=>{
 m.beschikbaar.mockResolvedValue({google:false,apple:false,azure:false});m.inlog.mockResolvedValue({token:"test-session"});const klaar=vi.fn();render(<Inloggen opIngelogd={klaar}/>);
 await screen.findByText(/Google, Apple en Microsoft zijn nog niet beschikbaar/);
 fireEvent.change(screen.getByLabelText("Gebruikersnaam of mailadres"),{target:{value:"alice"}});fireEvent.change(screen.getByLabelText("Wachtwoord"),{target:{value:"test-only"}});fireEvent.click(screen.getByRole("button",{name:"Inloggen"}));await waitFor(()=>expect(klaar).toHaveBeenCalled());
});
