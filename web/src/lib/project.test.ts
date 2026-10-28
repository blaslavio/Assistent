import { describe, expect, it, vi } from "vitest";
import { bestandDelen, bestandMaken, leesProjectbericht, werkruimte, Werkbestand, type ProjectBericht } from "./project";

const identiteit = vi.hoisted(() => ({ sessie: { naam: "alice", token: "test-only" } }));
vi.mock("../api", () => ({ huidigeSessie: () => identiteit.sessie }));
vi.mock("./chat", () => ({ versturen: vi.fn().mockResolvedValue({ id: 1 }) }));

const ID = "00000000-0000-4000-8000-000000000001";
const nieuw = () => new Werkbestand(ID, "projectplan.md");
async function pakket(b: Werkbestand) {
  let update!: ProjectBericht;
  await b.verstuur(async bericht => { update = bericht; });
  return update;
}

describe("gelijktijdig samenwerken met CRDT", () => {
  it("voegt twee gelijktijdige wijzigingen samen zonder overschrijven", async () => {
    const a = nieuw(), b = nieuw();
    a.bewerk("Project"); b.ontvang(await pakket(a));
    a.bewerk("Mijn Project"); b.bewerk("Project klaar");
    const vanA = await pakket(a), vanB = await pakket(b);
    a.ontvang(vanB); b.ontvang(vanA);
    expect(a.inhoud).toBe("Mijn Project klaar"); expect(b.inhoud).toBe(a.inhoud);
    a.doc.destroy(); b.doc.destroy();
  });

  it("blijft gelijk bij omgekeerde ontvangstvolgorde en dubbele pakketten", async () => {
    const a = nieuw(), b = nieuw(), c = nieuw();
    a.bewerk("Een"); const een = await pakket(a);
    a.bewerk("Een twee"); const twee = await pakket(a);
    b.ontvang(twee); b.ontvang(een); b.ontvang(twee);
    c.ontvang(een); c.ontvang(twee);
    expect(b.inhoud).toBe("Een twee"); expect(c.inhoud).toBe(b.inhoud);
    [a, b, c].forEach(x => x.doc.destroy());
  });

  it("behoudt een niet-bevestigde wijziging en herhaalt zonder dubbele tekst", async () => {
    const a = nieuw(), b = nieuw(); a.bewerk("Bewaren");
    await a.verstuur(async bericht => { b.ontvang(bericht); throw new Error("Antwoord verloren"); });
    expect(a.wacht).toBe(true); expect(a.fout).toContain("niet bevestigd");
    await a.verstuur(async bericht => { b.ontvang(bericht); });
    expect(a.wacht).toBe(false); expect(b.inhoud).toBe("Bewaren");
    a.doc.destroy(); b.doc.destroy();
  });

  it("laat nieuwe invoer tijdens een lopende verzending in de wachtrij", async () => {
    const a = nieuw(); a.bewerk("Eerst");
    let klaar!: () => void;
    const sturen = a.verstuur(() => new Promise<void>(resolve => { klaar = resolve; }));
    a.bewerk("Eerst en daarna"); klaar(); await sturen;
    expect(a.wacht).toBe(true);
    await pakket(a); expect(a.wacht).toBe(false); a.doc.destroy();
  });

  it("bewaart emoji en beschermt tegen ongeldige of te grote invoer", () => {
    const a = nieuw();
    a.bewerk("Hoi 😀 samen"); a.bewerk("Hoi 😃 samen");
    expect(a.inhoud).toBe("Hoi 😃 samen");
    expect(() => a.bewerk("x".repeat(50_001))).toThrow();
    expect(() => a.bewerk("\ud800")).toThrow(); a.doc.destroy();
  });

  it("weigert onbekende protocolvormen en wijzigingen voor een ander bestand", async () => {
    const a = nieuw(); a.bewerk("Eigen"); const b = await pakket(a);
    expect(leesProjectbericht({ ...b, versie: 2 })).toBeNull();
    expect(leesProjectbericht({ ...b, update: "geen base64!" })).toBeNull();
    expect(() => a.ontvang({ ...b, bestand: "ander" })).toThrow("ander bestand");
    expect(a.inhoud).toBe("Eigen"); a.doc.destroy();
  });

  it("zendt een nieuwe lege projectfile ook als er nog geen tekst is", async () => {
    const a = nieuw(), b = nieuw(); a.maakLeeg();
    const stuur = vi.fn(async (r: ProjectBericht) => { b.ontvang(r); });
    await a.verstuur(stuur);
    expect(stuur).toHaveBeenCalledTimes(1); expect(b.bevestigd).toBe(true);
    a.doc.destroy(); b.doc.destroy();
  });

  it("houdt gelijktijdige externe tekst vast tijdens een lokale IME-compositie", async () => {
    const a = nieuw(), b = nieuw();
    a.bewerk("Plan"); b.ontvang(await pakket(a));
    const basis = a.invoerBasis();
    b.bewerk("Plan samen"); a.ontvang(await pakket(b));
    a.bewerk("Nieuw Plan", basis);
    b.ontvang(await pakket(a));
    expect(a.inhoud).toBe("Nieuw Plan samen"); expect(b.inhoud).toBe(a.inhoud);
    a.doc.destroy(); b.doc.destroy();
  });

  it("beperkt bestanden tot tekstformaten en geeft geen oude werkruimte door aan een ander account", async () => {
    const b = bestandMaken(73, "projectplan", "Alleen eigen account");
    expect(b.titel).toBe("projectplan.md");
    expect(() => bestandMaken(73, "bestand.docx")).toThrow("geen Word");
    identiteit.sessie = { naam: "bob", token: "ander-test-only" };
    expect(werkruimte(73).bestanden.size).toBe(0);
    await expect(bestandDelen(73, b)).rejects.toThrow("huidige account");
  });
});
