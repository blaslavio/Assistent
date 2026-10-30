import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as api from "../lib/verhuur";
import Verblijven from "./Verblijven";
const login=vi.hoisted(()=>({sessie:{naam:"test",token:"eerste-token"}}));
vi.mock("../api",async origineel=>({...await origineel<object>(),huidigeSessie:()=>login.sessie}));
vi.mock("../lib/verhuur",async origineel=>({...await origineel<object>(),mijnVerhuur:vi.fn(),zoeken:vi.fn(),aanvragen:vi.fn()}));
const v:api.Verblijf={id:"00000000-0000-4000-8000-000000000001",versie:1,titel:"Vakantiehuis",plaats:"Gent",land:"België",beschrijving:"Rustig huis met keuken en twee slaapkamers.",regels:"Kosteloos annuleren tot zeven dagen voor aankomst.",prijs:10000,schoonmaak:5000,personen:4,van:"2030-01-01",tot:"2030-12-31",voorzieningen:["wifi"],open:true};
afterEach(()=>{cleanup();vi.resetAllMocks();login.sessie={naam:"test",token:"eerste-token"};});
it("bewaart één aanvraagopdracht bij verlies van antwoord en toont geen betaling als uitgevoerd",async()=>{
 vi.mocked(api.mijnVerhuur).mockResolvedValue({verblijven:[],reserveringen:[]});vi.mocked(api.zoeken).mockResolvedValue({verblijven:[v]});
 vi.mocked(api.aanvragen).mockRejectedValueOnce(new Error("Antwoord verloren")).mockResolvedValue({id:"aanvraag",status:"aangevraagd",totaal:45000});
 render(<Verblijven/>);fireEvent.change(screen.getByLabelText("Aankomst"),{target:{value:"2030-05-01"}});fireEvent.change(screen.getByLabelText("Vertrek"),{target:{value:"2030-05-05"}});
 fireEvent.click(screen.getByRole("button",{name:"Zoek beschikbare nachten"}));await waitFor(()=>expect(screen.getByText("Vakantiehuis")).toBeTruthy());
 fireEvent.click(screen.getByRole("button",{name:"Aanvraag voorbereiden"}));expect(api.aanvragen).not.toHaveBeenCalled();
 const bevestig=()=>screen.getByRole("button",{name:/^(Bevestigen|Dezelfde opdracht opnieuw controleren)$/});fireEvent.click(bevestig());await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
 fireEvent.click(bevestig());await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("geen betaling uitgevoerd"));
 expect(api.aanvragen).toHaveBeenCalledTimes(2);expect(vi.mocked(api.aanvragen).mock.calls[0][0].id).toBe(vi.mocked(api.aanvragen).mock.calls[1][0].id);
});
it("toont eerlijk dat verhuur niet beschikbaar is wanneer ophalen faalt",async()=>{
 vi.mocked(api.mijnVerhuur).mockRejectedValue(new Error("RPC ontbreekt"));render(<Verblijven/>);
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("nog niet beschikbaar"));
 fireEvent.click(screen.getByRole("button",{name:"Mijn aanbod"}));expect((screen.getByRole("button",{name:"Woning of vakantieverblijf toevoegen"}) as HTMLButtonElement).disabled).toBe(true);
});

it("laat twee verblijven vergelijken op totaalprijs zonder een aanvraag uit te voeren",async()=>{
 vi.mocked(api.mijnVerhuur).mockResolvedValue({verblijven:[],reserveringen:[]});
 vi.mocked(api.zoeken).mockResolvedValue({verblijven:[{...v,prijs:8000,schoonmaak:20000},{...v,id:"andere",titel:"Inclusief schoonmaak",prijs:10000,schoonmaak:0}]});
 render(<Verblijven/>);fireEvent.change(screen.getByLabelText("Aankomst"),{target:{value:"2030-05-01"}});fireEvent.change(screen.getByLabelText("Vertrek"),{target:{value:"2030-05-03"}});
 fireEvent.click(screen.getByRole("button",{name:"Zoek beschikbare nachten"}));await waitFor(()=>expect(screen.getByText("Inclusief schoonmaak")).toBeTruthy());
 fireEvent.click(screen.getByLabelText("Vergelijk Vakantiehuis"));fireEvent.click(screen.getByLabelText("Vergelijk Inclusief schoonmaak"));
 expect(screen.getByRole("region",{name:"Verblijven vergelijken"})).toBeTruthy();expect(api.aanvragen).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button",{name:"Vergelijking wissen"}));expect(screen.queryByRole("region",{name:"Verblijven vergelijken"})).toBeNull();
});
it("wist reserveringsadressen en opdrachten meteen bij een sessiewissel",async()=>{
 vi.mocked(api.mijnVerhuur).mockResolvedValue({verblijven:[],reserveringen:[{id:"r",verblijf:v.id,titel:v.titel,plaats:v.plaats,van:"2030-05-01",tot:"2030-05-03",personen:2,totaal:20000,voorwaarden:v.regels,status:"bevestigd",verhuurder:false,contact:"host",adres:"Geheim adres 5"}]});
 render(<Verblijven/>);fireEvent.click(screen.getByRole("button",{name:"Reserveringen"}));await waitFor(()=>expect(screen.getByText("Adres: Geheim adres 5")).toBeTruthy());
 act(()=>{login.sessie={naam:"ander",token:"ander-token"};window.dispatchEvent(new Event("assistent-sessie"));});
 expect(screen.queryByText("Adres: Geheim adres 5")).toBeNull();expect(screen.getByRole("alert").textContent).toContain("sessie is gewijzigd");
});
it("negeert een laat antwoord van de vorige sessie",async()=>{
 let klaar!:(r:api.MijnVerhuur)=>void;vi.mocked(api.mijnVerhuur).mockImplementation(()=>new Promise(r=>{klaar=r;}));
 render(<Verblijven/>);
 act(()=>{login.sessie={naam:"ander",token:"ander-token"};window.dispatchEvent(new Event("assistent-sessie"));});
 await act(async()=>{klaar({verblijven:[v],reserveringen:[]});});fireEvent.click(screen.getByRole("button",{name:"Mijn aanbod"}));
 expect(screen.queryByText(v.titel)).toBeNull();
});
