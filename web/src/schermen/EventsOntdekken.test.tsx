import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EventsOntdekken, MijnTickets } from "./EventsOntdekken";
import { alsIk } from "../api";
import { isGevraagd } from "../lib/bestellingen";
const sessie = vi.hoisted(() => ({ naam: "test", token: "t" }));
vi.mock("../api", async (o) => ({ ...(await o<object>()), alsIk: vi.fn(), huidigeSessie: () => sessie }));
afterEach(() => { cleanup(); vi.mocked(alsIk).mockReset(); });
const gala = { id: 10, titel: "Boksgala", start: "2027-02-28T18:00:00Z", einde: "2027-02-28T22:30:00Z", plaats: "Sporthal", event_type: "sport",
  omschrijving: "Deuren open 18:30", gratis: false, open: false, vrij: 200, organisator: "Gala BV",
  soorten: [{ id: 5, titel: "Ringside", prijs: 45, vrij: 3 }, { id: 6, titel: "Staanplaats", prijs: 20, vrij: 100 }] };

it("toont komende evenementen met eindtijd en laat tickets bestellen en daarna betalen", async () => {
  vi.mocked(alsIk).mockImplementation(async (fn: string) => (fn === "events_lijst" ? { events: [gala] } : { ok: true, id: 77, bedrag: 90 }) as never);
  const ga = vi.fn(); window.addEventListener("app-naar", ga);
  render(<EventsOntdekken />);
  fireEvent.click(await screen.findByRole("button", { name: /Boksgala.*19:00 tot 23:30.*vanaf/ }));
  expect(screen.getByText("Deuren open 18:30")).toBeTruthy();
  fireEvent.click(screen.getByRole("radio", { name: /Ringside/ }));
  expect(screen.getAllByRole("option")).toHaveLength(3);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: "2" } });
  expect(screen.getByText(/90,00/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Bestellen en betalen" }));
  await vi.waitFor(() => expect(ga).toHaveBeenCalled());
  expect(vi.mocked(alsIk).mock.calls.at(-1)).toEqual(["webshop_bestellen", { p_aanbod: 5, p_aantal: 2, p_levering: "ophalen", p_bericht: "", p_code: "" }]);
  expect(isGevraagd()).toBe(true);
  window.removeEventListener("app-naar", ga);
});

it("zegt dat afgelopen evenementen vanzelf verdwijnen als er niets open staat", async () => {
  vi.mocked(alsIk).mockResolvedValue({ events: [] } as never);
  render(<EventsOntdekken />);
  expect(await screen.findByText(/verdwijnen vanzelf/)).toBeTruthy();
});

it("nummert meerdere tickets voor hetzelfde evenement", async () => {
  const t = { code: "a".repeat(64), status: "geldig", evenement: 10, titel: "Boksgala", start: gala.start, einde: gala.einde, plaats: "Sporthal", betaald: true };
  vi.mocked(alsIk).mockResolvedValue({ tickets: [{ ...t, id: "1" }, { ...t, id: "2" }] } as never);
  render(<MijnTickets />);
  expect(await screen.findByText(/ticket 1 van 2/)).toBeTruthy();
  expect(screen.getByText(/ticket 2 van 2/)).toBeTruthy();
});
