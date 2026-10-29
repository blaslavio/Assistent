import { describe, expect, it } from "vitest";
import { omschrijving, verrekenen } from "./huishouden";

describe("huishouden", () => {
  it("verrekent met zo min mogelijk overboekingen", () => {
    const s = verrekenen([{ id: 1, naam: "Sanne", saldo: 30 }, { id: 2, naam: "Bram", saldo: -20 }, { id: 3, naam: "Lotte", saldo: -10 }]);
    expect(s.map((x) => `${x.van.naam}>${x.naar.naam}:${x.bedrag}`)).toEqual(["Bram>Sanne:20", "Lotte>Sanne:10"]);
    expect(verrekenen([{ id: 1, naam: "A", saldo: 0 }])).toEqual([]);
  });
  it("beschrijft halen en brengen kort", () => {
    expect(omschrijving({ soort: "halen", voor: "Noor", titel: "school" })).toBe("Halen Noor (school)");
    expect(omschrijving({ soort: "afspraak", voor: "Noor", titel: "Tandarts" })).toBe("Tandarts Noor");
  });
});
