// Zakelijk: groepslessen, afspraken afvinken, saldo per klant en een eenvoudige boekhouding. Dezelfde gegevens en
// databasefuncties als de vorige app (sql/zaak.sql, sql/chat_boeken.sql). Bedragen zijn in centen en inclusief btw.
//
// Een 'post' is een regel in de boekhouding: een geleverde dienst (de klant moet betalen), een ontvangen betaling of
// eigen kosten. Saldo per klant = betalingen - diensten: positief is tegoed, negatief nog te betalen.
import { alsIk, instellingenBijwerken, type Gegevens } from "../api";
import { STANDAARD as BOEK_STANDAARD, linkNaam, mijnPagina, paginaBewaren } from "./gasten";

export const SOORTEN_ZAAK: Record<string, string> = { gym: "Gym of club", trainer: "Personal trainer", dienst: "Dienstverlener" };
export const BTW = [0, 9, 21] as const;
export const KOSTEN = ["Huur", "Materiaal", "Marketing", "Verzekering", "Software", "Vervoer", "Opleiding", "Overig"];
export const SOORT_NAAM: Record<Post["soort"], string> = { dienst: "Geleverd", betaling: "Ontvangen", kosten: "Kosten" };

export type Zaak = { soort: string; groepslessen: boolean; afspraken: boolean; btw: number; naam: string };
const STANDAARD: Zaak = { soort: "gym", groepslessen: true, afspraken: true, btw: 21, naam: "" };

export type Post = { id: number; soort: "dienst" | "betaling" | "kosten"; bedrag: number; btw: number; klant: string;
  klant_id: number | null; omschrijving: string; categorie: string; datum: string };
export type Saldo = { sleutel: string; klant: string; klant_id: number | null; saldo: number; laatst: string };
export type Afspraak = { id: number; soort: string; start: string; naam: string; prijs: number; reeks?: string | null;
  afgevinkt?: string | null };
export type Overzicht = { posten: Post[]; saldi: Saldo[]; afvinken: Afspraak[]; betaald_gemeld: Afspraak[] };
export type Deelnemer = { id: number; naam: string; klant_id: number | null; status: "ingeschreven" | "wachtlijst";
  afgevinkt: "gekomen" | "niet_gekomen" | null };
export type Les = { id: number; naam: string; start: string; minuten: number; plekken: number; prijs: number;
  locatie: string; reeks: string | null; ingeschreven: number; wachtlijst: number; deelnemers: Deelnemer[] };

export function instellingen(data: Gegevens): Zaak {
  const z = { ...STANDAARD, ...((data.instellingen?.zaak as Partial<Zaak>) ?? {}) };
  return { ...z, btw: (BTW as readonly number[]).includes(z.btw) ? z.btw : 21 };
}
export const instellen = (z: Zaak) => instellingenBijwerken((i) => { i.zaak = z; });

async function ik<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

// --- Geld --------------------------------------------------------------------------------------------------------

