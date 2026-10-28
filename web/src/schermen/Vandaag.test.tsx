import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import Vandaag from "./Vandaag";
import type { Staat } from "../App";
import { bijwerken } from "../api";

vi.mock("../api", async origineel => ({ ...await origineel<object>(), bijwerken: vi.fn() }));
vi.mock("../mascotte", () => ({ MascotteMetTip: () => null }));
vi.mock("../lib/weer", () => ({ weerNu: vi.fn().mockResolvedValue(null) }));

const begin = (): Staat => ({ gebruiker: { id: 1, naam: "test" }, data: { taken: [], afspraken: [], volgend_id: 1 } });
function Scherm({ init = begin() }: { init?: Staat }) {
  const [staat, setStaat] = useState(init);
  return <Vandaag staat={staat} setStaat={setStaat} naarInstellingen={() => {}} />;
}
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("Vandaag bevestigen en terugvinden", () => {
  it("schrijft pas na bevestigen en toont daarna het resultaat", async () => {
    const g = begin().data;
    vi.mocked(bijwerken).mockImplementation(async wijzigen => { wijzigen(g); return structuredClone(g); });
    render(<Scherm />);
    fireEvent.change(screen.getByLabelText("Nieuwe taak"), { target: { value: "Overleg voorbereiden" } });
    fireEvent.click(screen.getByRole("button", { name: "Taak voorbereiden" }));
    expect(bijwerken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Taak toegevoegd: Overleg voorbereiden"));
    expect(g.taken).toHaveLength(1);
  });

  it("behoudt tekst en dezelfde opdracht als het antwoord na opslaan verloren gaat", async () => {
    const g = begin().data;
    vi.mocked(bijwerken).mockImplementationOnce(async wijzigen => { wijzigen(g); throw new Error("Verbinding weg"); })
      .mockImplementationOnce(async wijzigen => { wijzigen(g); return structuredClone(g); });
    render(<Scherm />);
    fireEvent.change(screen.getByLabelText("Nieuwe taak"), { target: { value: "Bewaren" } });
    fireEvent.click(screen.getByRole("button", { name: "Taak voorbereiden" }));
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("nog niet bevestigd"));
    expect((screen.getByLabelText("Nieuwe taak") as HTMLInputElement).value).toBe("Bewaren");
    expect(screen.queryByRole("status")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dezelfde opdracht opnieuw proberen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Taak toegevoegd"));
    expect(g.taken).toHaveLength(1);
  });

  it("toont een taak niet alvast als klaar wanneer opslaan mislukt", async () => {
    const init = begin(); init.data.taken.push({ id: 1, titel: "Nog open", klaar: false });
    vi.mocked(bijwerken).mockRejectedValue(new Error("Geen verbinding"));
    render(<Scherm init={init} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Nog open" }));
    expect(bijwerken).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect((screen.getByRole("checkbox", { name: "Nog open" }) as HTMLInputElement).checked).toBe(false);
    expect(init.data.taken[0].klaar).toBe(false);
  });

  it("toont het gevolg van een dagvoorstel voordat de keuze wordt opgeslagen", async () => {
    const init = begin(); init.data.taken.push({ id: 1, titel: "Achterstallig", deadline: "2000-01-01", klaar: false });
    const g = structuredClone(init.data);
    vi.mocked(bijwerken).mockImplementation(async wijzigen => { wijzigen(g); return structuredClone(g); });
    render(<Scherm init={init} />);
    fireEvent.click(screen.getByRole("button", { name: "Vandaag" }));
    expect(bijwerken).not.toHaveBeenCalled();
    expect(screen.getByRole("region", { name: "Controleer je keuze" }).textContent).toContain("De deadline wordt vandaag");
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Je keuze is opgeslagen"));
  });

  it("voert een dagvoorstel niet uit als de taak intussen is gewijzigd", async () => {
    const init = begin(); init.data.taken.push({ id: 1, titel: "Achterstallig", deadline: "2000-01-01", klaar: false });
    const g = structuredClone(init.data);
    vi.mocked(bijwerken).mockImplementation(async wijzigen => { wijzigen(g); return structuredClone(g); });
    render(<Scherm init={init} />);
    fireEvent.click(screen.getByRole("button", { name: "Vandaag" }));
    g.taken[0].titel = "Elders gewijzigd";
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("niet meer actueel"));
    expect(g.taken[0].deadline).toBe("2000-01-01");
  });
});
