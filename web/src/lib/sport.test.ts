import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { dagwaarden, dezeWeek, doelMaken, gepland, plannen, sportNl, vastleggen, verwerken, voortgang, zonderResultaat } from "./sport";
import { csvLezen, csvMoment, duurMinuten, fitLezen, xmlLezen } from "./sportbestand";

const leeg = (): Gegevens => ({ taken: [], afspraken: [], volgend_id: 1, instellingen: {} });
const nu = new Date("2026-10-29T20:00");

describe("sport", () => {
  it("plant elke week en telt mee voor doel en beweegnorm", () => {
    const g = leeg();
    plannen(g, "Hardlopen", "2026-10-26T19:00", 45, 2, "Park");
    expect(g.afspraken.map((a) => a.start)).toEqual(["2026-10-26T19:00", "2026-11-02T19:00"]);
    expect(g.afspraken[0]).toMatchObject({ titel: "Hardlopen", sport: "hardlopen", soort: "sport", einde: "2026-10-26T19:45" });
    vastleggen(g, g.afspraken[0].id, { minuten: 50, afstand_km: 8.2, gevoel: 4 });
    const d = doelMaken(g, { omschrijving: "3x per week", sport: "hardlopen", maatstaf: "keer_per_week", doelwaarde: 3, deadline: "" });
    expect(voortgang(g, d, nu)).toMatchObject({ huidig: 1, procent: 33, tekst: "1 van 3 keer deze week" });
    expect(dezeWeek(g, nu)).toEqual({ aantal: 1, minuten: 50, km: 8.2 });
  });

  it("vraagt alleen naar trainingen van vandaag die voorbij zijn", () => {
    const g = leeg();
    plannen(g, "yoga", "2026-10-29T18:00", 60);
    plannen(g, "yoga", "2026-10-29T21:00", 60);
    expect(zonderResultaat(g, nu).map((a) => a.start)).toEqual(["2026-10-29T18:00"]);
    expect(gepland(g, [], 14, nu).map((t) => t.start)).toEqual(["2026-10-29T21:00"]);
  });

  it("zet trainingen uit een app bij de geplande training of als nieuwe, en nooit dubbel", () => {
    const g = leeg();
    plannen(g, "fietsen", "2026-10-28T09:00", 60);
    const binnen = [{ id: "strava:1", start: "2026-10-28T09:40", sport: "Ride", minuten: 75, afstand_km: 31.26 },
      { id: "strava:2", start: "2026-10-27T07:00", sport: "Run", minuten: 30, afstand_km: 5 }];
    expect(verwerken(g, binnen, [{ datum: "2026-10-28", stappen: 9000 }], "Strava", nu)).toBe(2);
    expect(verwerken(g, binnen, [], "Strava", nu)).toBe(0);
    expect(g.afspraken).toHaveLength(2);
    expect(g.afspraken[0]).toMatchObject({ extern_id: "strava:1", sport_resultaat: { minuten: 75, afstand_km: 31.3, bron: "Strava" } });
    expect(g.afspraken[1]).toMatchObject({ titel: "Hardlopen", sport: "hardlopen", start: "2026-10-27T07:00" });
    expect(dagwaarden(g)).toEqual([{ datum: "2026-10-28", stappen: 9000, bron: "Strava" }]);
  });

  it("vertaalt sportnamen uit andere apps", () => {
    expect(sportNl("TrailRun")).toBe("hardlopen");
    expect(sportNl("WeightTraining")).toBe("krachttraining");
    expect(sportNl("padel")).toBe("padel");
  });
});

describe("sportbestanden", () => {
  it("leest GPX met tijd en afstand", () => {
    const gpx = `<?xml version="1.0"?><gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><name>Ochtendloop</name><type>running</type>
      <trkseg><trkpt lat="52.0" lon="5.0"><time>2026-10-28T06:00:00Z</time></trkpt>
      <trkpt lat="52.01" lon="5.0"><time>2026-10-28T06:06:00Z</time></trkpt></trkseg></trk></gpx>`;
    const [t] = xmlLezen(gpx, "x");
    expect(t).toMatchObject({ naam: "Ochtendloop", sport: "running", minuten: 6, afstand_km: 1.1 });
    expect(() => xmlLezen('<!DOCTYPE x [<!ENTITY a "b">]><gpx/>', "x")).toThrow();
  });

  it("leest CSV met Nederlandse en Engelse kolommen", () => {
    const t = csvLezen("Activity Date;Activity Type;Elapsed Time;Distance\n2026-10-20 07:30;Run;1:02:30;10,5\nfout;x;1;1", "c");
    expect(t).toEqual([{ id: "bestand:c:0", naam: "", start: "2026-10-20T07:30", sport: "Run", minuten: 63, afstand_km: 10.5 }]);
    expect(duurMinuten("3600")).toBe(60);
    expect(csvMoment("20-10-2026 7:05")).toBe("2026-10-20T07:05");
  });

  it("leest de sessie uit een FIT-bestand", () => {
    // Kleinste geldige FIT: kop, definitie van "session" (18) en één databericht.
    const velden: [number, number, number][] = [[2, 4, 1162000000], [5, 1, 1], [7, 4, 1_800_000], [8, 4, 1_700_000], [9, 4, 512_345], [11, 2, 420]];
    const def = [0x40, 0, 0, 18, 0, velden.length, ...velden.flatMap(([nr, n]) => [nr, n, n === 1 ? 0 : n === 2 ? 0x84 : 0x86])];
    const data = [0x00, ...velden.flatMap(([, n, w]) => [...Array(n)].map((_, i) => (w >>> (8 * i)) & 0xff))];
    const lijf = [...def, ...data];
    const buf = new Uint8Array(14 + lijf.length + 2);
    const v = new DataView(buf.buffer);
    v.setUint8(0, 14); v.setUint8(1, 0x20); v.setUint32(4, lijf.length, true);
    buf.set([...".FIT"].map((c) => c.charCodeAt(0)), 8);
    buf.set(lijf, 14);
    const [t] = fitLezen(buf.buffer, "f");
    expect(t).toMatchObject({ sport: "hardlopen", minuten: 28, afstand_km: 5.1, calorieen: 420 });
    expect(t.start).toBe(`${new Date(Date.UTC(1989, 11, 31) + 1162000000 * 1000).getFullYear()}${t.start.slice(4)}`);
  });
});
