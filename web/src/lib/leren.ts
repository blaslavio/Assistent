// Leren: leerdoelen met stappen, herhalen op het juiste moment en een dagelijkse reeks. Zelfde opslag als de oude
// app (leerdoelen, leerdagen, instellingen.dagdoel), zodat niets verloren gaat bij de overstap.
import type { Gegevens } from "../api";
import { datumTekst } from "./tijd";

export type Stap = { nummer: number; titel: string; score: number | null; herhalen_op: string | null; keer_geoefend: number };
export type Leerdoel = { id: number; onderwerp: string; doel?: string; deadline?: string; gestart?: string; stappen: Stap[];
  toetsen?: { datum: string; soort: string; goed: number; totaal: number }[] };
export type Reeks = { reeks: number; beste: number; dagdoel: number; vandaag: number; gehaald: boolean; week: boolean[] };

// Hoe beter je een stap kent, hoe later hij terugkomt (in dagen, per score 0 tot 5).
export const HERHAAL_NA = [1, 1, 2, 4, 7, 14];
export const STANDAARD_DAGDOEL = 5;

const dag = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const leerdoelen = (g: Gegevens) => (Array.isArray(g.leerdoelen) ? g.leerdoelen as Leerdoel[] : []);

/** Percentage stappen dat je met minstens een 4 beheerst. */
export function voortgang(d: Leerdoel) {
  if (!d.stappen.length) return 0;
  return Math.round(100 * d.stappen.filter((s) => (s.score ?? 0) >= 4).length / d.stappen.length);
}

/** Stappen die vandaag (of eerder) weer aan de beurt zijn. */
export function herhalingen(g: Gegevens, nu = new Date()) {
  const vandaag = datumTekst(nu);
  return leerdoelen(g).flatMap((d) => d.stappen.filter((s) => s.herhalen_op && s.herhalen_op <= vandaag)
    .map((s) => ({ doel: d, stap: s })));
}

export function reeks(g: Gegevens, nu = new Date()): Reeks {
  const dagen = (g.leerdagen ?? {}) as Record<string, number>;
  const dagdoel = Number((g.instellingen as { dagdoel?: number } | undefined)?.dagdoel) || STANDAARD_DAGDOEL;
  const gehaald = (d: Date) => (dagen[datumTekst(d)] ?? 0) >= dagdoel;
  // Vandaag nog niet gehaald breekt de reeks niet: dan telt hij vanaf gisteren.
  let d = gehaald(nu) ? nu : dag(nu, -1);
  let n = 0;
  while (gehaald(d)) { n += 1; d = dag(d, -1); }
  let beste = 0, huidig = 0, vorige = "";
  for (const k of Object.keys(dagen).filter((k) => dagen[k] >= dagdoel).sort()) {
    huidig = vorige && datumTekst(dag(new Date(`${vorige}T12:00`), 1)) === k ? huidig + 1 : 1;
    beste = Math.max(beste, huidig);
    vorige = k;
  }
  return { reeks: n, beste, dagdoel, vandaag: dagen[datumTekst(nu)] ?? 0, gehaald: gehaald(nu),
    week: [6, 5, 4, 3, 2, 1, 0].map((i) => gehaald(dag(nu, -i))) };
}

function punten(g: Gegevens, n: number, nu: Date) {
  const dagen = ((g.leerdagen ?? {}) as Record<string, number>);
  const k = datumTekst(nu);
  dagen[k] = (dagen[k] ?? 0) + Math.max(0, n);
  for (const oud of Object.keys(dagen).sort().slice(0, -400)) delete dagen[oud];
  g.leerdagen = dagen;
}

/** Een score 0 (niet) tot 5 (helemaal) voor een stap; plant de volgende herhaling en telt een punt voor vandaag. */
export function oefenen(g: Gegevens, doelId: number, nummer: number, score: number, nu = new Date()) {
  const s = leerdoelen(g).find((d) => d.id === doelId)?.stappen.find((x) => x.nummer === nummer);
  if (!s) return null;
  const sc = Math.max(0, Math.min(5, Math.round(score)));
  s.keer_geoefend += 1;
  s.score = sc;
  s.herhalen_op = datumTekst(dag(nu, HERHAAL_NA[sc] * (s.keer_geoefend > 2 && sc >= 4 ? 2 : 1)));
  punten(g, 1, nu);
  return s;
}

export function starten(g: Gegevens, onderwerp: string, stappen: string[], doel = "", deadline = "", nu = new Date()) {
  const d: Leerdoel = { id: g.volgend_id, onderwerp: onderwerp.trim().slice(0, 120), doel: doel.trim().slice(0, 200),
    deadline, gestart: datumTekst(nu),
    stappen: stappen.map((t) => t.trim()).filter(Boolean).slice(0, 40)
      .map((titel, i) => ({ nummer: i + 1, titel: titel.slice(0, 160), score: null, herhalen_op: null, keer_geoefend: 0 })) };
  g.volgend_id += 1;
  g.leerdoelen = [...leerdoelen(g), d];
  return d;
}

export function weg(g: Gegevens, id: number) {
  g.leerdoelen = leerdoelen(g).filter((d) => d.id !== id);
}
