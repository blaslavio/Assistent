import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import * as api from "../lib/verhuur";
import Verblijven from "./Verblijven";
vi.mock("../lib/verhuur",async origineel=>({...await origineel<object>(),mijnVerhuur:vi.fn(),zoeken:vi.fn(),aanvragen:vi.fn()}));
const v:api.Verblijf={id:"00000000-0000-4000-8000-000000000001",versie:1,titel:"Vakantiehuis",plaats:"Gent",land:"België",beschrijving:"Rustig huis met keuken en twee slaapkamers.",regels:"Kosteloos annuleren tot zeven dagen voor aankomst.",prijs:10000,schoonmaak:5000,personen:4,van:"2030-01-01",tot:"2030-12-31",voorzieningen:["wifi"],open:true};
afterEach(()=>{cleanup();vi.resetAllMocks();});
it("bewaart één aanvraagopdracht bij verlies van antwoord en toont geen betaling als uitgevoerd",async()=>{
 vi.mocked(api.mijnVerhuur).mockResolvedValue({verblijven:[],reserveringen:[]});vi.mocked(api.zoeken).mockResolvedValue({verblijven:[v]});
 vi.mocked(api.aanvragen).mockRejectedValueOnce(new Error("Antwoord verloren")).mockResolvedValue({id:"aanvraag",status:"aangevraagd",totaal:45000});
 render(<Verblijven/>);fireEvent.change(screen.getByLabelText("Aankomst"),{target:{value:"2030-05-01"}});fireEvent.change(screen.getByLabelText("Vertrek"),{target:{value:"2030-05-05"}});
 fireEvent.click(screen.getByRole("button",{name:"Zoek beschikbare nachten"}));await waitFor(()=>expect(screen.getByText("Vakantiehuis")).toBeTruthy());
 fireEvent.click(screen.getByRole("button",{name:"Aanvraag voorbereiden"}));expect(api.aanvragen).not.toHaveBeenCalled();
 const bevestig=()=>screen.getByRole("button",{name:"Opdracht bevestigen / dezelfde opdracht opnieuw controleren"});fireEvent.click(bevestig());await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
 fireEvent.click(bevestig());await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("geen betaling uitgevoerd"));
 expect(api.aanvragen).toHaveBeenCalledTimes(2);expect(vi.mocked(api.aanvragen).mock.calls[0][0].id).toBe(vi.mocked(api.aanvragen).mock.calls[1][0].id);
});
it("toont eerlijk dat verhuur niet beschikbaar is wanneer ophalen faalt",async()=>{
 vi.mocked(api.mijnVerhuur).mockRejectedValue(new Error("RPC ontbreekt"));render(<Verblijven/>);
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("nog niet beschikbaar"));
 fireEvent.click(screen.getByRole("button",{name:"Mijn aanbod"}));expect((screen.getByRole("button",{name:"Woning of vakantieverblijf toevoegen"}) as HTMLButtonElement).disabled).toBe(true);
});
