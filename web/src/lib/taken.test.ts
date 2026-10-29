import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { afvinkenIn, sorteer, volgendeDatum } from "./taken";

describe("taken", () => {
  it("rekent de volgende datum uit, altijd na vandaag", () => {
    expect(volgendeDatum("2026-10-29", "dag", "2026-10-29")).toBe("2026-10-30");
    expect(volgendeDatum("2026-10-20", "week", "2026-10-29")).toBe("2026-11-03");
    expect(volgendeDatum("2026-01-31", "maand", "2026-01-31")).toBe("2026-02-28");
    expect(volgendeDatum("2026-11-05", "week", "2026-10-29")).toBe("2026-11-12");
  });
  it("zet een terugkerende taak opnieuw klaar", () => {
    const g = { taken: [{ id: 1, titel: "Vuilnis", deadline: "2026-10-29", klaar: false, herhaal: "week" }],
      afspraken: [{ id: 2, titel: "Focus", start: "2026-10-30T10:00", taak_id: 1 }], volgend_id: 3 } as unknown as Gegevens;
    const nieuw = afvinkenIn(g, 1, new Date(2026, 9, 29, 9));
    expect(g.taken[0].klaar).toBe(true);
    expect(nieuw).toMatchObject({ id: 3, deadline: "2026-11-05", klaar: false, herhaal: "week" });
    expect(g.afspraken).toHaveLength(0);
    expect(afvinkenIn(g, 1)).toBeNull();
  });
  it("zet belangrijk eerst", () => {
    const l = [{ id: 1, titel: "a", klaar: false, deadline: "2026-10-01" }, { id: 2, titel: "b", klaar: false, prioriteit: "hoog" }];
    expect(l.sort(sorteer).map((t) => t.id)).toEqual([2, 1]);
  });
});
