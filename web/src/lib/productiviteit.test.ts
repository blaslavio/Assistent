import { describe, expect, it } from "vitest";
import type { Gegevens, Taak } from "../api";
import {
  STANDAARD_REGELS, inboxTaken, leesRegels, schrijfRegel, maakDagplan, legFocusVast,
} from "./productiviteit";

const nu = () => new Date(2026, 10, 3, 8, 45, 0);
const taak = (id: number, extra: Partial<Taak> = {}): Taak => ({
  id, titel: "Taak " + id, klaar: false, ...extra,
});
const leeg = (): Gegevens => ({ volgend_id: 100, taken: [], afspraken: [], instellingen: {} });

describe("productiviteit - werkregels en inbox", () => {
  it("gebruikt veilige standaardregels voor oude of ongeldige voorkeuren", () => {
    const g = leeg();
    expect(leesRegels(g)).toEqual(STANDAARD_REGELS);
    g.instellingen!.productiviteit_regels_v1 = ["ongewenst"];
    expect(leesRegels(g)).toEqual(STANDAARD_REGELS);
  });

  it("bewaart alleen de gekozen regel zonder andere instellingen weg te schrijven", () => {
    const g = leeg();
    g.instellingen!.thema = "donker";
    schrijfRegel(g, "hoog", false);
    expect(leesRegels(g).hoog).toBe(false);
    expect(g.instellingen!.thema).toBe("donker");
    expect(() => schrijfRegel(g, "uitbetalen" as "hoog", true)).toThrow("Onbekende");
  });

  it("toont een taak slechts één keer met de dringendste reden", () => {
    const g = leeg();
    g.taken = [
      taak(1, { deadline: "2026-11-02", prioriteit: "hoog" }),
      taak(2, { deadline: "2026-11-03" }),
      taak(3, { prioriteit: "hoog" }),
      taak(4, { klaar: true, deadline: "2026-11-01" }),
    ];
    expect(inboxTaken(g, nu()).map(t => [t.id, t.reden])).toEqual([
      [1, "Deadline verstreken"], [2, "Vandaag"], [3, "Hoge prioriteit"],
    ]);
    schrijfRegel(g, "over_tijd", false);
    expect(inboxTaken(g, nu()).map(t => [t.id, t.reden])).toEqual([
      [2, "Vandaag"], [1, "Hoge prioriteit"], [3, "Hoge prioriteit"],
    ]);
  });

  it("maakt geen taken of alerts aan bij alleen het openen van de inbox", () => {
    const g = leeg();
    g.taken = [taak(1, { deadline: "2026-11-03" })];
    const voor = JSON.stringify(g);
    inboxTaken(g, nu());
    maakDagplan(g, nu());
    expect(JSON.stringify(g)).toBe(voor);
  });
});

describe("productiviteit - dagplanner", () => {
  it("respecteert bestaande afspraken en verdeelt voorstellen zonder overlap", () => {
    const g = leeg();
    g.taken = [taak(1, { prioriteit: "hoog" }), taak(2, { deadline: "2026-11-03" })];
    g.afspraken.push({ id: 1, titel: "Vergadering", start: "2026-11-03T09:00", einde: "2026-11-03T10:00" });
    const p = maakDagplan(g, nu());
    expect(p).toHaveLength(2);
    expect(p[0].van).toBe("2026-11-03T10:00");
    expect(p[0].tot).toBe("2026-11-03T10:45");
    expect(p[1].van).toBe("2026-11-03T10:45");
  });

  it("respecteert afspraken van gisteren die vandaag doorlopen", () => {
    const g = leeg();
    g.taken.push(taak(1, { prioriteit: "hoog" }));
    g.afspraken.push({ id: 1, titel: "Nachtdienst", start: "2026-11-02T22:00", einde: "2026-11-03T12:00" });
    expect(maakDagplan(g, nu())[0].van).toBe("2026-11-03T12:00");
  });

  it("houdt een hele dag vrij en plant niet na werktijd", () => {
    const g = leeg();
    g.taken.push(taak(1, { prioriteit: "hoog" }));
    g.afspraken.push({ id: 1, titel: "Vakantie", start: "2026-11-03", einde: "2026-11-04" });
    expect(maakDagplan(g, nu())).toEqual([]);
  });

  it("maakt geen dubbel focusblok voor een taak die al gepland is", () => {
    const g = leeg();
    g.taken.push(taak(1, { prioriteit: "hoog" }));
    const [p] = maakDagplan(g, nu());
    legFocusVast(g, p, nu());
    expect(g.afspraken).toHaveLength(1);
    expect((g.afspraken[0] as { taak_id?: number }).taak_id).toBe(1);
    expect(() => legFocusVast(g, p, nu())).toThrow("veranderd");
    expect(maakDagplan(g, nu())).toEqual([]);
  });

  it("weigert verouderde plannen na een afspraak of afgevinkte taak", () => {
    const g = leeg();
    g.taken.push(taak(1, { deadline: "2026-11-03" }));
    const [p] = maakDagplan(g, nu());
    g.afspraken.push({ id: 15, titel: "Bellen", start: p.van, einde: p.tot });
    expect(() => legFocusVast(g, p, nu())).toThrow("veranderd");
    expect(g.volgend_id).toBe(100);
    g.afspraken = [];
    g.taken[0].klaar = true;
    expect(() => legFocusVast(g, p, nu())).toThrow("veranderd");
  });

  it("bewaart niets als er geen relevant werk is of de dag voorbij is", () => {
    const g = leeg();
    g.taken.push(taak(1, { deadline: "2026-11-20" }));
    expect(maakDagplan(g, nu())).toEqual([]);
    g.taken[0].prioriteit = "hoog";
    expect(maakDagplan(g, new Date(2026, 10, 3, 18, 0))).toEqual([]);
  });
});
