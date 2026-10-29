import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { dagInZin, weekBeeld } from "./week";

const nu = new Date(2026, 9, 29, 9); // donderdag
const g = {
  volgend_id: 10,
  afspraken: [
    { id: 1, titel: "Werk", start: "2026-10-30T09:00", einde: "2026-10-30T17:00" },
    { id: 2, titel: "Etentje", start: "2026-10-30T19:00" },
    { id: 3, titel: "Bram jarig", start: "2026-11-01", soort: "verjaardag" },
    { id: 4, titel: "Sport", start: "2026-10-29T18:00", einde: "2026-10-29T19:30" },
  ],
  taken: [
    { id: 5, titel: "Belasting", klaar: false, prioriteit: "hoog" },
    { id: 6, titel: "Bellen", klaar: false, deadline: "2026-10-31" },
    { id: 7, titel: "Klaar", klaar: true, klaar_op: "2026-10-28T10:00" },
    { id: 8, titel: "Oud", klaar: true, klaar_op: "2026-10-01T10:00" },
  ],
} as unknown as Gegevens;

describe("week", () => {
  it("telt per dag hoe vol hij is", () => {
    const w = weekBeeld(g, nu);
    expect(w.dagen).toHaveLength(7);
    expect(w.dagen[0]).toMatchObject({ naam: "Vandaag", minuten: 90, afspraken: 1 });
    expect(w.dagen[1]).toMatchObject({ minuten: 540, afspraken: 2 });
    expect(w.dagen[2].taken).toBe(1);
    expect(w.vol?.datum).toBe("2026-10-30");
  });
  it("kiest een rustige dag en een taak die daar past", () => {
    const w = weekBeeld(g, nu);
    expect(w.rustig?.datum).toBe("2026-11-01");
    expect(w.voorstel?.titel).toBe("Belasting");
    expect(w.klaar).toBe(1);
  });
  it("noemt dagen gewoon", () => {
    expect(dagInZin("2026-10-30", nu)).toBe("morgen");
    expect(dagInZin("2026-11-02", nu)).toBe("maandag");
  });
});
