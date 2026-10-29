// Agenda van een community (sql/community_agenda.sql): trainingen, wedstrijden en andere activiteiten, wie er komt,
// taken en samen rijden. Afwezig melden (ziek, blessure, vakantie) werkt door in de community's en in je eigen agenda.
import { alsIk, bijwerken, type Afspraak, type Gegevens } from "../api";
import { datumTekst, nuTekst, plusDagen } from "./tijd";
import { metZone } from "./prikken";

export type Soort = "training" | "wedstrijd" | "evenement" | "vergadering" | "anders";
export const SOORTEN: [Soort, string][] = [["training", "Training"], ["wedstrijd", "Wedstrijd"], ["evenement", "Uitje"],
  ["vergadering", "Vergadering"], ["anders", "Anders"]];
export type Antwoord = "ja" | "nee" | "misschien";
export type Reden = "ziek" | "blessure" | "vakantie" | "werk" | "anders" | "afwezig";
export const REDENEN: [Exclude<Reden, "afwezig">, string][] = [["ziek", "Ziek"], ["blessure", "Blessure"],
  ["vakantie", "Vakantie"], ["werk", "Werk of school"], ["anders", "Iets anders"]];
export const redenTekst = (r?: string | null) => r === "afwezig" ? "Afwezig" : REDENEN.find(([k]) => k === r)?.[1] ?? "";

export type Lid = { id: number; naam: string; ik: boolean; antwoord: Antwoord | null; reden: Reden | null; opmerking: string;
  selectie: boolean };
export type ClubTaak = { id: number; naam: string; plekken: number; wie: { id: number; naam: string }[] };
export type Rit = { id: number; naam: string; rol: "rijdt" | "meerijden"; plaatsen: number };
export type Activiteit = { id: number; soort: Soort; titel: string; start: string; einde: string | null; verzamelen: string | null;
  plaats: string; notitie: string; tegenstander: string; thuis: boolean | null; uitslag: string; max_deelnemers: number | null;
  afgelast: boolean; reeks: number | null; mag_bewerken: boolean; antwoorden: Lid[]; taken: ClubTaak[]; vervoer: Rit[] };
export type Afwezig = { id: number; gebruiker: number; naam: string; van_mij: boolean; van: string; tot: string | null;
  soort: Reden; opmerking: string };
export type MijnAfwezig = { id: number; soort: Exclude<Reden, "afwezig" | "werk">; van: string; tot: string | null;
  reden_zien: "beheer" | "iedereen"; opmerking: string; communities: { id: number; naam: string }[] };
export type ClubAgenda = { rol: string; activiteiten: Activiteit[]; afwezig: Afwezig[] };

async function ik<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

export const agenda = (community: number, dagen = 42) => ik<ClubAgenda>("community_agenda", {
  p_community: community, p_van: datumTekst(plusDagen(new Date(), -1)), p_tot: datumTekst(plusDagen(new Date(), dagen)) });

export type Nieuw = { soort: Soort; titel: string; start: string; einde?: string; verzamelen?: string; plaats?: string;
  notitie?: string; tegenstander?: string; thuis?: boolean | null; max_deelnemers?: number | null; afgelast?: boolean;
  uitslag?: string; taken?: string[] };

/** Tijden komen binnen als "2026-11-02T19:00" (lokaal) en gaan met tijdzone naar de database. */
export function bewaren(community: number, a: Nieuw, id: number | null = null, weken = 0) {
  const z = (t?: string) => (t ? metZone(t.slice(0, 16)) : null);
  return ik<{ ok: true; ids: number[] }>("community_activiteit_bewaren", { p_community: community, p_id: id, p_weken: weken,
    p_gegevens: { ...a, start: z(a.start), einde: z(a.einde), verzamelen: z(a.verzamelen) } });
}
export const weg = (id: number, reeks = false) => ik("community_activiteit_weg", { p_id: id, p_reeks: reeks });
export const antwoorden = (id: number, antwoord: Antwoord | null, reden: string | null = null, opmerking = "") =>
  ik("community_aanwezig_zetten", { p_id: id, p_antwoord: antwoord, p_reden: reden, p_opmerking: opmerking });
export const selectie = (id: number, gebruiker: number, aan: boolean) =>
  ik("community_selectie", { p_id: id, p_gebruiker: gebruiker, p_aan: aan });
export const taak = (id: number, aan: boolean, gebruiker: number | null = null) =>
  ik("community_taak", { p_taak: id, p_gebruiker: gebruiker, p_aan: aan });
export const vervoer = (id: number, rol: "rijdt" | "meerijden" | null, plaatsen = 3) =>
  ik("community_vervoer_zetten", { p_id: id, p_rol: rol, p_plaatsen: plaatsen });

/** Lokale tijd "2026-11-02T19:00" van een moment uit de database, voor formulieren en je eigen agenda. */
export const lokaal = (iso: string) => nuTekst(new Date(iso));

