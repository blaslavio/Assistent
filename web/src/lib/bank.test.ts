import { describe, expect, it } from "vitest";
import { alIngelezen, bankSleutel, ophalenNodig, type Koppeling } from "./bank";

const r = { datum: "2026-10-01", bedrag: -12.5, tegenpartij: "Albert Heijn", omschrijving: "Boodschappen", rekening: "NL01BANK0123", referentie: "" };

describe("bank", () => {
  it("maakt dezelfde sleutels als de vorige app, zodat niets dubbel binnenkomt", async () => {
    expect(await bankSleutel(r)).toBe("bank:0b46f770e7c72a91a5d400fcdd8dc28c");
    expect(await bankSleutel({ ...r, referentie: "REF123" })).toBe("bank:ed63d64959f6eab6cb8860c1fa3b7a18");
  });
  it("slaat regels over die al uit een afschrift kwamen", () => {
    const bestaand = [{ datum: "2026-10-01", bedrag: -12.5, bron: "import", tegenpartij: "ALBERT HEIJN 1234", omschrijving: "" }];
    expect(alIngelezen(r, bestaand)).toBe(true);
    expect(alIngelezen({ ...r, bedrag: -13 }, bestaand)).toBe(false);
    expect(alIngelezen(r, [{ ...bestaand[0], bron: "hand" }])).toBe(false);
  });
  it("haalt elke zes uur op, alleen bij een actieve koppeling", () => {
    const k: Koppeling = { id: 1, bank: "ING", status: "actief", rekeningen: [], geldig_tot: null, fout: "",
      laatst_opgehaald: "2026-10-29T06:00:00Z" };
    const nu = new Date("2026-10-29T13:00:00Z").getTime();
    expect(ophalenNodig(k, nu)).toBe(true);
    expect(ophalenNodig({ ...k, laatst_opgehaald: "2026-10-29T10:00:00Z" }, nu)).toBe(false);
    expect(ophalenNodig({ ...k, status: "verlopen", laatst_opgehaald: null }, nu)).toBe(false);
  });
});
