import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import BotBeheer from "./BotBeheer";
import { plaatsLink } from "../lib/bots";
afterEach(cleanup);
it("zet de tekst klaar waar het netwerk dat toestaat", () => {
  expect(plaatsLink("x", "Hoi & doei").url).toBe("https://x.com/intent/post?text=Hoi%20%26%20doei");
  expect(plaatsLink("instagram", "Hoi").tekstMee).toBe(false);
});
it("doet niet alsof een kanaal gekoppeld is en plaatst pas na jouw tik", () => {
  const open = vi.spyOn(window, "open").mockImplementation(() => null);
  render(<BotBeheer />);
  expect(screen.queryByText(/Simuleer/)).toBeNull();
  fireEvent.click(screen.getAllByRole("button", { name: "Koppelen" })[0]);
  expect(screen.getByRole("status").textContent).toMatch(/staat nog niet aan/);
  expect(open).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Keur laag risico goed" }));
  const knoppen = screen.queryAllByRole("button", { name: "Kopieer en open" });
  if (knoppen.length) { fireEvent.click(knoppen[0]); expect(open).toHaveBeenCalledOnce(); }
});
