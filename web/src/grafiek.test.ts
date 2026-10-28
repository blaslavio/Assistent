import { describe, expect, it } from "vitest";
import { stappen, waarde } from "./grafiek";
import { klopt, uitgavenOverzicht } from "./lib/assistent";

describe("grafiek", () => {
  it("maakt ronde stappen vanaf nul", () => {
    expect(stappen(0, 870)).toEqual([0, 250, 500, 750, 1000]);
    expect(stappen(-40, 100)).toEqual([-50, 0, 50, 100]);
    expect(stappen(0, 0)).toEqual([0, 0.25, 0.5, 0.75, 1]);
  });
  it("schrijft bedragen kort voor de as", () => {
    expect(waarde(1500, "euro", true)).toBe("€1,5k");
    expect(waarde(12.5, "procent")).toBe("12,5%");
  });
  it("controleert de invoer", () => {
    const goed = { titel: "Per maand", soort: "staaf", labels: ["jan", "feb"], reeksen: [{ naam: "Uit", waarden: [10, 20] }] };
    expect(klopt("grafiek_tonen", goed)).toBe(true);
    expect(klopt("grafiek_tonen", { ...goed, reeksen: [{ naam: "Uit", waarden: [10] }] })).toBe(false);
    expect(klopt("grafiek_tonen", { ...goed, soort: "taart" })).toBe(false);
    expect(klopt("grafiek_tonen", { ...goed, reeksen: [1, 2, 3, 4].map(() => goed.reeksen[0]) })).toBe(false);
  });
});

describe("uitgaven", () => {
  it("telt per maand, categorie en ontvanger", () => {
    const o = uitgavenOverzicht([
      { datum: "2026-09-02", bedrag: "-12.50", tegenpartij: "Albert Heijn", omschrijving: "", categorie: "Boodschappen" },
      { datum: "2026-09-20", bedrag: -7.5, tegenpartij: "Albert Heijn", omschrijving: "", categorie: "Boodschappen" },
      { datum: "2026-10-01", bedrag: 2000, tegenpartij: "Werk", omschrijving: "salaris", categorie: "Inkomen" },
      { datum: "2026-10-03", bedrag: -650, tegenpartij: "Verhuurder", omschrijving: "", categorie: "" },
    ]);
    expect(o.totaal_in).toBe(2000);
    expect(o.totaal_uit).toBe(670);
    expect(o.per_maand).toEqual([{ maand: "2026-09", in: 0, uit: 20 }, { maand: "2026-10", in: 2000, uit: 650 }]);
    expect(o.uit_per_categorie).toEqual([{ naam: "Overig", bedrag: 650 }, { naam: "Boodschappen", bedrag: 20 }]);
    expect(o.grootste_ontvangers[1]).toEqual({ naam: "Albert Heijn", bedrag: 20 });
    expect(o.regels).toHaveLength(4);
  });
});
