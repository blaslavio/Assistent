// Een nepserver die onthoudt wat je bewaart, zodat we kunnen zien dat niets verdwijnt tussen schermen en na herstarten.
import type { Page } from "@playwright/test";

export type Nep = { data: Record<string, unknown>; aanroepen: string[]; onbekend: Set<string> };

const vandaag = () => new Date().toISOString().slice(0, 10);
const om = (uur: number) => `${vandaag()}T${String(uur).padStart(2, "0")}:00`;

const aanbod = (id: number, titel: string, prijs: number, soort = "product", levering = ["ophalen"]) => ({ id, soort, titel, prijs,
  omschrijving: "Netjes", plaats: "Ede", aanbieder: "Sanne", aanbieder_id: 7, van_mij: false, in_winkel: false, levering,
  betaalwijzen: ["app"], heeft_foto: false });

const LEEG = { taken: [], afspraken: [], contacten: [], leerdoelen: [], sportdoelen: [], volgend_id: 1 };
// Vergelijkt zoals jsonb: de volgorde van sleutels telt niet.
function gelijk(a: unknown, b: unknown): boolean {
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => gelijk(x, b[i]));
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a), kb = Object.keys(b);
    return ka.length === kb.length && ka.every((k) => gelijk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return a === b;
}

export async function nepserver(page: Page, begin: Partial<Record<string, unknown>> = {}): Promise<Nep> {
  const nep: Nep = {
    data: { taken: [], afspraken: [{ id: 1, titel: "Lunch met Mo", start: om(12), einde: om(13) }], volgend_id: 10,
      instellingen: {}, ...begin },
    aanroepen: [], onbekend: new Set(),
  };
  const gebruiker = { id: 1, naam: "test", weergavenaam: "Test" };
  // Altijd 9 uur 's ochtends, zodat de lunch van vandaag nog moet komen, hoe laat de test ook draait.
  const ochtend = new Date(); ochtend.setHours(9, 0, 0, 0);
  await page.clock.setFixedTime(ochtend);
  await page.addInitScript(() => {
    localStorage.setItem("assistent.apparaat", "apparaat." + "a".repeat(48));
    localStorage.setItem("assistent.eerste_minuut.v1", "1");
  });
  await page.route("**/rest/v1/rpc/**", async (route) => {
    const naam = new URL(route.request().url()).pathname.split("/").pop()!;
    const p = JSON.parse(route.request().postData() || "{}");
    nep.aanroepen.push(naam);
    let antwoord: unknown = [];
    switch (naam) {
      case "apparaat_start":
        antwoord = { token: "sessie." + "b".repeat(64), naam: "test", gegevens: { gebruiker, data: nep.data } };
        break;
      case "mijn_gegevens":
        antwoord = { gebruiker, data: nep.data };
        break;
      case "mijn_gegevens_veilig_bewaren":
        // Zoals de echte database: de basis moet gelijk zijn aan wat er staat, aangevuld met de lege standaardlijsten.
        if (!gelijk({ ...LEEG, ...nep.data }, p.p_basis)) antwoord = { conflict: true };
        else { nep.data = p.p_data; antwoord = { ok: true }; }
        break;
      case "aanbod_zoeken":
        antwoord = { aanbod: p.p_soort === "dienst" ? [aanbod(21, "Bijles wiskunde", 25, "dienst", ["online"])]
          : [aanbod(11, "Wollen winterjas", 35, "product", ["verzenden"]), aanbod(12, "Gazelle stadsfiets", 180)] };
        break;
      case "winkels_zoeken":
        antwoord = [{ adres: "roma", naam: "Pizzeria Roma", omschrijving: "Pizza uit de houtoven", producten: 4,
          verkoper: "Roma", winkeladres: "Markt 1, 6211 CK Maastricht", lat: 50.851, lon: 5.691 }];
        break;
      case "mijn_bestellingen":
        antwoord = { bestellingen: [{ id: 42, titel: "Margherita", bedrag: 21.5, betaalwijze: "app", levering: "afhalen", status: "betaald",
          rol: "koper", ander: "Roma", ander_id: 7, kosten: 0.5, aantal: 2, verzendkosten: 0, webshop: true, bijgewerkt: "2026-11-05T12:00:00Z",
          aangemaakt: "2026-11-05T11:58:00Z", regels: [{ titel: "Margherita", aantal: 1, prijs: 11 }, { titel: "Pizza funghi", aantal: 1, prijs: 10.5 }] }] };
        break;
      case "winkelen_producten":
        antwoord = { producten: [] };
        break;
      default:
        nep.onbekend.add(naam);
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(antwoord) });
  });
  // Alles wat naar buiten zou gaan (functies, weer, kaarten, CDN) wordt afgevangen.
  await page.route(/supabase\.co\/(functions|auth|storage)|open-meteo|nominatim|overpass|jsdelivr|tile/, (r) => r.abort());
  return nep;
}
