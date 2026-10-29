import { describe, expect, it } from "vitest";
import { STANDAARD_VOLGORDE, linkNetjes, opmaakVan } from "./winkelopmaak";

describe("winkelopmaak", () => {
  it("vult een lege opmaak van een oudere winkel aan", () => {
    const o = opmaakVan({});
    expect(o.stijl).toBe("etalage");
    expect(o.volgorde).toEqual(STANDAARD_VOLGORDE);
    expect(o.vragen).toEqual([]);
  });

  it("houdt alleen bekende stijlen en delen over", () => {
    const o = opmaakVan({ stijl: "raar", volgorde: ["over", "hack", "producten"], uitgelicht: [3, "4"] });
    expect(o.stijl).toBe("etalage");
    expect(o.volgorde).toEqual(["over", "producten"]);
    expect(o.uitgelicht).toEqual([3]);
  });

  it("maakt links veilig en compleet", () => {
    expect(linkNetjes("instagram.com/sanne")).toBe("https://instagram.com/sanne");
    expect(linkNetjes("http://voorbeeld.nl")).toBe("https://voorbeeld.nl/");
    expect(linkNetjes("javascript:alert(1)")).toBe("");
    expect(linkNetjes("hallo")).toBe("");
    expect(linkNetjes("")).toBe("");
  });
});
