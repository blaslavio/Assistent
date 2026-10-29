import { describe, expect, it } from "vitest";
import { dagenVan, ritten, telling, type Activiteit } from "./club";

describe("club", () => {
  it("zet een ziekmelding op elke dag tot vandaag, en een vakantie tot de einddatum", () => {
    expect(dagenVan({ id: "a", titel: "Ziek", start: "2026-10-27", doorlopend: true } as never, "2026-10-29"))
      .toEqual(["2026-10-27", "2026-10-28", "2026-10-29"]);
    expect(dagenVan({ id: "b", titel: "Vakantie", start: "2026-10-30", einde: "2026-11-01" }, "2026-10-29"))
      .toEqual(["2026-10-30", "2026-10-31", "2026-11-01"]);
    expect(dagenVan({ id: 1, titel: "Training", start: "2026-10-30T19:00", einde: "2026-10-30T20:00" })).toEqual(["2026-10-30"]);
  });
  it("telt antwoorden en plekken in de auto", () => {
    const a = { antwoorden: [{ antwoord: "ja" }, { antwoord: null }, { antwoord: "nee" }, { antwoord: "ja" }],
      vervoer: [{ rol: "rijdt", plaatsen: 3 }, { rol: "meerijden", plaatsen: 0 }, { rol: "meerijden", plaatsen: 0 }] } as unknown as Activiteit;
    expect(telling(a)).toEqual({ ja: 2, nee: 1, misschien: 0, open: 1 });
    expect(ritten(a)).toEqual({ plekken: 3, mee: 2, over: 1 });
  });
});
