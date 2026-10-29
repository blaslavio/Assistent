import { describe, expect, it } from "vitest";
import { beste, botst, ics, metZone, vrijeMomenten, wachtOpMij, type Peiling } from "./prikken";

const nu = new Date("2026-10-29T10:00");

describe("datum prikken", () => {
  it("zoekt per dag één vrij moment in het dagdeel, om afspraken heen", () => {
    const bezet = [{ start: "2026-10-29T18:00", einde: "2026-10-29T21:00" }, { start: "2026-10-30T18:00", einde: "2026-10-30T19:00" },
      { start: "2026-10-31" }];
    expect(vrijeMomenten(bezet, 120, "avond", nu, 14, 3)).toEqual(["2026-10-30T19:00", "2026-10-31T18:00", "2026-11-01T18:00"]);
    expect(vrijeMomenten([], 60, "ochtend", nu, 1, 5)).toEqual(["2026-10-30T09:00"]);
  });

  it("laat zien wat er in je agenda botst", () => {
    const a = [{ id: 1, titel: "Tandarts", start: "2026-11-02T19:30", einde: "2026-11-02T20:00" },
      { id: 2, titel: "Verjaardag", start: "2026-11-02", soort: "verjaardag" }, { id: 3, titel: "Vrij", start: "2026-11-03" }];
    expect(botst(a, "2026-11-02T18:00", 120).map((x) => x.titel)).toEqual(["Tandarts"]);
    expect(botst(a, "2026-11-03T18:00", 60).map((x) => x.titel)).toEqual(["Vrij"]);
    expect(botst(a, "2026-11-02T20:00", 60)).toEqual([]);
  });

  it("kiest het moment met de meeste ja's, en weet wanneer jij nog moet stemmen", () => {
    const opties = [{ id: 1, start: "a", ja: 1, misschien: 2 }, { id: 2, start: "b", ja: 2, misschien: 0 }];
    expect(beste(opties)?.id).toBe(2);
    expect(beste([{ id: 1, start: "a", ja: 0, misschien: 0 }])).toBeNull();
    const p = { open: true, van_mij: false, stemmen: [] } as unknown as Peiling;
    expect(wachtOpMij(p)).toBe(true);
    expect(wachtOpMij({ ...p, stemmen: [{ naam: "Bram", stemmen: {}, ik: true }] })).toBe(false);
  });

  it("geeft de tijdzone mee en maakt een agendabestand", () => {
    expect(metZone("2026-11-02T19:00")).toMatch(/^2026-11-02T19:00:00[+-]\d{2}:\d{2}$/);
    const t = ics("Etentje; met Bram", "2026-11-02T18:00:00Z", 90, "Utrecht");
    expect(t).toContain("DTSTART:20261102T180000Z");
    expect(t).toContain("DTEND:20261102T193000Z");
    expect(t).toContain("SUMMARY:Etentje\\; met Bram");
  });
});
