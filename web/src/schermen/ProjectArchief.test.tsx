import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ProjectArchief from "./ProjectArchief";
import { Werkbestand } from "../lib/project";
import { projectArchiefLezen, projectArchiefLijst, projectArchiefVoorstel } from "../lib/chat";

vi.mock("../lib/chat", () => ({ versturen: vi.fn(), projectArchiefLezen: vi.fn(), projectArchiefLijst: vi.fn(), projectArchiefVoorstel: vi.fn() }));
const maak = () => { const b = new Werkbestand("00000000-0000-4000-8000-000000000001", "werk.md"); b.bewerk("Actuele tekst"); return b; };
beforeEach(() => {
  vi.mocked(projectArchiefLijst).mockReset().mockResolvedValue({ versies: [{ id: 7, afzender: 1, aangemaakt: new Date().toISOString() }] });
  vi.mocked(projectArchiefLezen).mockReset().mockResolvedValue("Oudere tekst");
  vi.mocked(projectArchiefVoorstel).mockReset();
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("archiveert pas na bevestigen en hergebruikt de exacte versleutelde opdracht na een fout", async () => {
  const b = maak();
  const bewaren = vi.fn().mockRejectedValueOnce(new Error("Antwoord weg")).mockResolvedValueOnce({ id: 7, aangemaakt: new Date().toISOString() });
  vi.mocked(projectArchiefVoorstel).mockResolvedValue(bewaren);
  render(<ProjectArchief gesprek={9} bestand={b} schrijven />);
  fireEvent.click(screen.getByText("Versiearchief en veilig herstel"));
  fireEvent.click(screen.getByRole("button", { name: "Huidige versie voorbereiden" }));
  expect(projectArchiefVoorstel).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Bevestig archiveren" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("niet bevestigd"));
  fireEvent.click(screen.getByRole("button", { name: "Dezelfde archiefopdracht opnieuw proberen" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("gearchiveerd"));
  expect(projectArchiefVoorstel).toHaveBeenCalledTimes(1); expect(bewaren).toHaveBeenCalledTimes(2); b.doc.destroy();
});

it("herstelt geen oude versie over een intussen gewijzigde tekst", async () => {
  const b = maak(); render(<ProjectArchief gesprek={9} bestand={b} schrijven />);
  fireEvent.click(screen.getByText("Versiearchief en veilig herstel"));
  fireEvent.click(screen.getByRole("button", { name: "Versies ophalen" }));
  await screen.findByRole("button", { name: "Bekijken" });
  fireEvent.click(screen.getByRole("button", { name: "Bekijken" }));
  await screen.findByRole("button", { name: "Bevestig herstel als nieuwe bewerking" });
  b.bewerk("Iemand wijzigde dit");
  fireEvent.click(screen.getByRole("button", { name: "Bevestig herstel als nieuwe bewerking" }));
  expect(screen.getByRole("alert").textContent).toContain("intussen gewijzigd"); expect(b.inhoud).toBe("Iemand wijzigde dit"); b.doc.destroy();
});

it("past een bekeken versie pas na bevestigen als nieuwe lokale bewerking toe", async () => {
  const b = maak(); render(<ProjectArchief gesprek={9} bestand={b} schrijven />);
  fireEvent.click(screen.getByText("Versiearchief en veilig herstel"));
  fireEvent.click(screen.getByRole("button", { name: "Versies ophalen" }));
  await screen.findByRole("button", { name: "Bekijken" }); fireEvent.click(screen.getByRole("button", { name: "Bekijken" }));
  await screen.findByRole("button", { name: "Bevestig herstel als nieuwe bewerking" });
  expect(b.inhoud).toBe("Actuele tekst"); fireEvent.click(screen.getByRole("button", { name: "Bevestig herstel als nieuwe bewerking" }));
  expect(b.inhoud).toBe("Oudere tekst"); expect(b.wacht).toBe(true); b.doc.destroy();
});

it("toont geen verzonnen versies of succes als het archief nog niet beschikbaar is", async () => {
  vi.mocked(projectArchiefLijst).mockRejectedValueOnce(new Error("RPC ontbreekt"));
  const b = maak(); render(<ProjectArchief gesprek={9} bestand={b} schrijven />);
  fireEvent.click(screen.getByText("Versiearchief en veilig herstel"));
  fireEvent.click(screen.getByRole("button", { name: "Versies ophalen" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("nog niet beschikbaar"));
  expect(screen.queryByRole("button", { name: "Bekijken" })).toBeNull(); expect(screen.queryByRole("status")).toBeNull();
  b.doc.destroy();
});
