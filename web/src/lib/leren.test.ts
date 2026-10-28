import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { herhalingen, oefenen, reeks, starten, voortgang } from "./leren";

const leeg = (): Gegevens => ({ taken: [], afspraken: [], volgend_id: 1, instellingen: {} });
const op = (s: string) => new Date(`${s}T12:00`);

describe("leren", () => {
  it("start een leerdoel met genummerde stappen", () => {
    const g = leeg();
    const d = starten(g, "Spaans", ["Getallen", "", "Dagen"], "Op vakantie bestellen");
    expect(d.stappen.map((s) => [s.nummer, s.titel])).toEqual([[1, "Getallen"], [2, "Dagen"]]);
    expect(g.volgend_id).toBe(2);
  });

  it("plant herhalen later naarmate je het beter kent", () => {
    const g = leeg();
    const d = starten(g, "Spaans", ["Getallen", "Dagen"]);
    oefenen(g, d.id, 1, 1, op("2026-10-28"));
    oefenen(g, d.id, 2, 5, op("2026-10-28"));
    expect(d.stappen[0].herhalen_op).toBe("2026-10-29");
    expect(d.stappen[1].herhalen_op).toBe("2026-11-11");
    expect(herhalingen(g, op("2026-10-29")).map((h) => h.stap.titel)).toEqual(["Getallen"]);
    expect(voortgang(d)).toBe(50);
  });

  it("telt een reeks van dagen waarop het dagdoel gehaald is", () => {
    const g = leeg();
    g.leerdagen = { "2026-10-25": 5, "2026-10-26": 6, "2026-10-27": 5, "2026-10-28": 2 };
    const r = reeks(g, op("2026-10-28"));
    expect(r).toMatchObject({ reeks: 3, beste: 3, vandaag: 2, gehaald: false });
    expect(r.week).toEqual([false, false, false, true, true, true, false]);
  });
});
