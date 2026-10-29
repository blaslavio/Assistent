import { describe, expect, it } from "vitest";
import { begrijp } from "./snelinvoer";

// Donderdag 29 oktober 2026, 10:30.
const nu = new Date(2026, 9, 29, 10, 30);

describe("vraagbalk", () => {
  it("maakt een afspraak met dag, tijd en plek", () => {
    expect(begrijp("morgen 9u tandarts in Ede", nu)).toEqual({ soort: "afspraak", titel: "Tandarts", datum: "2026-10-30", tijd: "09:00", locatie: "Ede" });
    expect(begrijp("lunch met Sanne 12:30", nu)).toEqual({ soort: "afspraak", titel: "Lunch met Sanne", datum: "2026-10-29", tijd: "12:30", locatie: "" });
    expect(begrijp("maandag om 14 overleg", nu)).toMatchObject({ datum: "2026-11-02", tijd: "14:00", titel: "Overleg" });
    expect(begrijp("training 9u30 3 nov", nu)).toMatchObject({ datum: "2026-11-03", tijd: "09:30", titel: "Training" });
    expect(begrijp("vanavond film", nu)).toMatchObject({ soort: "afspraak", datum: "2026-10-29", tijd: "19:00", titel: "Film" });
  });
  it("een tijd die al voorbij is, is morgen", () => {
    expect(begrijp("bellen 8 uur", nu)).toMatchObject({ datum: "2026-10-30", tijd: "08:00" });
  });
  it("zonder tijd wordt het een taak", () => {
    expect(begrijp("vrijdag boodschappen", nu)).toEqual({ soort: "taak", titel: "Boodschappen", deadline: "2026-10-30" });
    expect(begrijp("donderdag vuilnis", nu)).toMatchObject({ deadline: "2026-11-05" });
    expect(begrijp("melk halen", nu)).toEqual({ soort: "taak", titel: "Melk halen", deadline: null });
    expect(begrijp("factuur 2/1 betalen", nu)).toMatchObject({ titel: "Factuur betalen", deadline: "2027-01-02" });
  });
  it("een vraag gaat naar de assistent", () => {
    expect(begrijp("Wat staat er morgen in mijn agenda", nu).soort).toBe("vraag");
    expect(begrijp("regent het straks?", nu).soort).toBe("vraag");
    expect(begrijp("plan mijn dag", nu).soort).toBe("vraag");
  });
  it("bedragen en getallen zijn geen tijd", () => {
    expect(begrijp("Bram €45 terugbetalen", nu)).toMatchObject({ soort: "taak", titel: "Bram €45 terugbetalen" });
    expect(begrijp("3 boeken lezen", nu)).toMatchObject({ soort: "taak", titel: "3 boeken lezen" });
  });
});
