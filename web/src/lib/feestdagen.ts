// Feestdagen en schoolvakanties in de agenda, voor het land en de regio die je kiest. Zelfde instellingen als de oude
// app (instellingen.feestdagen = { land, extra, regio }). Feestdagen rekenen we zelf uit, elk jaar opnieuw, dus ze
// staan niet als afspraken in je gegevens en kloppen altijd. Schoolvakanties staan hieronder zoals de Rijksoverheid
// ze heeft vastgesteld; voor jaren die er nog niet zijn tonen we niets (nooit zelf verzinnen).
// Daarbij: brugdagen, zodat je ziet waar één vrije dag een lang weekend oplevert.
import type { Gegevens } from "../api";
import { datumTekst, plusDagen } from "./tijd";

export type Land = "NL" | "BE" | "";
export type Regio = "noord" | "midden" | "zuid" | "";
export type FeestInstellingen = { land: Land; extra: boolean; regio: Regio };
export type Dag = { datum: string; naam: string; soort: "feestdag" | "extra" | "vakantie" | "brugdag"; vrij: boolean;
  van?: string; tot?: string };

export const LANDEN: [Land, string][] = [["NL", "Nederland"], ["BE", "België"], ["", "Uit"]];
export const REGIO_S: [Regio, string][] = [["noord", "Noord"], ["midden", "Midden"], ["zuid", "Zuid"], ["", "Uit"]];
export const REGIO_UITLEG = "https://www.rijksoverheid.nl/themas/onderwijs/schoolvakanties/regios-schoolvakantie";

export function instellingen(g: Gegevens): FeestInstellingen {
  const f = (g.instellingen as { feestdagen?: Partial<FeestInstellingen> } | undefined)?.feestdagen ?? {};
  return { land: f.land === "BE" || f.land === "" ? f.land : "NL", extra: f.extra !== false,
    regio: f.regio === "noord" || f.regio === "midden" || f.regio === "zuid" ? f.regio : "" };
}

/** Eerste paasdag (gregoriaans). */
export function pasen(jaar: number) {
  const a = jaar % 19, b = Math.floor(jaar / 100), c = jaar % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(jaar, maand - 1, ((h + l - 7 * m + 114) % 31) + 1, 12);
}

const op = (j: number, m: number, d: number) => new Date(j, m - 1, d, 12);
/** De zoveelste zondag van een maand. */
const zondag = (j: number, m: number, welke: number) => {
  const eerste = op(j, m, 1);
  return plusDagen(eerste, ((7 - eerste.getDay()) % 7) + 7 * (welke - 1));
};

