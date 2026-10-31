import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import Chat from "./Chat";
import { Oproepen } from "./Oproepen";
import { instellingenOpenen } from "../lib/naar";
import { belVoorkeurZetten } from "../lib/bellen";
import type { Staat } from "../App";
const m=vi.hoisted(()=>({kan:true}));
vi.mock("../lib/chat",async o=>({...await o<object>(),starten:async()=>1,overzicht:async()=>({gesprekken:[],communities:[]})}));
vi.mock("../lib/gasten",async o=>({...await o<object>(),gesprekken:async()=>({gesprekken:[],mail:false})}));
vi.mock("../lib/bellen",async o=>({...await o<object>(),luisteren:vi.fn(),kan:()=>m.kan,oproepen:()=>[],belVoorkeur:()=>({geluid:"aan",stilAan:false,stilVan:"22:00",stilTot:"07:00",micUit:false,cameraUit:false,favorieten:[]}),belVoorkeurZetten:vi.fn()}));
vi.mock("./Bellen",()=>({useBellen:()=>{}}));
vi.mock("../lib/naar",async o=>({...await o<object>(),instellingenOpenen:vi.fn()}));
beforeEach(()=>{m.kan=true;localStorage.clear();});
afterEach(()=>{cleanup();vi.clearAllMocks();localStorage.clear();});
const staat:Staat={gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}};
it("toont bij Bellen maar één instellingenknop en houdt algemene privacy daaronder bereikbaar",async()=>{
 localStorage.setItem("assistent.chatdeel","oproepen");render(<Chat staat={staat} naarInstellingen={vi.fn()} bestel={vi.fn()}/>);
 await screen.findByRole("button",{name:"Iemand zoeken"});expect(screen.getAllByRole("button",{name:"Belinstellingen"})).toHaveLength(1);expect(screen.queryByRole("button",{name:"Privacy en beveiliging instellen"})).toBeNull();
 fireEvent.click(screen.getByRole("button",{name:"Belinstellingen"}));fireEvent.click(screen.getByRole("button",{name:"Privacy en beveiliging van mijn account"}));expect(instellingenOpenen).toHaveBeenCalledWith("privacy");await waitFor(()=>expect(screen.queryByRole("dialog")).toBeNull());
});
it("bundelt belplanning en statistieken zonder onbedoeld stille uren te wijzigen",()=>{
 const zoek=vi.fn();render(<Oproepen ik={1} lijst={[]} instellingen={false} sluitInstellingen={vi.fn()} bewaard={vi.fn()} zoekIemand={zoek}/>);
 expect(screen.queryByLabelText("Zoek iemand om te bellen")).toBeNull();const groep=screen.getByText("Planning en beloverzicht");expect(groep.closest("details")?.open).toBe(false);expect(belVoorkeurZetten).not.toHaveBeenCalled();
 fireEvent.click(groep);fireEvent.click(screen.getByRole("button",{name:/Plannen/}));expect(zoek).toHaveBeenCalledOnce();expect(belVoorkeurZetten).not.toHaveBeenCalled();
});
it("houdt privacyinstellingen bereikbaar wanneer de browser bellen niet ondersteunt",()=>{
 m.kan=false;render(<Oproepen ik={1} lijst={[]} instellingen={true} sluitInstellingen={vi.fn()} bewaard={vi.fn()} zoekIemand={vi.fn()}/>);
 expect(screen.getByRole("button",{name:"Privacy en beveiliging van mijn account"})).toBeTruthy();
});
