import { describe, expect, it } from "vitest";
import { afschriftLezen, categorieRaden, metSleutels } from "./afschrift";
import voorbeeld from "./afschrift.voorbeeld.json";

// De verwachte uitkomst komt uit budget.py van de vorige app: dezelfde regels, categorieën en sleutels.
describe("afschrift", () => {
  for (const bank of ["ing", "abn"] as const) {
    it(`leest ${bank} zoals de vorige app`, async () => {
      const regels = await metSleutels(afschriftLezen(voorbeeld[bank]));
      const metCat = regels.map((r) => ({ ...r, categorie: categorieRaden(r.tegenpartij, r.omschrijving, r.bedrag) }));
      expect(metCat).toEqual(voorbeeld.verwacht[bank]);
    });
  }
  it("geeft een duidelijke fout bij een onbekend bestand", () => {
    expect(() => afschriftLezen("hallo\nwereld")).toThrow(/herken ik niet/);
  });
});
