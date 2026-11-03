/** Eén persoonlijke productiviteitslaag op bestaande taken, afspraken en instellingen.
 * Geen achtergrondacties, AI-netwerk, externe betalingen of nieuwe database.
 * De UI biedt uitsluitend voorstellen; opslag loopt via api.bijwerken met versiecontrole.
 */
import type { Afspraak, Gegevens, Taak } from "../api";
import { datumTekst, plusDagen } from "./tijd";

export type RegelId = "over_tijd" | "vandaag" | "hoog";
export type Regels = Record<RegelId, boolean>;
export const STANDAARD_REGELS: Readonly<Regels> = Object.freeze({
  over_tijd: true, vandaag: true, hoog: true,
});
export const REGEL_INFO: { id: RegelId; naam: string; uitleg: string }[] = [
  { id: "over_tijd", naam: "Te late taken", uitleg: "Toon open taken waarvan de deadline is verstreken." },
  { id: "vandaag", naam: "Vandaag actie nodig", uitleg: "Toon open taken met deadline vandaag." },
  { id: "hoog", naam: "Hoge prioriteit", uitleg: "Toon open prioritaire taken, ook zonder deadline." },
];

export function leesRegels(g: Gegevens): Regels {
  const bron = g.instellingen?.productiviteit_regels_v1;
  const r = bron && typeof bron === "object" && !Array.isArray(bron) ? bron as Record<string, unknown> : {};
  return {
    over_tijd: typeof r.over_tijd === "boolean" ? r.over_tijd : true,
    vandaag: typeof r.vandaag === "boolean" ? r.vandaag : true,
    hoog: typeof r.hoog === "boolean" ? r.hoog : true,
  };
}

export function schrijfRegel(g: Gegevens, id: RegelId, aan: boolean): void {
  if (!REGEL_INFO.some(r => r.id === id) || typeof aan !== "boolean") throw new Error("Onbekende werkregel.");
  g.instellingen ??= {};
  g.instellingen.productiviteit_regels_v1 = { ...leesRegels(g), [id]: aan };
}

export type InboxTaak = { id: number; titel: string; reden: string; rang: number; deadline?: string };
const dag = (waarde: string | null | undefined) => typeof waarde === "string" && /^\d{4}-\d{2}-\d{2}/.test(waarde) ? waarde.slice(0, 10) : undefined;

