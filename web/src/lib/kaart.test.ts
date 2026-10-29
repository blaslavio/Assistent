import { describe, expect, it } from "vitest";
import { afstand, afstandTekst, naarPixel, naarPunt, samenvoegen, type KaartWinkel } from "./kaart";

describe("kaart", () => {
  it("rekent heen en terug tussen plek en pixels", () => {
    const p = { lat: 52.0907, lon: 5.1214 };
    const q = naarPixel(p, 15);
    const terug = naarPunt(q.x, q.y, 15);
    expect(terug.lat).toBeCloseTo(p.lat, 6);
    expect(terug.lon).toBeCloseTo(p.lon, 6);
  });
  it("meet afstanden", () => {
    expect(afstand({ lat: 52.37, lon: 4.89 }, { lat: 52.09, lon: 5.12 })).toBeGreaterThan(34000);
    expect(afstandTekst(432)).toBe("430 m");
    expect(afstandTekst(1550)).toBe("1,6 km");
  });
  it("zet app-winkels voorop en laat dubbele winkels uit OpenStreetMap weg", () => {
    const w = (naam: string, lat: number, app: boolean): KaartWinkel => ({ naam, lat, lon: 5.12, soort: "", app });
    const l = samenvoegen([w("Bakkerij De Zon", 52.1, true)],
      [w("Bakkerij de Zon", 52.1005, false), w("Slager", 52.0901, false), w("Bakkerij De Zon", 52.2, false)], { lat: 52.09, lon: 5.12 });
    expect(l.map((x) => x.naam + (x.app ? "*" : ""))).toEqual(["Bakkerij De Zon*", "Slager", "Bakkerij De Zon"]);
  });
});