/** Stand van de antwoorden. */
export function telling(a: Activiteit) {
  const t = { ja: 0, nee: 0, misschien: 0, open: 0 };
  for (const l of a.antwoorden) t[l.antwoord ?? "open"] += 1;
  return t;
}
export const mijnAntwoord = (a: Activiteit) => a.antwoorden.find((l) => l.ik);

/** Samen rijden: plekken over (positief) of tekort (negatief). */
export function ritten(a: Activiteit) {
  const plekken = a.vervoer.filter((v) => v.rol === "rijdt").reduce((n, v) => n + v.plaatsen, 0);
  const mee = a.vervoer.filter((v) => v.rol === "meerijden").length;
  return { plekken, mee, over: plekken - mee };
}

// --- Afwezig melden -------------------------------------------------------------------------------------------------

export const mijnAfwezig = async () => (await ik<{ meldingen: MijnAfwezig[] }>("mijn_afwezig")).meldingen ?? [];

const TITELS: Record<string, string> = { ziek: "Ziek", blessure: "Geblesseerd", vakantie: "Vakantie", anders: "Afwezig" };
const sleutel = (id: number) => `afwezig:${id}`;

/**
 * Meldt je afwezig in de gekozen community's (leeg: allemaal) en zet het als hele-dag-afspraak in je eigen agenda.
 * Zonder einddatum loopt het door tot je je beter meldt.
 */
export async function afwezigMelden(soort: MijnAfwezig["soort"], van: string, tot: string | null, communities: number[],
  iedereen: boolean, opmerking: string) {
  const r = await ik<{ ok: true; id: number; afgemeld: number }>("afwezig_melden", { p_soort: soort, p_van: van, p_tot: tot,
    p_communities: communities, p_reden_zien: iedereen ? "iedereen" : "beheer", p_opmerking: opmerking });
  const data = await bijwerken((g) => {
    g.afspraken.push({ id: sleutel(r.id), titel: TITELS[soort], start: van, einde: tot, soort: soort === "vakantie" ? "reizen" : "gezondheid",
      notitie: opmerking, doorlopend: !tot } as Afspraak);
  });
  return { ...r, data };
}

/** Beter melden (of terug van vakantie): de komende activiteiten staan weer open en je agenda stopt vandaag. */
export async function beterMelden(m: MijnAfwezig) {
  await ik("afwezig_aanpassen", { p_id: m.id, p_tot: null, p_beter: true });
  const vandaag = datumTekst(new Date());
  return bijwerken((g) => {
    const a = g.afspraken.find((x) => x.id === sleutel(m.id)) as (Afspraak & { doorlopend?: boolean }) | undefined;
    if (!a) return;
    if (a.start > vandaag) g.afspraken = g.afspraken.filter((x) => x !== a);
    else { a.einde = vandaag; a.doorlopend = false; }
  });
}

export async function totAanpassen(m: MijnAfwezig, tot: string | null) {
  await ik("afwezig_aanpassen", { p_id: m.id, p_tot: tot, p_beter: false });
  return bijwerken((g) => {
    const a = g.afspraken.find((x) => x.id === sleutel(m.id)) as (Afspraak & { doorlopend?: boolean }) | undefined;
    if (a) { a.einde = tot; a.doorlopend = !tot; }
  });
}

/**
 * Op welke dagen een afspraak staat. Een hele-dag-afspraak met een einddatum staat op elke dag tot en met die datum;
 * een doorlopende (ziek tot je beter bent) tot en met vandaag. Hooguit 60 dagen.
 */
export function dagenVan(a: Afspraak, vandaag = datumTekst(new Date())) {
  const begin = a.start.slice(0, 10);
  if (a.start.length > 10) return [begin];
  const eind = (a as Afspraak & { doorlopend?: boolean }).doorlopend ? (vandaag > begin ? vandaag : begin)
    : a.einde && a.einde.length === 10 && a.einde > begin ? a.einde : begin;
  const uit: string[] = [];
  for (let d = new Date(`${begin}T12:00`); uit.length < 60; d = plusDagen(d, 1)) {
    const t = datumTekst(d);
    if (t > eind) break;
    uit.push(t);
  }
  return uit;
}

/** Een activiteit van de club in je eigen agenda zetten (als je komt). */
export function inMijnAgenda(g: Gegevens, a: Activiteit, club: string) {
  const id = `club:${a.id}`;
  if (g.afspraken.some((x) => x.id === id)) return false;
  g.afspraken.push({ id, titel: a.titel, start: lokaal(a.verzamelen ?? a.start), einde: a.einde ? lokaal(a.einde) : null,
    locatie: a.plaats, soort: a.soort === "training" || a.soort === "wedstrijd" ? "sport" : "afspraak",
    notitie: `${club}${a.verzamelen ? `. Verzamelen, begin ${lokaal(a.start).slice(11)}` : ""}` });
  return true;
}
