import { cleanup,fireEvent,render,screen,waitFor } from "@testing-library/react";
import { afterEach,expect,it,vi } from "vitest";
import { WinkelKaart } from "./WinkelKaart";
import { zoekPlek,winkelsInBuurt } from "../lib/kaart";
import { bijwerken } from "../api";
import { kaartBestemmingOpenen,agendaPlekLezen } from "../lib/naar";
import type { Staat } from "../App";
vi.mock("./Kaart",()=>({Kaart:({kies}:{kies:(p:unknown)=>void})=><button onClick={()=>kies({naam:"Eigen plek",lat:52,lon:5,app:false,prive:true,soort:"Kaartpunt"})}>Kies kaartpunt</button>}));
vi.mock("../lib/kaart",async o=>({...await o<object>(),zoekPlek:vi.fn(),winkelsInBuurt:vi.fn()}));
vi.mock("../api",async o=>({...await o<object>(),bijwerken:vi.fn()}));
afterEach(()=>{cleanup();vi.resetAllMocks();window.dispatchEvent(new Event("assistent-sessie"));});
const staat:Staat={gebruiker:{id:1,naam:"test"},data:{taken:[],afspraken:[],volgend_id:1}};
const scherm=()=>render(<WinkelKaart staat={staat} setData={vi.fn()} winkels={[]} thuisadres="Privé thuisadres" open={vi.fn()}/>);
it("stuurt bij openen geen thuisadres of omgevingsquery naar een zoekdienst",()=>{
 scherm();expect(zoekPlek).not.toHaveBeenCalled();expect(winkelsInBuurt).not.toHaveBeenCalled();expect(screen.getByText(/Het kaartmidden is geen bekende locatie/)).toBeTruthy();
});
it("neemt een bekend agendapunt over zonder geocodering en opent alleen een agendavoorstel",()=>{
 kaartBestemmingOpenen("Privéadres",{bron:"agenda",titel:"Afspraak",punt:{lat:52,lon:5}});scherm();
 expect(zoekPlek).not.toHaveBeenCalled();expect(screen.getByRole("article",{name:"Gekozen bestemming"})).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Afspraak hier plannen"}));expect(agendaPlekLezen()?.kaartpunt).toEqual({lat:52,lon:5});expect(bijwerken).not.toHaveBeenCalled();
});
it("haalt winkels alleen op na de expliciete gebiedsopdracht",async()=>{
 vi.mocked(winkelsInBuurt).mockResolvedValue([]);scherm();fireEvent.click(screen.getByText("Winkels en vertrekopties"));fireEvent.click(screen.getByRole("button",{name:"Zoek winkels in dit gebied"}));await waitFor(()=>expect(winkelsInBuurt).toHaveBeenCalledOnce());
});
it("behoudt zoekresultaten als eigen bestemming met een enkele navigatieactie",async()=>{
 vi.mocked(zoekPlek).mockResolvedValue({lat:41.9,lon:12.5,naam:"Rome"});scherm();fireEvent.change(screen.getByLabelText("Zoek bestemming wereldwijd"),{target:{value:"Rome"}});fireEvent.click(screen.getByRole("button",{name:"Zoek"}));
 await screen.findByRole("article",{name:"Gekozen bestemming"});expect(screen.getAllByRole("link",{name:/Start navigeren/})).toHaveLength(1);expect(screen.getByRole("link",{name:/Start navigeren/}).getAttribute("href")).toContain("destination=41.9,12.5");
});