export function feestdagen(jaar: number, land: Land = "NL", extra = true): Dag[] {
  if (!land) return [];
  const p = pasen(jaar);
  const vrij = (d: Date, naam: string): Dag => ({ datum: datumTekst(d), naam, soort: "feestdag", vrij: true });
  const leuk = (d: Date, naam: string): Dag => ({ datum: datumTekst(d), naam, soort: "extra", vrij: false });
  let dagen: Dag[];
  if (land === "BE") {
    dagen = [vrij(op(jaar, 1, 1), "Nieuwjaar"), vrij(p, "Pasen"), vrij(plusDagen(p, 1), "Paasmaandag"),
      vrij(op(jaar, 5, 1), "Feest van de Arbeid"), vrij(plusDagen(p, 39), "O.L.H. Hemelvaart"), vrij(plusDagen(p, 49), "Pinksteren"),
      vrij(plusDagen(p, 50), "Pinkstermaandag"), vrij(op(jaar, 7, 21), "Nationale feestdag"), vrij(op(jaar, 8, 15), "O.L.V. Hemelvaart"),
      vrij(op(jaar, 11, 1), "Allerheiligen"), vrij(op(jaar, 11, 11), "Wapenstilstand"), vrij(op(jaar, 12, 25), "Kerstmis")];
    if (extra) dagen.push(leuk(zondag(jaar, 5, 2), "Moederdag"), leuk(zondag(jaar, 6, 2), "Vaderdag"),
      leuk(op(jaar, 12, 6), "Sinterklaas"), leuk(op(jaar, 12, 31), "Oudejaarsavond"));
  } else {
    let koningsdag = op(jaar, 4, 27);
    if (koningsdag.getDay() === 0) koningsdag = plusDagen(koningsdag, -1);
    dagen = [vrij(op(jaar, 1, 1), "Nieuwjaarsdag"), { ...vrij(plusDagen(p, -2), "Goede Vrijdag"), vrij: false },
      vrij(p, "Eerste paasdag"), vrij(plusDagen(p, 1), "Tweede paasdag"), vrij(koningsdag, "Koningsdag"),
      // Bevrijdingsdag is elk jaar een feestdag, maar voor veel werkgevers alleen eens in de vijf jaar een vrije dag.
      { ...vrij(op(jaar, 5, 5), "Bevrijdingsdag"), vrij: jaar % 5 === 0 },
      vrij(plusDagen(p, 39), "Hemelvaartsdag"), vrij(plusDagen(p, 49), "Eerste pinksterdag"), vrij(plusDagen(p, 50), "Tweede pinksterdag"),
      vrij(op(jaar, 12, 25), "Eerste kerstdag"), vrij(op(jaar, 12, 26), "Tweede kerstdag")];
    if (extra) dagen.push(leuk(zondag(jaar, 5, 2), "Moederdag"), leuk(zondag(jaar, 6, 3), "Vaderdag"),
      leuk(op(jaar, 12, 5), "Sinterklaasavond"), leuk(op(jaar, 12, 31), "Oudejaarsavond"));
  }
  return dagen.sort((a, b) => a.datum.localeCompare(b.datum));
}

// Schoolvakanties zoals vastgesteld door de Rijksoverheid (overzicht schoolvakanties 2026-2027 en 2027-2028).
const VAKANTIES: [string, Partial<Record<Exclude<Regio, "">, [string, string]>>][] = [
  ["Herfstvakantie", { noord: ["2026-10-10", "2026-10-18"], midden: ["2026-10-17", "2026-10-25"], zuid: ["2026-10-17", "2026-10-25"] }],
  ["Kerstvakantie", { noord: ["2026-12-19", "2027-01-03"], midden: ["2026-12-19", "2027-01-03"], zuid: ["2026-12-19", "2027-01-03"] }],
  ["Voorjaarsvakantie", { noord: ["2027-02-20", "2027-02-28"], midden: ["2027-02-20", "2027-02-28"], zuid: ["2027-02-13", "2027-02-21"] }],
  ["Meivakantie", { noord: ["2027-04-24", "2027-05-02"], midden: ["2027-04-24", "2027-05-02"], zuid: ["2027-04-24", "2027-05-02"] }],
  ["Zomervakantie", { noord: ["2027-07-10", "2027-08-22"], midden: ["2027-07-17", "2027-08-29"], zuid: ["2027-07-24", "2027-09-05"] }],
  ["Herfstvakantie", { noord: ["2027-10-16", "2027-10-24"], midden: ["2027-10-16", "2027-10-24"], zuid: ["2027-10-23", "2027-10-31"] }],
  ["Kerstvakantie", { noord: ["2027-12-25", "2028-01-09"], midden: ["2027-12-25", "2028-01-09"], zuid: ["2027-12-25", "2028-01-09"] }],
  ["Voorjaarsvakantie", { noord: ["2028-02-19", "2028-02-27"], midden: ["2028-02-26", "2028-03-05"], zuid: ["2028-02-26", "2028-03-05"] }],
  ["Meivakantie", { noord: ["2028-04-29", "2028-05-07"], midden: ["2028-04-29", "2028-05-07"], zuid: ["2028-04-29", "2028-05-07"] }],
  ["Zomervakantie", { noord: ["2028-07-15", "2028-08-27"], midden: ["2028-07-08", "2028-08-20"], zuid: ["2028-07-22", "2028-09-03"] }],
];

