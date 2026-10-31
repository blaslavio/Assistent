import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BetaalverzoekMaken, ChatBetaalkaart } from "./ChatBetaling";
import { lijst, type Bestelling } from "../lib/bestellingen";
import { eigenBetaalverzoek, chatCheckout } from "../lib/chatbetaling";
import { versturen } from "../lib/chat";
vi.mock("../lib/bestellingen",()=>({lijst:vi.fn(),stand:()=>"Wacht op betaling"}));
vi.mock("../lib/chatbetaling",async origineel=>({...await origineel<object>(),eigenBetaalverzoek:vi.fn(),chatCheckout:vi.fn()}));
vi.mock("../lib/chat",()=>({versturen:vi.fn()}));
const s=vi.hoisted(()=>({naam:"Alice",token:"test"}));vi.mock("../api",()=>({huidigeSessie:()=>s}));
const b:Bestelling={id:42,titel:"Ontwerp",bedrag:125,betaalwijze:"app",levering:"digitaal",status:"geaccepteerd",rol:"verkoper",ander_id:2,ander:"Bob",bijgewerkt:"2026-10-29"};
beforeEach(()=>{vi.mocked(lijst).mockResolvedValue([{...b}]);vi.mocked(eigenBetaalverzoek).mockResolvedValue({...b});vi.mocked(versturen).mockResolvedValue({id:7});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
it("deelt pas na preview en hercontrole, uitsluitend de bestelreferentie",async()=>{
 render(<BetaalverzoekMaken gesprek={8} ander={2} vernieuw={vi.fn().mockResolvedValue(undefined)}/>);
 fireEvent.click(screen.getByText("Betaalverzoek in deze chat"));fireEvent.click(screen.getByText("Eigen betaalverzoeken ophalen"));fireEvent.click(await screen.findByRole("button",{name:/Controleer #42/}));
 expect(versturen).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Bevestig delen van betaalverzoek"));await waitFor(()=>expect(versturen).toHaveBeenCalledWith(8,{t:"projectbetaling",versie:1,bestelling:42}));
 expect(eigenBetaalverzoek).toHaveBeenCalledWith(42,2,"verkoper");
});
it("deelt geen verzoek als het bedrag intussen gewijzigd is",async()=>{
 vi.mocked(eigenBetaalverzoek).mockResolvedValue({...b,bedrag:200});render(<BetaalverzoekMaken gesprek={8} ander={2} vernieuw={vi.fn()}/>);
 fireEvent.click(screen.getByText("Betaalverzoek in deze chat"));fireEvent.click(screen.getByText("Eigen betaalverzoeken ophalen"));fireEvent.click(await screen.findByRole("button",{name:/Controleer #42/}));fireEvent.click(screen.getByText("Bevestig delen van betaalverzoek"));
 await waitFor(()=>expect(screen.getByRole("alert").textContent).toContain("gewijzigd"));expect(versturen).not.toHaveBeenCalled();
});
it("haalt geen financiële details op voordat de ontvanger daar zelf om vraagt",async()=>{
 vi.mocked(eigenBetaalverzoek).mockResolvedValue({...b,rol:"koper"});render(<ChatBetaalkaart bericht={{t:"projectbetaling",versie:1,bestelling:42}} ander={2} mijn={false}/>);
 expect(eigenBetaalverzoek).not.toHaveBeenCalled();expect(chatCheckout).not.toHaveBeenCalled();fireEvent.click(screen.getByText("Actueel bedrag en status controleren"));await screen.findByText("Wacht op betaling");
 expect(eigenBetaalverzoek).toHaveBeenCalledWith(42,2,"koper");expect(chatCheckout).not.toHaveBeenCalled();expect(screen.getByText("Verder naar beveiligd betalen")).toBeTruthy();
});
