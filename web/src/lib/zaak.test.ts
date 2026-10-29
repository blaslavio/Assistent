import { describe, expect, it } from "vitest";
import voorbeeld from "./zaak.voorbeeld.json";
import { bedrag, centen, cijfers, csv, periode, type Post } from "./zaak";

// De uitkomsten in zaak.voorbeeld.json komen uit de vorige app (zaak.py), zodat beide precies hetzelfde rekenen.
describe("zaak", () => {
  it("rekent omzet, winst en btw zoals de vorige app", () => {
    expect(cijfers(voorbeeld.posten as Post[])).toEqual(voorbeeld.cijfers);
  });
  it("leest bedragen zoals de vorige app", () => {
    for (const [t, c] of Object.entries(voorbeeld.centen)) expect(centen(t)).toBe(c);
    expect(() => centen("")).toThrow();
    expect(() => centen("12,5,0")).toThrow();
  });
  it("schrijft bedragen zoals de vorige app", () => {
    for (const [c, t] of Object.entries(voorbeeld.bedragen)) expect(bedrag(Number(c))).toBe(t);
  });
  it("kiest dezelfde periodes", () => {
    for (const [s, p] of Object.entries(voorbeeld.periode)) expect(periode(s as "Maand", new Date(2026, 10, 15))).toEqual(p);
  });
  it("maakt een veilige csv", () => {
    const uit = csv(voorbeeld.posten as Post[]);
    const regels = uit.replace("﻿", "").trim().split("\r\n");
    expect(regels[0]).toBe("Datum;Soort;Klant;Omschrijving;Categorie;Bedrag incl. btw;Btw %;Btw");
    expect(regels[1]).toBe(`2026-10-01;Kosten;;"'=Huur; zaal";Huur;121,00;21;21,00`);
    expect(regels[2]).toBe(`2026-10-02;Ontvangen;Bram;"rittenkaart ""10""";;33,33;0;0,00`);
  });
});
