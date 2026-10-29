import { describe, expect, it } from "vitest";
import { assistentContext, bronStatus, isAfgerond, nieuwFeit, oefenplanning, overdracht, PROJECT_SCOPE, projectActie, projectFeiten, toestemmingen, type Feit, type ProjectActie } from "./projectregie";
import type { Regel } from "./chat";

const FILE = "00000000-0000-4000-8000-000000000001";
const NU = Date.parse("2026-10-29T10:00:00Z");
const regel = (actie: ProjectActie, id = 1, afzender = 1, tijd = new Date(NU).toISOString()): Regel => ({ id, afzender, tijd, weg: false, bericht: actie });
const feit = (actie: ProjectActie, id = 1, afzender = 1): Feit => ({ actie, bericht: id, afzender, tijd: new Date(NU).toISOString() });
const toestemming = (wie: number, keuze: string, doel = FILE, leden = [1, 2], id = wie) => feit(nieuwFeit("toestemming", "Mijn keuze", { soort: "eigen" }, { keuze, doel, leden }), id, wie);

describe("herleidbare projectregie", () => {
  it("gebruikt de ondertekende berichtafzender, weigert vervalste velden en dedupliceert retries", () => {
    const actie = nieuwFeit("besluit", "We beginnen klein.", { soort: "bericht", id: 7 });
    const uit = projectFeiten([regel(actie, 10, 2), regel(actie, 11, 1)]);
    expect(uit).toHaveLength(1); expect(uit[0].afzender).toBe(2);
    expect(() => projectActie({ ...actie, afzender: 99 })).toThrow();
    expect(() => projectActie({ ...actie, sleutel: [actie.sleutel] })).toThrow();
  });
  it("geeft onleesbare, verwijderde en ongeldige berichten geen bewijsstatus", () => {
    const a = nieuwFeit("kennis", "Feit");
    expect(projectFeiten([{ ...regel(a), weg: true }, { ...regel(a, 2), fout: "kapot" }, regel({ ...a, versie: 2 } as unknown as ProjectActie, 3)])).toEqual([]);
  });
  it("controleert oorspronkelijke chatbronnen en gewijzigde tekstverwijzingen", () => {
    expect(bronStatus({ soort: "bericht", id: 7 }, [{ ...regel(nieuwFeit("kennis", "x"), 7), bericht: { t: "tekst", tekst: "Bron" } }], new Map())).toContain("Chatbericht 7");
    expect(bronStatus({ soort: "bericht", id: 7 }, [], new Map())).toContain("ontbreekt");
    expect(bronStatus({ soort: "bestand", id: FILE, citaat: "oud" }, [], new Map([[FILE, { inhoud: "nieuw" }]]))).toContain("gewijzigd");
  });
  it("laat alleen maker of toegewezen deelnemer een actie afronden", () => {
    const a = feit(nieuwFeit("actie", "Voorbereiden", { soort: "eigen" }, { verantwoordelijke: 2, minuten: 30 }));
    const klaar = nieuwFeit("afgerond", "Gereed", { soort: "eigen" }, { doel: a.actie.sleutel });
    expect(isAfgerond(a, [a, feit(klaar, 3, 3)])).toBe(false);
    expect(isAfgerond(a, [a, feit(klaar, 3, 2)])).toBe(true);
  });
  it("houdt oefenplanning lokaal, respecteert capaciteit en meldt niet-passende acties", () => {
    const f = [1, 2, 3].map(id => feit(nieuwFeit("actie", `Werk ${id}`, { soort: "eigen" }, { minuten: 45 }), id));
    const vooraf = JSON.stringify(f); const plan = oefenplanning(f, 60, [1, 2]);
    expect(plan.filter(p => p.wie !== undefined)).toHaveLength(2); expect(plan[2].wie).toBeUndefined(); expect(JSON.stringify(f)).toBe(vooraf);
    expect(() => oefenplanning(f, -1, [1])).toThrow();
  });
  it("exporteert feiten met de werkelijke bron en zonder bestandstekst", () => {
    const f = feit(nieuwFeit("besluit", "Kies optie A", { soort: "bericht", id: 7 }), 20);
    const uit = overdracht([f], new Map([[1, "Alice"]]), [{ titel: "werk.md", wacht: true }]);
    expect(uit).toContain("chatbericht 7"); expect(uit).toContain("projectbericht 20"); expect(uit).toContain("nog niet bevestigd");
  });
});

