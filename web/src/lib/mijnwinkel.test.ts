import { describe, expect, it } from "vitest";
import { webadres, winkelStappen, type MijnWinkel } from "./mijnwinkel";

describe("webadres", () => {
  it("maakt een geldig adres van de naam", () => {
    expect(webadres("Bakkerij De Zon")).toBe("bakkerij-de-zon");
    expect(webadres("Café Ñandú & Zoon!")).toBe("cafe-nandu-zoon");
    expect(webadres("  --Fit--  ")).toBe("fit");
    expect(webadres("a".repeat(40)).length).toBe(30);
  });
});

describe("winkelStappen", () => {
  const basis: MijnWinkel = { winkel: null, niveau: "verkoper", kan_betalen: false, commissie_procent: 5, commissie_min: 0.35,
    producten: [], verkopen: { aantal: 0, omzet: 0, commissie: 0 } };
  const winkel = { adres: "abc", naam: "Abc", omschrijving: "", kleur: "#000", verzendkosten: 0, gratis_vanaf: null, retour: "",
    open: false, volgers: 0, actie: "", winkeladres: "" };
  const product = { id: 1, titel: "Ticket", prijs: 10, actief: true, geblokkeerd: false, in_winkel: true, voorraad: null,
    betaalwijzen: ["app"], levering: ["ophalen"] };
  it("zet de stappen in vaste volgorde en wijst de eerste open stap aan", () => {
    const zonder = winkelStappen(basis);
    expect(zonder.map((s) => s.naam)).toEqual(["Winkel gemaakt", "Betalingen aan", "Product in je winkel", "Winkel open"]);
    expect(zonder.find((s) => !s.klaar)?.naam).toBe("Winkel gemaakt");
    expect(winkelStappen({ ...basis, winkel }).find((s) => !s.klaar)?.naam).toBe("Betalingen aan");
    expect(winkelStappen({ ...basis, winkel, kan_betalen: true }).find((s) => !s.klaar)?.naam).toBe("Product in je winkel");
    const klaar = winkelStappen({ ...basis, winkel: { ...winkel, open: true }, kan_betalen: true, producten: [product] });
    expect(klaar.every((s) => s.klaar)).toBe(true);
  });
});
