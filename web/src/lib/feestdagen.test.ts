import { describe, expect, it } from "vitest";
import { brugdagen, eerstvolgende, feestdagen, kalender, pasen } from "./feestdagen";
import { datumTekst } from "./tijd";

describe("feestdagen", () => {
  it("rekent Pasen goed uit", () => {
    expect(datumTekst(pasen(2026))).toBe("2026-04-05");
    expect(datumTekst(pasen(2027))).toBe("2027-03-28");
    expect(datumTekst(pasen(2028))).toBe("2028-04-16");
  });
  it("kent de Nederlandse en Belgische feestdagen", () => {
    const nl = feestdagen(2027, "NL", false);
    expect(nl.find((d) => d.naam === "Koningsdag")?.datum).toBe("2027-04-27");
    expect(nl.find((d) => d.naam === "Hemelvaartsdag")?.datum).toBe("2027-05-06");
    expect(feestdagen(2027, "BE").find((d) => d.naam === "Nationale feestdag")?.datum).toBe("2027-07-21");
    // Koningsdag op zondag schuift naar zaterdag.
    expect(feestdagen(2025, "NL").find((d) => d.naam === "Koningsdag")?.datum).toBe("2025-04-26");
    expect(feestdagen(2027, "", true)).toEqual([]);
  });
  it("vindt de brugdag na Hemelvaart", () => {
    const vrij = new Set(feestdagen(2027, "NL").filter((d) => d.vrij).map((d) => d.datum));
    const b = brugdagen(vrij, 2027).find((d) => d.datum === "2027-05-07");
    expect(b?.naam).toBe("Brugdag: 1 dag vrij, 4 dagen weg");
  });
  it("zet schoolvakanties per regio op elke dag", () => {
    const k = kalender({ land: "NL", extra: false, regio: "zuid" }, "2027-02-10", "2027-02-25");
    expect(k.get("2027-02-15")?.[0].naam).toBe("Voorjaarsvakantie");
    expect(k.has("2027-02-23")).toBe(false);
  });
  it("noemt de eerstvolgende", () => {
    const e = eerstvolgende({ land: "NL", extra: true, regio: "" }, new Date("2026-11-30T09:00"));
    expect(e?.naam).toBe("Sinterklaasavond");
    expect(e?.over).toBe(5);
  });
});
