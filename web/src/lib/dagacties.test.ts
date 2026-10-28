import { describe, expect, it } from "vitest";
import type { Gegevens } from "../api";
import { gelijk, taakVoorstel, taakUitvoeren, taakResultaat } from "./dagacties";

const leeg = (): Gegevens => ({ taken: [], afspraken: [], volgend_id: 1 });

describe("dagelijkse taakopdrachten", () => {
  it("bereidt voor zonder te schrijven en houdt een onafhankelijk voorbeeld", () => {
    const g = leeg();
    const actie = taakVoorstel("  Voorbereiden  ", g.taken, "test-0001");
    expect(g.taken).toEqual([]);
    expect(actie.soort).toBe("toevoegen");
    taakUitvoeren(g, actie);
    expect(taakResultaat(g, actie).titel).toBe("Voorbereiden");
  });

  it("maakt na een verloren antwoord bij dezelfde retry geen tweede taak", () => {
    const g = leeg(); const actie = taakVoorstel("Overleg", g.taken, "test-0001");
    taakUitvoeren(g, actie); taakUitvoeren(g, actie);
    expect(g.taken).toHaveLength(1); expect(g.volgend_id).toBe(2);
  });

  it("weigert een verouderd voorbeeld zonder gegevens te veranderen", () => {
    const g = leeg(); const actie = taakVoorstel("Overleg", g.taken, "test-0001");
    g.taken.push({ id: 1, titel: "Elders toegevoegd", klaar: false });
    const vooraf = structuredClone(g);
    expect(() => taakUitvoeren(g, actie)).toThrow("takenlijst is intussen gewijzigd");
    expect(g).toEqual(vooraf);
  });

  it("rondt alleen de gecontroleerde taak af en bewaart de agenda", () => {
    const taak = { id: 1, titel: "Afronden", klaar: false };
    const g = { ...leeg(), taken: [structuredClone(taak)], afspraken: [{ id: 2, titel: "Focus", start: "2030-01-01T10:00", taak_id: 1 }] };
    const afspraken = structuredClone(g.afspraken);
    taakUitvoeren(g, { soort: "afronden", taak });
    taakUitvoeren(g, { soort: "afronden", taak });
    expect(g.taken[0].klaar).toBe(true); expect(g.afspraken).toEqual(afspraken);
  });

  it("weigert een verdwenen of gewijzigde taak bij afronden", () => {
    const taak = { id: 1, titel: "Oud", klaar: false };
    const g = leeg();
    expect(() => taakUitvoeren(g, { soort: "afronden", taak })).toThrow("verwijderd");
    g.taken.push({ ...taak, titel: "Nieuw" });
    expect(() => taakUitvoeren(g, { soort: "afronden", taak })).toThrow("gewijzigd");
    expect(g.taken[0].klaar).toBe(false);
  });

  it("voorkomt ID-botsingen en onveilige nummers", () => {
    const g = { ...leeg(), afspraken: [{ id: 8, titel: "Afspraak", start: "2030-01-01" }] };
    taakUitvoeren(g, taakVoorstel("Taak", g.taken, "test-0001"));
    expect(g.taken[0].id).toBe(9);
    g.volgend_id = Number.MAX_SAFE_INTEGER;
    expect(() => taakUitvoeren(g, taakVoorstel("Volgende", g.taken, "test-0002"))).toThrow("taaknummer");
  });

  it("weigert ongeldige titels en houdt resultaatcontrole strikt", () => {
    for (const t of ["", "a\u0000b", "\ud800", "x".repeat(161)]) expect(() => taakVoorstel(t, [])).toThrow();
    const g = leeg();
    expect(() => taakResultaat(g, taakVoorstel("Onbewaard", []))).toThrow("niet worden bevestigd");
    expect(gelijk({ a: 1, b: [2, 3] }, { b: [2, 3], a: 1 })).toBe(true);
  });
});
