import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const bewaard = vi.hoisted(() => ({ p: null as unknown }));
vi.mock("../lib/gasten", async (orig) => {
  const echt = await orig<typeof import("../lib/gasten")>();
  return { ...echt,
    mijnPagina: vi.fn(async () => ({ pagina: null, boekingen: [
      { id: 7, soort: "Training", start: new Date(Date.now() + 86400000).toISOString(), minuten: 60, naam: "Sam", email: "",
        telefoon: "", notitie: "", status: "aangevraagd", afspraak_id: null, verwerkt: false } ] })),
    paginaBewaren: vi.fn(async (p) => { bewaard.p = p; return p; }),
    afhandelen: vi.fn(async () => ({})) };
});
import { BoekpaginaInstellen } from "./Gasten";
import { afhandelen } from "../lib/gasten";
afterEach(cleanup);

it("zet de stappen in een logische volgorde en bewaart prijs, tijden per dag en regels", async () => {
  render(<BoekpaginaInstellen naam="Alex" />);
  await screen.findByText("Wat bied je aan");
  const koppen = ["Wat bied je aan", "Wanneer ben je beschikbaar", "Regels", "Je pagina"].map((t) => screen.getByText(t));
  for (let i = 1; i < koppen.length; i++) expect(koppen[i - 1].compareDocumentPosition(koppen[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText("Betalen en annuleren")).toBeNull();
  const prijs = screen.getByLabelText("Prijs");
  fireEvent.change(prijs, { target: { value: "12,50" } });
  fireEvent.blur(prijs);
  expect(screen.getByText("Betalen en annuleren")).toBeTruthy();
  fireEvent.click(screen.getByText("Andere tijden per dag"));
  fireEvent.change(screen.getByLabelText("Vr tot"), { target: { value: "13:00" } });
  fireEvent.change(screen.getByLabelText("Pauze tussen afspraken"), { target: { value: "30" } });
  fireEvent.click(screen.getByRole("button", { name: "Bewaar" }));
  await waitFor(() => expect(bewaard.p).toBeTruthy());
  const p = bewaard.p as { soorten: { prijs: number }[]; uren: Record<string, string[][]>; buffer: number };
  expect(p.soorten[0].prijs).toBe(1250);
  expect(p.uren["5"]).toEqual([["09:00", "13:00"]]);
  expect(p.uren["1"]).toEqual([["09:00", "17:00"]]);
  expect(p.buffer).toBe(30);
});

it("laat een aanvraag bevestigen of afwijzen", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  render(<BoekpaginaInstellen naam="Alex" />);
  fireEvent.click(await screen.findByRole("button", { name: "Afwijzen" }));
  await waitFor(() => expect(afhandelen).toHaveBeenCalledWith(7, "afwijzen"));
});
