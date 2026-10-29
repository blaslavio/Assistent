// Samen een datum kiezen (stemrondes), met dezelfde databasefuncties als de oude app (sql/prikker.sql).
// Iedereen met de link stemt zonder account (?prik=code); wie in de app is uitgenodigd stemt in zijn agenda.
import { adresWaarde, alsIk, bijwerken, instellingenBijwerken, rpc, type Afspraak, type Gegevens } from "../api";
import { datumTekst, nuTekst, plusDagen, twee } from "./tijd";

export type Antwoord = "ja" | "misschien" | "nee";
export const ANTWOORDEN: [Antwoord, string][] = [["ja", "Ja"], ["misschien", "Misschien"], ["nee", "Nee"]];

export type Optie = { id: number; start: string; ja: number; misschien: number };
export type Stem = { naam: string; stemmen: Record<string, Antwoord>; ik?: boolean };
export type Peiling = { id: number; titel: string; plaats: string; notitie: string; minuten: number; open: boolean;
  gekozen: string | null; maker: string; van_mij: boolean; aangemaakt: string; opties: Optie[]; stemmen: Stem[];
  genodigden: string[] };
export type PeilingVoorGast = Omit<Peiling, "id" | "van_mij" | "genodigden">;

async function ik<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}
async function open<T>(functie: string, parameters: Record<string, unknown>) {
  const a = await rpc<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

/** "2026-11-02T19:00" (lokale tijd, zoals in de agenda) als moment met tijdzone voor de database. */
export function metZone(lokaal: string) {
  const d = new Date(lokaal);
  const m = -d.getTimezoneOffset();
  return `${lokaal}:00${m >= 0 ? "+" : "-"}${twee(Math.floor(Math.abs(m) / 60))}:${twee(Math.abs(m) % 60)}`;
}

export const mijn = async () => (await ik<{ peilingen: Peiling[] }>("mijn_peilingen")).peilingen ?? [];

/** Maakt de stemronde en onthoudt de code, zodat jij de link later opnieuw kunt delen (de database bewaart hem niet). */
export async function maken(titel: string, momenten: string[], plaats: string, minuten: number, genodigden: string[]) {
  const p = await ik<{ id: number; code: string; niet_gevonden: string[] }>("peiling_maken", {
    p_titel: titel, p_plaats: plaats, p_notitie: "", p_minuten: minuten, p_opties: momenten.map(metZone),
    p_genodigden: genodigden.map((n) => n.trim().replace(/^@/, "")).filter(Boolean) });
  await instellingenBijwerken((inst) => {
    inst.peiling_codes = { ...(inst.peiling_codes as Record<string, string> | undefined), [String(p.id)]: p.code };
  });
  return p;
}

export const code = (g: Gegevens, id: number) =>
  ((g.instellingen?.peiling_codes as Record<string, string> | undefined) ?? {})[String(id)] ?? "";

/** De link om te delen. Draait de app in een pagina van de oude app, dan het adres van dat venster. */
export function link(c: string) {
  let basis = location.origin + location.pathname;
  try {
    basis = window.top!.location.origin + "/";
  } catch {
    /* ander adres */
  }
  return `${basis}?prik=${c}`;
}

export const stemIk = (id: number, stemmen: Record<string, Antwoord>) => ik("peiling_stem_ik", { p_id: id, p_stemmen: stemmen });
export const weg = (id: number) => alsIk("peiling_weg", { p_id: id });

/**
 * Sluit de stemronde. Met een moment: in je agenda, en wie in de app meedeed (en geen nee zei) uitgenodigd.
 * Geeft de nieuwe afspraak terug, of null als je zonder moment sluit.
 */
export async function kiezen(p: Peiling, optie: number | null) {
  const k = await ik<{ start: string | null; minuten: number; titel: string; plaats: string; genodigden: string[] }>(
    "peiling_kiezen", { p_id: p.id, p_optie: optie });
  if (!k.start) return null;
  const begin = new Date(k.start);
  let afspraak: Afspraak | null = null;
  await bijwerken((g) => {
    afspraak = { id: g.volgend_id, titel: k.titel, start: nuTekst(begin), einde: nuTekst(new Date(begin.getTime() + k.minuten * 60_000)),
      locatie: k.plaats, soort: "afspraak", notitie: "Gekozen via Datum prikken." };
    g.afspraken.push(afspraak);
    g.volgend_id += 1;
  });
  const a = afspraak as Afspraak | null;
  if (a) {
    await Promise.all((k.genodigden ?? []).map((naam) =>
      alsIk("agenda_uitnodigen", { p_afspraak: String(a.id), p_gast: naam }).catch(() => null)));
  }
  return a;
}

/** Het moment met de meeste ja's (bij gelijkspel ook misschien), of null zonder stemmen. */
export function beste(opties: Optie[]) {
  const o = [...opties].sort((a, b) => b.ja - a.ja || b.misschien - a.misschien || a.start.localeCompare(b.start))[0];
  return o && (o.ja || o.misschien) ? o : null;
}

/** Stemronde waarin jij bent uitgenodigd, nog open, en waarin je nog niet hebt gestemd. */
export const wachtOpMij = (p: Peiling) => p.open && !p.van_mij && !p.stemmen.some((s) => s.ik);

// --- Momenten kiezen -------------------------------------------------------------------------------------------------

export type Dagdeel = "ochtend" | "middag" | "avond" | "hele dag";
export const DAGDELEN: [Dagdeel, string, number, number][] = [
  ["ochtend", "Ochtend", 9, 12], ["middag", "Middag", 12, 17], ["avond", "Avond", 18, 22], ["hele dag", "Maakt niet uit", 8, 22]];

type Bezet = { start: string; einde?: string | null };

function blokken(lijst: Bezet[]) {
  return lijst.filter((a) => a.start.length > 10).map((a) => {
    const b = new Date(a.start.slice(0, 16)).getTime();
    const e = a.einde && a.einde.length > 10 ? new Date(a.einde.slice(0, 16)).getTime() : b + 3_600_000;
    return [b, Math.max(e, b + 15 * 60_000)] as const;
  });
}

/**
 * Vrije momenten voor jou (en wie zijn agenda met je deelt), per half uur binnen het dagdeel. Hooguit één per dag,
 * zodat de stemronde echt verschillende dagen laat zien.
 */
export function vrijeMomenten(bezet: Bezet[], minuten: number, dagdeel: Dagdeel, nu = new Date(), dagen = 14, aantal = 5) {
  const [, , van, tot] = DAGDELEN.find(([d]) => d === dagdeel)!;
  const vol = blokken(bezet);
  const uit: string[] = [];
  const vroegst = nu.getTime() + 2 * 3_600_000;
  for (let i = 0; i <= dagen && uit.length < aantal; i += 1) {
    const dag = plusDagen(nu, i);
    for (let m = van * 60; m + minuten <= tot * 60; m += 30) {
      const begin = new Date(dag.getFullYear(), dag.getMonth(), dag.getDate(), Math.floor(m / 60), m % 60);
      const b = begin.getTime(), e = b + minuten * 60_000;
      if (b < vroegst || vol.some(([x, y]) => x < e && b < y)) continue;
      uit.push(nuTekst(begin));
      break;
    }
  }
  return uit;
}

/** Wat er in je eigen agenda al op dat moment staat, om bij een optie te laten zien. */
export function botst(afspraken: Afspraak[], start: string, minuten: number) {
  const b = new Date(start.length > 16 ? start : start.slice(0, 16)).getTime();
  const e = b + minuten * 60_000;
  const dag = datumTekst(new Date(b));
  return afspraken.filter((a) => {
    if (a.start.length <= 10) return a.start === dag && a.soort !== "herinnering" && a.soort !== "verjaardag";
    const [[x, y]] = blokken([a]);
    return x < e && b < y;
  });
}

export type Gedeeld = { id: number; naam: string; niveau: string };
export const metMijGedeeld = async () =>
  (await ik<{ met_mij: Gedeeld[] }>("agenda_deelsituatie")).met_mij ?? [];
export async function agendaVan(id: number, dagen = 14) {
  const v = datumTekst(new Date());
  return (await ik<{ afspraken: Bezet[] }>("gedeelde_agenda",
    { p_eigenaar: id, p_van: v, p_tot: datumTekst(plusDagen(new Date(), dagen)) })).afspraken ?? [];
}

// --- Voor wie via de link stemt -------------------------------------------------------------------------------------

export const prikCode = () => {
  const v = adresWaarde("prik");
  return v && /^[A-Za-z0-9_-]{8,80}$/.test(v) ? v : null;
};
export const bekijken = (c: string) => open<PeilingVoorGast>("peiling_bekijken", { p_code: c });
export const stemmen = (c: string, naam: string, sleutel: string, s: Record<string, Antwoord>) =>
  open("peiling_stemmen", { p_code: c, p_kiezer: naam, p_sleutel: sleutel, p_stemmen: s });

/** Een eigen sleutel per stemronde op dit apparaat, zodat je je stem later nog kunt aanpassen. */
export function gastSleutel(c: string): { sleutel: string; naam: string } {
  const k = `assistent.prik.${c.slice(0, 16)}`;
  try {
    const bewaard = JSON.parse(localStorage.getItem(k) ?? "null");
    if (bewaard?.sleutel) return bewaard;
  } catch { /* geen opslag */ }
  const sleutel = [...crypto.getRandomValues(new Uint8Array(16))].map((b) => b.toString(16).padStart(2, "0")).join("");
  return { sleutel, naam: "" };
}
export function gastOnthouden(c: string, waarde: { sleutel: string; naam: string }) {
  try { localStorage.setItem(`assistent.prik.${c.slice(0, 16)}`, JSON.stringify(waarde)); } catch { /* alleen nu */ }
}

/** Een agendabestand (.ics) zodat ook iemand zonder de app het gekozen moment in zijn eigen agenda zet. */
export function ics(titel: string, start: string, minuten: number, plaats = "") {
  const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const b = new Date(start);
  const schoon = (t: string) => t.replace(/[\\;,]/g, (x) => `\\${x}`).replace(/\r?\n/g, " ");
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Assistent//Datum prikken//NL", "BEGIN:VEVENT",
    `UID:${utc(b)}-${Math.random().toString(36).slice(2)}@assistent`, `DTSTAMP:${utc(new Date())}`, `DTSTART:${utc(b)}`,
    `DTEND:${utc(new Date(b.getTime() + minuten * 60_000))}`, `SUMMARY:${schoon(titel)}`,
    ...(plaats ? [`LOCATION:${schoon(plaats)}`] : []), "END:VEVENT", "END:VCALENDAR"].join("\r\n");
}
