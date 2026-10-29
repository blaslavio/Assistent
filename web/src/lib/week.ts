// Je week in één oogopslag: hoe vol elke dag van de komende zeven is, welke dag rustig is, en een taak die daar
// goed past. Alles uitgerekend uit je eigen agenda en taken, zonder Claude.
import type { Afspraak, Gegevens, Taak } from "../api";
import { dagenVan } from "./club";
import { DAGEN, datumTekst, plusDagen } from "./tijd";
import { sorteer } from "./taken";

export type Dag = { datum: string; naam: string; minuten: number; afspraken: number; taken: number };
export type Week = { dagen: Dag[]; rustig: Dag | null; vol: Dag | null; klaar: number; voorstel: Taak | null };

const minuten = (a: Afspraak) => {
  if (a.start.length <= 10) return a.soort === "verjaardag" || a.soort === "herinnering" ? 0 : 120;
  if (a.soort === "herinnering") return 0;
  const begin = new Date(a.start).getTime();
  const eind = a.einde && a.einde.length > 10 ? new Date(a.einde).getTime() : begin + 3_600_000;
  return Math.max(15, Math.min(12 * 60, Math.round((eind - begin) / 60_000)));
};

export function weekBeeld(g: Gegevens, nu = new Date()): Week {
  const vandaag = datumTekst(nu);
  const dagen: Dag[] = Array.from({ length: 7 }, (_, i) => {
    const d = plusDagen(nu, i);
    return { datum: datumTekst(d), naam: i === 0 ? "Vandaag" : DAGEN[d.getDay()].slice(0, 2), minuten: 0, afspraken: 0, taken: 0 };
  });
  const per = new Map(dagen.map((d) => [d.datum, d]));
  for (const a of g.afspraken) for (const d of dagenVan(a, vandaag)) {
    const dag = per.get(d);
    if (dag) { dag.minuten += minuten(a); dag.afspraken += 1; }
  }
  const open = g.taken.filter((t) => !t.klaar);
  for (const t of open) {
    const dag = t.deadline && per.get(t.deadline.slice(0, 10));
    if (dag) dag.taken += 1;
  }
  // De rustigste dag na vandaag (vandaag zelf alleen als het nog vroeg is).
  const kandidaten = dagen.filter((d, i) => i > 0 || nu.getHours() < 14);
  const last = (d: Dag) => d.minuten + d.taken * 30;
  const rustig = kandidaten.length ? kandidaten.reduce((a, b) => (last(b) < last(a) ? b : a)) : null;
  const vol = dagen.reduce((a, b) => (last(b) > last(a) ? b : a));
  // Een taak die nog geen plek heeft: te laat of zonder datum, belangrijk eerst.
  const voorstel = open.filter((t) => !t.deadline || t.deadline.slice(0, 10) < vandaag).sort(sorteer)[0] ?? null;
  const week = datumTekst(plusDagen(nu, -6));
  const klaar = g.taken.filter((t) => t.klaar && (t as Taak & { klaar_op?: string }).klaar_op
    && (t as Taak & { klaar_op?: string }).klaar_op!.slice(0, 10) >= week).length;
  return { dagen, rustig: rustig && last(rustig) < last(vol) ? rustig : null, vol: last(vol) >= 6 * 60 ? vol : null, klaar, voorstel };
}

/** Een dagnaam voor in een zin: "vandaag", "morgen" of "donderdag". */
export function dagInZin(datum: string, nu = new Date()) {
  if (datum === datumTekst(nu)) return "vandaag";
  if (datum === datumTekst(plusDagen(nu, 1))) return "morgen";
  return DAGEN[new Date(`${datum}T12:00`).getDay()];
}
