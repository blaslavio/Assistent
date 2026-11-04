import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InteresseKeuze } from "./InteresseKeuze";
import { leesInteresses } from "../lib/interesses";
import { instellingenBijwerken } from "../api";
vi.mock("../api", async (o) => ({ ...(await o<object>()), instellingenBijwerken: vi.fn() }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("leest alleen geldige keuzes", () => {
  expect(leesInteresses({ interesses: ["geld", "onzin", 3, "leren"] })).toEqual(["geld", "leren"]);
  expect(leesInteresses(undefined)).toEqual([]);
});
it("bewaart de gekozen onderdelen in je instellingen", async () => {
  const inst: Record<string, unknown> = {};
  vi.mocked(instellingenBijwerken).mockImplementation(async (f) => { f(inst); return { taken: [], afspraken: [], volgend_id: 1 }; });
  const klaar = vi.fn();
  render(<InteresseKeuze begin={[]} klaar={klaar} />);
  fireEvent.click(screen.getByRole("button", { name: /Geld/ }));
  fireEvent.click(screen.getByRole("button", { name: /Verkopen/ }));
  fireEvent.click(screen.getByRole("button", { name: "Bewaren" }));
  await waitFor(() => expect(klaar).toHaveBeenCalled());
  expect(inst.interesses).toEqual(["geld", "verkopen"]);
});
