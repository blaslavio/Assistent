import { describe, expect, it } from "vitest";
import voorbeeld from "./beleggen.voorbeeld.json";
import { portefeuille, type Koers, type Positie } from "./beleggen";

describe("beleggen", () => {
  it("rekent de portefeuille uit zoals de vorige app", () => {
    const k = voorbeeld.koersen as unknown as Record<string, Koers | null>;
    const p = portefeuille(voorbeeld.posities as Positie[], k, k);
    const { uitleg: _u, ...verwacht } = voorbeeld.verwacht as Record<string, unknown>;
    expect(JSON.parse(JSON.stringify(p))).toEqual(JSON.parse(JSON.stringify(verwacht)));
  });
});
