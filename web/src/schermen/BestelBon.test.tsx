import { describe, expect, it } from "vitest";
import { plekVan, voortgang } from "./BestelBon";

describe("BestelBon", () => {
  it("vindt de winkel alleen bij precies één passende vestiging", () => {
    const w = { verkoper: "Roma", naam: "Pizzeria Roma", lat: 50.8, lon: 5.7, winkeladres: "Markt 1" };
    expect(plekVan([w], "Roma")).toEqual({ naam: "Pizzeria Roma", winkeladres: "Markt 1", lat: 50.8, lon: 5.7 });
    expect(plekVan([w, { ...w, naam: "Tweede" }], "Roma")).toBeNull();
    expect(plekVan([{ ...w, lat: null }], "Roma")).toBeNull();
    expect(plekVan([w], "Iemand anders")).toBeNull();
  });
  it("laat de voortgang meelopen met de status", () => {
    expect(voortgang("aangevraagd")).toBeCloseTo(0.2);
    expect(voortgang("betaald")).toBeCloseTo(0.6);
    expect(voortgang("afgerond")).toBe(1);
    expect(voortgang("geannuleerd")).toBe(1);
  });
});