/** "12,50", "1.234,56", "€ 8" of "8.5" naar centen; onleesbare invoer is een fout, geen nul. */
export function centen(tekst: string): number {
  let s = tekst.trim().replace(/^([+-]?)\s*€\s*/, "$1");
  if (s.length > 80) throw new Error("Het bedrag is te lang.");
  if (s.includes(",")) {
    if (!/^[+-]?(?:[0-9]+|[0-9]{1,3}(?:\.[0-9]{3})+),[0-9]{1,6}$/.test(s)) throw new Error("Gebruik bijvoorbeeld 12,50 of 1.234,56.");
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (!/^[+-]?[0-9]+(?:\.[0-9]{1,6})?$/.test(s)) {
    throw new Error("Vul een geldig bedrag in.");
  }
  // Exact afronden op hele centen, de halve cent van nul af (zoals de vorige app), zonder zwevendekommafouten.
  const [heel, deel = ""] = s.replace(/^[+-]/, "").split(".");
  const negatief = s.startsWith("-");
  let c = Number(heel) * 100 + Number((deel + "00").slice(0, 2));
  if (Number(deel[2] ?? "0") >= 5) c += 1;
  if (c > 2_147_483_647) throw new Error("Het bedrag is groter dan ondersteund.");
  return negatief ? -c : c;
}

export function bedrag(c: number): string {
  const a = Math.abs(Math.round(c));
  return (c < 0 ? "- " : "") + "€ " + Math.floor(a / 100).toLocaleString("nl-NL") + "," + String(a % 100).padStart(2, "0");
}

export const btwDeel = (centenIncl: number, pct: number) => (pct ? Math.round((centenIncl * pct) / (100 + pct)) : 0);

/** Omzet (geleverde diensten), ontvangen, kosten, winst en btw over een lijst regels. */
export function cijfers(posten: Post[]) {
  const som = (soort: Post["soort"], f: (p: Post) => number = (p) => p.bedrag) =>
    posten.filter((p) => p.soort === soort).reduce((t, p) => t + f(p), 0);
  const omzet = som("dienst"), kosten = som("kosten");
  const btw_af = som("dienst", (p) => btwDeel(p.bedrag, p.btw)), btw_voor = som("kosten", (p) => btwDeel(p.bedrag, p.btw));
  return { omzet, ontvangen: som("betaling"), kosten, winst: omzet - btw_af - (kosten - btw_voor), btw_af, btw_voor,
    btw_saldo: btw_af - btw_voor };
}

export type Periode = "Maand" | "Kwartaal" | "Jaar";
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function periode(soort: Periode, vandaag = new Date()): [string, string] {
  const j = vandaag.getFullYear(), m = vandaag.getMonth();
  if (soort === "Maand") return [iso(new Date(j, m, 1)), iso(new Date(j, m + 1, 0))];
  if (soort === "Kwartaal") { const k = m - (m % 3); return [iso(new Date(j, k, 1)), iso(new Date(j, k + 3, 0))]; }
  return [`${j}-01-01`, `${j}-12-31`];
}

const komma = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const cel = (t: string | number) => {
  const s = String(t ?? "");
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Alle regels als CSV (puntkomma, Nederlandse komma), voor je boekhouder of Excel. */
export function csv(posten: Post[]): string {
  const regels = [["Datum", "Soort", "Klant", "Omschrijving", "Categorie", "Bedrag incl. btw", "Btw %", "Btw"]];
  for (const p of [...posten].sort((a, b) => (a.datum + String(a.id).padStart(12, "0")).localeCompare(b.datum + String(b.id).padStart(12, "0")))) {
    regels.push([p.datum, SOORT_NAAM[p.soort] ?? p.soort, p.klant, p.omschrijving, p.categorie, komma(p.bedrag), String(p.btw),
      komma(btwDeel(p.bedrag, p.btw))]);
  }
  // Excel wil formules in een cel niet uitvoeren als die met = + - @ begint; een apostrof ervoor houdt het tekst.
  const veilig = (t: string, i: number) => (i >= 2 && i <= 4 && /^[=+\-@]/.test(t) ? "'" + t : t);
  return "﻿" + regels.map((r) => r.map((t, i) => cel(veilig(t, i))).join(";")).join("\r\n") + "\r\n";
}

// --- Databasefuncties ----------------------------------------------------------------------------------------------

export const overzicht = (van: string, tot: string) => ik<Overzicht>("zaak_overzicht", { p_van: van, p_tot: tot });
export const nogAfvinken = (o: Overzicht) => o.afvinken.filter((b) => !b.afgevinkt);

export async function post(p: { soort: Post["soort"]; bedrag: number; omschrijving?: string; klant?: string;
  klant_id?: number | null; btw: number; categorie?: string; datum?: string }) {
  return (await ik<{ post: Post }>("zaak_post", { p_post: { omschrijving: "", klant: "", klant_id: null, categorie: "",
    datum: iso(new Date()), ...p } })).post;
}
export const postWeg = (id: number) => ik("zaak_post_weg", { p_id: id });
export const betalingOntvangen = (ids: number[], centen: number | null) =>
  ik<{ saldo: number }>("zaak_betaling_ontvangen", { p_ids: ids, p_bedrag: centen });
export const afvinken = (boeking: number, afvink: "" | "gekomen" | "niet_gekomen", rekenen: boolean, btw: number) =>
  ik<{ saldo: number }>("zaak_afvinken", { p_boeking: boeking, p_afvink: afvink, p_rekenen: rekenen, p_btw: btw });

export const lessen = async (van: string, tot: string) => (await ik<{ lessen: Les[] }>("zaak_lessen", { p_van: van, p_tot: tot })).lessen;
export const lesWeg = async (id: number, volgende: boolean) =>
  (await ik<{ aantal: number }>("zaak_les_weg", { p_id: id, p_volgende: volgende })).aantal;
export const deelnemerErbij = (les: number, wie: string) => ik("zaak_les_deelnemer", { p_les: les, p_wie: wie });
export const lesAfvinken = (deelnemer: number, afvink: "" | "gekomen" | "niet_gekomen", btw: number) =>
  ik("zaak_les_afvinken", { p_deelnemer: deelnemer, p_afvink: afvink, p_btw: btw });

/**
 * Een les maken. Leden vinden je lessen via je boekingspagina; heb je die nog niet, dan maken we hem (dicht), net als
 * de vorige app deed.
 */
export async function lesMaken(l: { naam: string; start: string; minuten: number; plekken: number; prijs: number;
  locatie: string; elkeWeek: boolean; aantal: number }, zaaknaam: string) {
  const { pagina } = await mijnPagina();
  if (!pagina) {
    const basis = linkNaam(zaaknaam) || "zaak";
    await paginaBewaren({ ...BOEK_STANDAARD, adres: `${basis.slice(0, 33)}-${Math.random().toString(36).slice(2, 6)}`, aan: false,
      titel: zaaknaam });
  }
  return (await ik<{ aantal: number }>("zaak_les_maken", { p_les: { naam: l.naam, start: l.start, minuten: l.minuten,
    plekken: l.plekken, prijs: l.prijs, locatie: l.locatie, herhaal: l.elkeWeek ? "week" : "", aantal: l.aantal } })).aantal;
}

export { iso as datumIso };
