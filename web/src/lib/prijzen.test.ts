import { describe, expect, it } from "vitest";
import { besteProduct, perEenheid, productVergelijken, vergelijken, winkelsUit } from "./prijzen";

const winkels = winkelsUit([
  { n: "ah", c: "AH", u: "https://ah/", d: [{ n: "AH Halfvolle melk", p: 1.29, s: "1 l", l: "m" }, { n: "AH Scharreleieren", p: 2.99, s: "10 stuks", l: "e" },
    { n: "AH Melkchocolade reep", p: 1.5, s: "100 g" }, { n: "AH Roomboter", p: 3.49, s: "250 g" }] },
  { n: "jumbo", c: "Jumbo", u: "https://jumbo/", d: [{ n: "Jumbo Halfvolle melk", p: 1.15, s: "1 l" }, { n: "Jumbo Eieren", p: 2.49, s: "10 stuks" }] },
  { n: "aldi", c: "ALDI", d: [] },
]);

describe("prijzen", () => {
  it("laat lege winkels weg en geeft nette namen", () => {
    expect(winkels.map((w) => w.naam)).toEqual(["Albert Heijn", "Jumbo"]);
  });
  it("vindt het best passende product", () => {
    expect(besteProduct(winkels[0], "melk")?.naam).toBe("AH Halfvolle melk");
    expect(besteProduct(winkels[0], "eieren")?.link).toBe("https://ah/e");
    expect(besteProduct(winkels[1], "roomboter")).toBeNull();
  });
  it("rekent het totaal per winkel uit, met schatting voor wat mist", () => {
    const v = vergelijken(winkels, ["melk", "eieren", "roomboter"]);
    expect(v[0].naam).toBe("Albert Heijn");
    expect(v[0].totaal).toBe(7.77);
    expect(v[1]).toMatchObject({ naam: "Jumbo", gevonden: 2, totaal: 7.13 });
  });
  it("rekent per kilo of liter", () => {
    expect(perEenheid("250 g", 3.49)).toEqual({ prijs: 13.96, eenheid: "kg" });
    expect(perEenheid("2 x 0,5 l", 2)).toEqual({ prijs: 2, eenheid: "l" });
    expect(productVergelijken(winkels, "melk").map((r) => r.winkel)).toEqual(["Jumbo", "Albert Heijn"]);
  });
});
