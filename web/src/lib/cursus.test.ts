import { describe, expect, it } from "vitest";
import { prijsTekst, videoSpeler } from "./cursus";

describe("cursus", () => {
  it("speelt YouTube zonder cookies en Vimeo in de app af", () => {
    expect(videoSpeler("https://youtu.be/abcDEF12345")).toEqual({ soort: "embed", src: "https://www.youtube-nocookie.com/embed/abcDEF12345" });
    expect(videoSpeler("https://www.youtube.com/watch?v=abcDEF12345&t=3")?.src).toBe("https://www.youtube-nocookie.com/embed/abcDEF12345");
    expect(videoSpeler("https://vimeo.com/123456")?.src).toBe("https://player.vimeo.com/video/123456?dnt=1");
    expect(videoSpeler("https://voorbeeld.nl/les.mp4")?.soort).toBe("bestand");
    expect(videoSpeler("https://voorbeeld.nl/les")?.soort).toBe("link");
    expect(videoSpeler("http://onveilig.nl/a.mp4")).toBeNull();
  });
  it("toont de prijs", () => {
    expect(prijsTekst(0)).toBe("Gratis");
    expect(prijsTekst(1250).replace(/\s/g, " ")).toBe("€ 12,50");
  });
});

describe("soorten aanbod", () => {
  it("geeft per soort een eigen korte regel", async () => {
    const { soortRegel, duurTekst } = await import("./cursus");
    expect(soortRegel({ soort: "cursus", details: { niveau: "beginner" } })).toBe("Cursus · Voor beginners");
    expect(soortRegel({ soort: "dienst", details: { duur: 60, waar: "locatie", plek: "Ede" } })).toBe("Dienst · 1 uur · Ede");
    expect(soortRegel({ soort: "training", details: { wanneer: "2026-11-05T19:30", duur: 90, waar: "online" } }))
      .toMatch(/^Training · .*5 nov.*19:30 · 1,5 uur · Online$/);
    expect(duurTekst(45)).toBe("45 min");
    expect(duurTekst(0)).toBe("");
  });

  it("weet wanneer een training geweest is", async () => {
    const { voorbij } = await import("./cursus");
    const nu = new Date("2026-11-05T21:30");
    expect(voorbij({ soort: "training", details: { wanneer: "2026-11-05T19:30", duur: 90 } }, nu)).toBe(true);
    expect(voorbij({ soort: "training", details: { wanneer: "2026-11-05T19:30", duur: 150 } }, nu)).toBe(false);
    expect(voorbij({ soort: "cursus", details: {} }, nu)).toBe(false);
  });

  it("accepteert alleen een getal als gedeelde link", async () => {
    const { cursusLinkVragen, isCursusLinkGevraagd } = await import("./cursus");
    expect(cursusLinkVragen("abc")).toBe(false);
    expect(cursusLinkVragen("42")).toBe(true);
    expect(isCursusLinkGevraagd()).toBe(true);
  });
});
