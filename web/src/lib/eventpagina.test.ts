import { beforeEach, expect, it, vi } from "vitest";
import { soortControle, ticketsKopen, vanafPrijs, wanneer, eventsLijst, type EventKaart } from "./eventpagina";
import { alsIk } from "../api";
vi.mock("../api", async (o) => ({ ...(await o<object>()), alsIk: vi.fn() }));
beforeEach(() => vi.mocked(alsIk).mockReset());

it("toont tot wanneer een evenement loopt, ook over middernacht", () => {
  expect(wanneer("2027-02-28T18:00:00Z", "2027-02-28T22:30:00Z")).toMatch(/28 februari · 19:00 tot 23:30$/);
  expect(wanneer("2027-02-28T18:00:00Z", "2027-03-01T00:30:00Z")).toMatch(/19:00 tot 01:30$/);
  expect(wanneer("2027-02-27T09:00:00Z", "2027-02-28T17:00:00Z")).toMatch(/loopt tot zo 28 februari 18:00$/);
});

it("controleert ticketsoorten voordat iets naar de server gaat", () => {
  expect(soortControle("", 25, 10)).toMatch(/naam/);
  expect(soortControle("Ringside", 0.5, 10)).toMatch(/prijs/);
  expect(soortControle("Ringside", 25, 0)).toMatch(/aantal/);
  expect(soortControle("Ringside", 25, 100)).toBe("");
});

it("bestelt tickets alleen als ophalen via de webshop en weigert rare aantallen", async () => {
  await expect(ticketsKopen(5, 0)).rejects.toThrow();
  await expect(ticketsKopen(5, 21)).rejects.toThrow();
  vi.mocked(alsIk).mockResolvedValueOnce({ ok: true, id: 9, bedrag: 50 });
  expect(await ticketsKopen(5, 2)).toEqual({ id: 9, bedrag: 50 });
  expect(vi.mocked(alsIk).mock.calls[0]).toEqual(["webshop_bestellen", { p_aanbod: 5, p_aantal: 2, p_levering: "ophalen", p_bericht: "", p_code: "" }]);
  vi.mocked(alsIk).mockResolvedValueOnce({ fout: "Dit product is uitverkocht." });
  await expect(ticketsKopen(5, 1)).rejects.toThrow("uitverkocht");
});

it("zet prijzen om naar getallen en geeft de laagste prijs", async () => {
  vi.mocked(alsIk).mockResolvedValueOnce({ events: [{ id: 1, soorten: [{ id: 2, titel: "Ringside", prijs: "45.00", vrij: 10 }, { id: 3, titel: "Staan", prijs: "20.00", vrij: 5 }] }] });
  const [e] = await eventsLijst();
  expect(vanafPrijs(e as EventKaart)).toBe(20);
});