/** Eén regel per taak, zonder dubbele meldingen bij hoge prioriteit én verstreken deadline. */
export function inboxTaken(g: Gegevens, nu = new Date(), regels = leesRegels(g)): InboxTaak[] {
  const vandaag = datumTekst(nu);
  return g.taken.filter(t => !t.klaar && Number.isSafeInteger(t.id) && t.id > 0).flatMap(t => {
    const deadline = dag(t.deadline);
    const over = !!deadline && deadline < vandaag;
    const nu = deadline === vandaag;
    const hoog = t.prioriteit === "hoog";
    if (over && regels.over_tijd) return [{ id: t.id, titel: t.titel, reden: "Deadline verstreken", rang: 0, deadline }];
    if (nu && regels.vandaag) return [{ id: t.id, titel: t.titel, reden: "Vandaag", rang: 1, deadline }];
    if (hoog && regels.hoog) return [{ id: t.id, titel: t.titel, reden: "Hoge prioriteit", rang: 2, deadline }];
    return [];
  }).sort((a, b) => a.rang - b.rang || (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.id - b.id).slice(0, 40);
}

export type PlanBlok = { taakId: number; titel: string; van: string; tot: string; minuten: number };
type Interval = { van: number; tot: number };
const DAG = /^\d{4}-\d{2}-\d{2}$/;
const twee = (n: number) => String(n).padStart(2, "0");
const tijd = (d: Date) => datumTekst(d) + "T" + twee(d.getHours()) + ":" + twee(d.getMinutes());

/** Blokkeer ook hele dagen, uitlopende afspraken en afspraken die gisteren begonnen. */
function bezetOp(afspraken: Afspraak[], datum: string): Interval[] {
  const vanaf = new Date(datum + "T00:00");
  const tot = new Date(vanaf);
  tot.setDate(tot.getDate() + 1);
  const lijst: Interval[] = [];
  for (const a of afspraken) {
    if (!a.start || typeof a.start !== "string") continue;
    const allDay = DAG.test(a.start);
    const start = new Date(allDay ? a.start + "T00:00" : a.start);
    if (!Number.isFinite(start.getTime())) continue;
    let eind: Date;
    if (a.einde) {
      eind = new Date(DAG.test(a.einde) ? a.einde + "T00:00" : a.einde);
      if (allDay && eind.getTime() <= start.getTime()) {
        eind = new Date(start);
        eind.setDate(eind.getDate() + 1);
      }
    } else {
      eind = new Date(start);
      if (allDay) eind.setDate(eind.getDate() + 1);
      else eind.setMinutes(eind.getMinutes() + 60);
    }
    if (!Number.isFinite(eind.getTime()) || eind <= start) continue;
    if (start < tot && eind > vanaf) {
      lijst.push({ van: Math.max(start.getTime(), vanaf.getTime()), tot: Math.min(eind.getTime(), tot.getTime()) });
    }
  }
  return lijst;
}

function duur(t: Taak): number {
  const waarde = (t as Taak & { minuten?: number }).minuten;
  if (!Number.isFinite(waarde) || !Number.isInteger(waarde)) return 45;
  return Math.min(120, Math.max(15, waarde as number));
}

function heeftFocus(afspraken: Afspraak[], t: Taak, nu: Date): boolean {
  return afspraken.some(a => (a as Afspraak & { taak_id?: number }).taak_id === t.id &&
    (!a.einde || new Date(a.einde).getTime() > nu.getTime()));
}

/** Stelt maximaal 'limiet' focusblokken voor. Geen writes: agenda blijft leidend. */
export function maakDagplan(g: Gegevens, nu = new Date(), limiet = 4): PlanBlok[] {
  if (!Number.isFinite(nu.getTime())) return [];
  const vandaag = datumTekst(nu);
  const morgen = datumTekst(plusDagen(nu, 1));
  const vanaf = new Date(vandaag + "T09:00");
  const uiterlijk = new Date(vandaag + "T18:00");
  const eerst = Math.max(vanaf.getTime(), Math.ceil((nu.getTime() + 60_000) / 900_000) * 900_000);
  const intervallen = bezetOp(g.afspraken, vandaag);
  const taken = g.taken.filter(t => !t.klaar && Number.isSafeInteger(t.id) &&
      ((dag(t.deadline) !== undefined && dag(t.deadline)! <= morgen) || t.prioriteit === "hoog") &&
      !heeftFocus(g.afspraken, t, nu))
    .sort((a, b) => Number(b.prioriteit === "hoog") - Number(a.prioriteit === "hoog") ||
      (dag(a.deadline) ?? "9999").localeCompare(dag(b.deadline) ?? "9999") || a.id - b.id);
  const resultaat: PlanBlok[] = [];
  for (const taak of taken) {
    if (resultaat.length >= Math.min(12, Math.max(0, limiet))) break;
    const ms = duur(taak) * 60_000;
    let begin = eerst;
    for (const blok of [...intervallen].sort((a, b) => a.van - b.van)) {
      if (begin + ms <= blok.van) break;
      if (begin < blok.tot && begin + ms > blok.van) begin = Math.ceil(blok.tot / 900_000) * 900_000;
    }
    if (begin + ms > uiterlijk.getTime()) continue;
    const slot = { taakId: taak.id, titel: taak.titel, van: tijd(new Date(begin)), tot: tijd(new Date(begin + ms)), minuten: duur(taak) };
    resultaat.push(slot);
    intervallen.push({ van: begin, tot: begin + ms });
  }
  return resultaat;
}

/** Nogmaals plannen op de verse databaseversie; mislukte checks veranderen niets. */
export function legFocusVast(g: Gegevens, plan: PlanBlok, nu = new Date()): void {
  const geldig = maakDagplan(g, nu, 12).find(p => p.taakId === plan.taakId &&
    p.van === plan.van && p.tot === plan.tot && p.titel === plan.titel);
  if (!geldig) throw new Error("Dit tijdvoorstel is veranderd. Vernieuw en plan opnieuw.");
  if (!Number.isSafeInteger(g.volgend_id) || g.volgend_id < 1) throw new Error("Ongeldige agenda-opslag.");
  g.afspraken.push({
    id: g.volgend_id++, titel: geldig.titel, start: geldig.van, einde: geldig.tot,
    soort: "focus", locatie: "", taak_id: geldig.taakId,
  } as Afspraak & { taak_id: number });
}