describe("projecttoestemming is afwezig tot iedereen actueel akkoord is", () => {
  it("vereist iedereen, ondersteunt titel-only en respecteert intrekken", () => {
    expect(toestemmingen([], FILE, [1, 2], NU).tekst).toBe(false);
    const f = [toestemming(1, "tekst"), toestemming(2, "titel")];
    expect(toestemmingen(f, FILE, [1, 2], NU)).toEqual({ titel: true, tekst: false });
    f.push(toestemming(2, "geen", FILE, [1, 2], 3));
    expect(toestemmingen(f, FILE, [1, 2], NU).titel).toBe(false);
  });
  it("vervalt na 24 uur of bij een andere deelnemerssamenstelling", () => {
    const f = [toestemming(1, "tekst"), toestemming(2, "tekst")];
    expect(toestemmingen(f, FILE, [1, 2], NU).tekst).toBe(true);
    expect(toestemmingen(f, FILE, [1, 2], NU + 24 * 3600_000).tekst).toBe(false);
    expect(toestemmingen(f, FILE, [1, 2, 3], NU).tekst).toBe(false);
    expect(toestemmingen(f, FILE, [1], NU).tekst).toBe(false);
  });
  it("deelt bij titeltoestemming geen inhoud en voegt geen ongevraagde context toe", () => {
    const f = [toestemming(1, "titel"), toestemming(2, "tekst")];
    const uit = assistentContext(f, [{ id: FILE, titel: "werk.md", inhoud: "GEHEIME INHOUD" }], [1, 2], false, NU);
    expect(uit).toContain("werk.md"); expect(uit).not.toContain("GEHEIME INHOUD");
  });
  it("vraagt ook toestemming van voormalige bronbijdragers", () => {
    const f = [toestemming(1, "tekst")];
    expect(() => assistentContext(f, [{ id: FILE, titel: "werk.md", inhoud: "bron", auteurs: [2] }], [1], false, NU)).toThrow();
  });
  it("vraagt apart toestemming voor projectkennis en begrenst het voorbeeld", () => {
    const kennis = feit(nieuwFeit("kennis", "Projectdoel"), 3);
    expect(() => assistentContext([kennis], [], [1, 2], true, NU)).toThrow();
    const f = [kennis, toestemming(1, "tekst", PROJECT_SCOPE), toestemming(2, "tekst", PROJECT_SCOPE)];
    expect(assistentContext(f, [], [1, 2], true, NU)).toContain("Projectdoel");
    expect(() => assistentContext([], [], [1, 2], false, NU)).toThrow();
  });
  it("kan niet namens een andere deelnemer toestemming geven", () => {
    const a = nieuwFeit("toestemming", "Tekst akkoord", { soort: "eigen" }, { doel: FILE, keuze: "tekst", leden: [2] });
    expect(projectFeiten([regel(a, 1, 1)])).toEqual([]);
  });
});

it("blokkeert onbekende archiefherkomst ook wanneer de huidige deelnemers toestemming geven", () => {
  const f = [toestemming(1, "tekst"), toestemming(2, "tekst")];
  expect(() => assistentContext(f, [{ id: FILE, titel: "herstel.md", inhoud: "oud werk", onbekendeHerkomst: true }], [1, 2], false, NU)).toThrow("bronbijdragers");
});
it("vereist ook toestemming van oorspronkelijke archiefbijdragers buiten het huidige gesprek", () => {
  const f = [toestemming(1, "tekst", FILE, [1, 2]), toestemming(2, "tekst", FILE, [1, 2])];
  expect(() => assistentContext(f, [{ id: FILE, titel: "herstel.md", inhoud: "oud werk", auteurs: [3] }], [1, 2], false, NU)).toThrow("toestemming");
});
it("laat korte toestemming echt aflopen en weigert ongeoorloofde looptijden",()=>{
 const f=[1,2].map(wie=>feit(nieuwFeit("toestemming","15 minuten",{soort:"eigen"},{doel:FILE,keuze:"tekst",leden:[1,2],geldigMinuten:15}),wie,wie));
 expect(toestemmingen(f,FILE,[1,2],NU+14*60000).tekst).toBe(true);
 expect(toestemmingen(f,FILE,[1,2],NU+15*60000).tekst).toBe(false);
 expect(()=>nieuwFeit("toestemming","Te lang",{soort:"eigen"},{doel:FILE,keuze:"tekst",leden:[1,2],geldigMinuten:9999})).toThrow();
});
