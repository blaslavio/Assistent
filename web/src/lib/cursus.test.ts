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