/**
 * Brugdagen: een werkdag tussen een vrije feestdag en het weekend (of tussen twee vrije dagen). Wie die ene dag
 * vrij neemt, heeft een lang weekend. We noemen ook hoeveel dagen achter elkaar je dan vrij bent.
 */
export function brugdagen(vrij: Set<string>, jaar: number): Dag[] {
  const isVrij = (d: Date) => d.getDay() === 0 || d.getDay() === 6 || vrij.has(datumTekst(d));
  const uit: Dag[] = [];
  for (let d = op(jaar, 1, 1); d.getFullYear() === jaar; d = plusDagen(d, 1)) {
    if (isVrij(d) || !isVrij(plusDagen(d, -1)) || !isVrij(plusDagen(d, 1))) continue;
    // Alleen als er echt een feestdag aan grenst, anders is het gewoon een week tussen twee weekenden.
    if (!vrij.has(datumTekst(plusDagen(d, -1))) && !vrij.has(datumTekst(plusDagen(d, 1)))) continue;
    let lengte = 1;
    for (let x = plusDagen(d, -1); isVrij(x); x = plusDagen(x, -1)) lengte += 1;
    for (let x = plusDagen(d, 1); isVrij(x); x = plusDagen(x, 1)) lengte += 1;
    uit.push({ datum: datumTekst(d), naam: `Brugdag: 1 dag vrij, ${lengte} dagen weg`, soort: "brugdag", vrij: false });
  }
  return uit;
}

/** Alles wat op een dag speelt, per datum, voor de jaren die je bekijkt. Vakanties staan op elke dag die ze duren. */
export function kalender(inst: FeestInstellingen, van: string, tot: string): Map<string, Dag[]> {
  const kaart = new Map<string, Dag[]>();
  const zet = (d: Dag) => kaart.set(d.datum, [...(kaart.get(d.datum) ?? []), d]);
  if (!inst.land) return kaart;
  for (let j = Number(van.slice(0, 4)); j <= Number(tot.slice(0, 4)); j += 1) {
    const dagen = feestdagen(j, inst.land, inst.extra);
    dagen.filter((d) => d.datum >= van && d.datum <= tot).forEach(zet);
    brugdagen(new Set(dagen.filter((d) => d.vrij).map((d) => d.datum)), j).filter((d) => d.datum >= van && d.datum <= tot).forEach(zet);
  }
  if (inst.land === "NL" && inst.regio) {
    for (const [naam, regios] of VAKANTIES) {
      const r = regios[inst.regio];
      if (!r || r[1] < van || r[0] > tot) continue;
      for (let d = new Date(`${r[0] > van ? r[0] : van}T12:00`); datumTekst(d) <= (r[1] < tot ? r[1] : tot); d = plusDagen(d, 1)) {
        zet({ datum: datumTekst(d), naam, soort: "vakantie", vrij: false, van: r[0], tot: r[1] });
      }
    }
  }
  return kaart;
}

/** De eerstvolgende feestdag of vakantie binnen een aantal dagen, voor op Vandaag. */
export function eerstvolgende(inst: FeestInstellingen, nu = new Date(), dagen = 21): (Dag & { over: number }) | null {
  const van = datumTekst(plusDagen(nu, 1));
  const kaart = kalender(inst, van, datumTekst(plusDagen(nu, dagen)));
  for (const datum of [...kaart.keys()].sort()) {
    // Een vakantie telt op de eerste dag, niet op elke dag die hij duurt.
    const d = kaart.get(datum)!.find((x) => x.soort !== "vakantie" || x.van === datum);
    if (!d) continue;
    const over = Math.round((new Date(`${datum}T12:00`).getTime() - new Date(`${datumTekst(nu)}T12:00`).getTime()) / 86_400_000);
    return { ...d, over };
  }
  return null;
}
