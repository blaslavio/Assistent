import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import Vandaag from "./Vandaag";
import type { Staat } from "../App";
import { bijwerken, instellingenBijwerken } from "../api";

vi.mock("../api", async origineel => ({ ...await origineel<object>(), bijwerken: vi.fn(), instellingenBijwerken: vi.fn() }));
vi.mock("../mascotte", () => ({ MascotteMetTip: () => null, zeg: vi.fn() }));
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
    fireEvent.click(screen.getByText(/^Taken ·/));
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
    fireEvent.click(screen.getByText(/^Taken ·/));
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
    fireEvent.click(screen.getByText(/^Taken ·/));
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
    fireEvent.click(screen.getByText("Tips en persoonlijke inrichting"));
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
    fireEvent.click(screen.getByText("Tips en persoonlijke inrichting"));
    fireEvent.click(screen.getByRole("button", { name: "Vandaag" }));
    g.taken[0].titel = "Elders gewijzigd";
    fireEvent.click(screen.getByRole("button", { name: "Bevestigen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("niet meer actueel"));
    expect(g.taken[0].deadline).toBe("2000-01-01");
  });
});
it("toont eerst drie taken maar houdt de volledige takenlijst bereikbaar",()=>{
 const init=begin();init.data.instellingen={aan_de_slag:"weg"};init.data.taken=Array.from({length:7},(_,i)=>({id:i+1,titel:`Taak ${i+1}`,klaar:false}));render(<Scherm init={init}/>);fireEvent.click(screen.getByText(/^Taken ·/));expect(screen.getAllByRole("checkbox")).toHaveLength(3);expect(screen.queryByRole("checkbox",{name:"Taak 7"})).toBeNull();fireEvent.click(screen.getByText("Bekijk alle 7 taken"));expect(screen.getAllByRole("checkbox")).toHaveLength(7);fireEvent.click(screen.getByText("Toon mijn drie eerstvolgende taken"));expect(screen.getAllByRole("checkbox")).toHaveLength(3);expect(bijwerken).not.toHaveBeenCalled();
});

it("houdt de profielchecklist ingeklapt en opent de eerstvolgende afspraak in de agenda", () => {
  const init = begin();
  const morgen = new Date(); morgen.setHours(0, 0, 0, 0);
  const datum = `${morgen.getFullYear()}-${String(morgen.getMonth()+1).padStart(2,"0")}-${String(morgen.getDate()).padStart(2,"0")}`;
  init.data.afspraken.push({id:1,titel:"Volgende afspraak",start:`${datum}T00:01`,einde:`${datum}T23:59:59`});
  const ga = vi.fn();
  render(<Vandaag staat={init} setStaat={() => {}} naarInstellingen={() => {}} ga={ga}/>);
  fireEvent.click(screen.getByText("Tips en persoonlijke inrichting"));
  const summary = screen.getByText("Profiel verder instellen");
  expect(summary.closest("details")?.open).toBe(false);
  fireEvent.click(screen.getByRole("button", {name:"Open agenda: Volgende afspraak"}));
  expect(ga).toHaveBeenCalledWith("agenda");
  expect(bijwerken).not.toHaveBeenCalled();
});

it("houdt week, taken en tips standaard dicht en laat teruggaan zonder tekstverlies",async()=>{
 render(<Scherm/>);for(const label of [/^Taken ·/,"Vooruitkijken","Tips en persoonlijke inrichting"])expect(screen.getByText(label).closest("details")?.open).toBe(false);
 fireEvent.click(screen.getByText(/^Taken ·/));const veld=screen.getByLabelText("Nieuwe taak");fireEvent.change(veld,{target:{value:"Rustig voorbereiden"}});
 fireEvent.click(screen.getByRole("button",{name:"Taak voorbereiden"}));expect(screen.getByText("Stap 2 van 2 · Controleren")).toBeTruthy();
 fireEvent.click(screen.getByRole("button",{name:"Terug naar invoer"}));expect((veld as HTMLInputElement).value).toBe("Rustig voorbereiden");await waitFor(()=>expect(document.activeElement).toBe(veld));expect(bijwerken).not.toHaveBeenCalled();
});

it("wisselt op verzoek naar zacht licht en bewaart de overige persoonlijke voorkeuren",async()=>{
 const init=begin();init.data.instellingen={thema:"donker",stijl:{toon:"Informeel"}};const g=structuredClone(init.data);
 vi.mocked(instellingenBijwerken).mockImplementation(async aanpassen=>{aanpassen(g.instellingen!);return structuredClone(g);});
 render(<Scherm init={init}/>);fireEvent.click(screen.getByRole("button",{name:"Lichte blauw-witte weergave"}));
 await waitFor(()=>expect(screen.queryByRole("button",{name:"Lichte blauw-witte weergave"})).toBeNull());
 expect(g.instellingen?.thema).toBe("licht");expect(g.instellingen?.stijl).toEqual({toon:"Informeel",kleur:"hemel"});expect(init.data.instellingen?.thema).toBe("donker");
});
