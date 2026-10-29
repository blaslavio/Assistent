import { afterEach, describe, expect, it, vi } from "vitest";
import { GEEN_INTERNET, TE_LANG, Verbindingsfout, WEGGEVALLEN, foutTekst, isNetwerkfout, netVolgen, statusTekst } from "./net";

const echt = globalThis.fetch;
afterEach(() => { globalThis.fetch = echt; vi.restoreAllMocks(); });

describe("net", () => {
  it("herkent wat Safari, Chrome en Firefox zeggen als er geen verbinding is", () => {
    expect(isNetwerkfout(new TypeError("Load failed"))).toBe(true);
    expect(isNetwerkfout(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetwerkfout(new TypeError("NetworkError when attempting to fetch resource."))).toBe(true);
    expect(isNetwerkfout(new TypeError("x is undefined"))).toBe(false);
    expect(isNetwerkfout(new Error("Load failed"))).toBe(false);
  });

  it("maakt van een status gewone taal", () => {
    expect(statusTekst(429)).toMatch(/te veel tegelijk/);
    expect(statusTekst(504)).toBe(TE_LANG);
    expect(statusTekst(503)).toMatch(/storing/);
    expect(statusTekst(400)).toMatch(/fout 400/);
  });

  it("vertaalt technische meldingen en laat eigen meldingen staan", () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(foutTekst(new TypeError("Load failed"))).toBe(GEEN_INTERNET);
    expect(foutTekst(new Error("Die naam is al in gebruik."))).toBe("Die naam is al in gebruik.");
    expect(foutTekst("??", "Anders")).toBe("Anders");
  });

  it("geeft bij elk verzoek dat niet aankomt een Verbindingsfout, en laat stoppen met rust", async () => {
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockRejectedValueOnce(new DOMException("weg", "AbortError"));
    netVolgen();
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(true);
    const fout = await fetch("https://voorbeeld.nl").catch((e) => e);
    expect(fout).toBeInstanceOf(Verbindingsfout);
    expect(fout.message).toBe(WEGGEVALLEN);
    expect(fout.status).toBe(0);
    const stop = await fetch("https://voorbeeld.nl").catch((e) => e);
    expect(stop.name).toBe("AbortError");
  });
});
