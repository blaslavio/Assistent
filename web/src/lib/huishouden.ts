// Huishouden: een gezin, studentenhuis, samenwonen of vrienden. Samen een agenda (wie haalt, wie brengt),
// boodschappen, gedeelde kosten (wie krijgt nog wat) en een klussenrooster om de beurt. Zelfde databasefuncties als
// de vorige app (sql/gezin.sql en sql/huishouden.sql). Alleen leden die de uitnodiging accepteerden zien iets.
import { alsIk } from "../api";

export type Lid = { id: number; naam: string; status: "lid" | "uitgenodigd"; ik: boolean };
export type Huishouden = { id: number; naam: string; kinderen: string[]; status: "lid" | "uitgenodigd"; vorm: Vorm;
  tools: Hulpmiddel[]; door: string; leden: Lid[] };
export type Vorm = "gezin" | "studentenhuis" | "samenwonen" | "vrienden" | "anders";
export type Hulpmiddel = "agenda" | "boodschappen" | "kosten" | "klussen" | "sparen" | "budget";
export type Item = { id: number; titel: string; soort: Soort; start: string; minuten: number; locatie: string; voor: string;
  wie: number | null; wie_naam: string | null; notitie: string; door: number; door_naam: string };
export type Soort = "brengen" | "halen" | "afspraak" | "taak";
export type LijstItem = { id: number; tekst: string; klaar: boolean; door: string };
export type Kosten = { id: number; bedrag: number; omschrijving: string; categorie: string; datum: string; betaald_door: number;
  betaald_naam: string; terugbetaling: boolean; van_mij: boolean };
export type Saldo = { id: number; naam: string; saldo: number };
export type Klus = { id: number; titel: string; elke: "dag" | "week"; wie: number; wie_naam: string; daarna: string; klaar: boolean };

export const VORMEN: [Vorm, string][] = [["gezin", "Gezin"], ["studentenhuis", "Studentenhuis"], ["samenwonen", "Samenwonen"],
  ["vrienden", "Vrienden"], ["anders", "Anders"]];
export const HULPMIDDELEN: [Hulpmiddel, string][] = [["agenda", "Agenda"], ["boodschappen", "Boodschappen"],
  ["kosten", "Kosten delen"], ["klussen", "Klussen"]];
/** Wat we per vorm voorstellen; je kunt het altijd zelf aanpassen. */
export const STANDAARD: Record<Vorm, Hulpmiddel[]> = {
  gezin: ["agenda", "boodschappen", "klussen"], studentenhuis: ["boodschappen", "kosten", "klussen"],
  samenwonen: ["agenda", "boodschappen", "kosten"], vrienden: ["agenda", "kosten"], anders: ["agenda"],
};
export const SOORTEN: [Soort, string][] = [["brengen", "Brengen"], ["halen", "Halen"], ["afspraak", "Afspraak"], ["taak", "Klusje"]];

async function doe<T = Record<string, unknown>>(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await alsIk<T & { fout?: string }>(functie, parameters);
  if (r && typeof r === "object" && "fout" in r && r.fout) throw new Error(r.fout);
  return r;
}

export async function mijnHuishoudens(): Promise<Huishouden[]> {
  const r = await doe<{ gezinnen?: Huishouden[] }>("mijn_gezinnen");
  return (r.gezinnen ?? []).map((g) => ({ ...g, kinderen: g.kinderen ?? [], tools: g.tools ?? ["agenda"], leden: g.leden ?? [],
    vorm: g.vorm ?? "gezin" }));
}

export const maken = (naam: string, vorm: Vorm, deelnemers: string[], tools: Hulpmiddel[]) =>
  doe<{ id: number }>("huishouden_maken", { p_titel: naam.trim(), p_vorm: vorm, p_deelnemers: deelnemers.filter((d) => d.trim()), p_tools: tools });

export const instellen = (g: Huishouden, naam: string, vorm: Vorm, deelnemers: string[], tools: Hulpmiddel[]) =>
  doe("huishouden_instellen", { p_gezin: g.id, p_titel: naam.trim(), p_vorm: vorm, p_deelnemers: deelnemers.filter((d) => d.trim()),
    p_tools: [...tools, ...g.tools.filter((t) => t === "sparen" || t === "budget")], p_budget: {} });

export const uitnodigen = (id: number, gebruikersnaam: string) =>
  doe("gezin_uitnodigen", { p_gezin: id, p_gast: gebruikersnaam.trim().replace(/^@/, "") });

/** ja, nee of verlaten. */
export const antwoorden = (id: number, antwoord: "ja" | "nee" | "verlaten") => doe("gezin_antwoorden", { p_gezin: id, p_antwoord: antwoord });

// --- Agenda: wie haalt, wie brengt -----------------------------------------------------------------------------

const middernacht = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();

export async function agenda(id: number, dagen = 14): Promise<Item[]> {
  const nu = new Date();
  const tot = new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + dagen);
  const r = await doe<{ items?: Item[] }>("gezin_agenda", { p_gezin: id, p_van: middernacht(nu), p_tot: tot.toISOString() });
  return r.items ?? [];
}

export const itemOpslaan = (id: number, i: { titel: string; soort: Soort; start: Date; minuten: number; locatie: string; voor: string;
  wie: number | null; notitie?: string }, itemId: number | null = null) =>
  doe<{ item: Item }>("gezin_item_opslaan", { p_gezin: id, p_id: itemId, p_titel: i.titel.trim(), p_soort: i.soort,
    p_start: i.start.toISOString(), p_minuten: i.minuten, p_locatie: i.locatie.trim(), p_voor: i.voor.trim(), p_wie: i.wie,
    p_notitie: i.notitie ?? "" });

/** "Ik doe het", of juist teruggeven. */
export const oppakken = (itemId: number, ik: boolean) => doe("gezin_item_oppakken", { p_id: itemId, p_ik: ik });
export const itemWeg = (itemId: number) => alsIk("gezin_item_weg", { p_id: itemId });

/** Bijvoorbeeld "Halen Noor (school)" of "Tandarts Noor". */
export function omschrijving(i: Pick<Item, "soort" | "voor" | "titel">) {
  if (i.soort === "brengen" || i.soort === "halen") {
    const soort = SOORTEN.find(([k]) => k === i.soort)![1];
    return [soort, i.voor].filter(Boolean).join(" ") + (i.titel ? ` (${i.titel})` : "");
  }
  return [i.titel, i.voor].filter(Boolean).join(" ");
}

/** Wat aan jou is toegewezen, uit al je huishoudens: voor je eigen agenda en Vandaag. */
export async function mijnTaken(dagen = 14): Promise<(Item & { gezin: string })[]> {
  const nu = new Date();
  const r = await doe<{ items?: (Item & { gezin: string })[] }>("mijn_gezin_taken", { p_van: middernacht(nu),
    p_tot: new Date(nu.getFullYear(), nu.getMonth(), nu.getDate() + dagen).toISOString() });
  return r.items ?? [];
}

// --- Boodschappen -----------------------------------------------------------------------------------------------

export async function lijst(id: number): Promise<LijstItem[]> {
  return (await doe<{ items?: LijstItem[] }>("huis_lijst", { p_gezin: id })).items ?? [];
}
export const lijstBijwerken = (id: number, actie: "erbij" | "klaar" | "open" | "weg" | "klaar_weg", itemId: number | null = null, tekst = "") =>
  doe("huis_lijst_bijwerken", { p_gezin: id, p_id: itemId, p_tekst: tekst, p_actie: actie });

// --- Gedeelde kosten --------------------------------------------------------------------------------------------

export async function kosten(id: number): Promise<{ kosten: Kosten[]; saldo: Saldo[]; deze_maand: Record<string, number> }> {
  const r = await doe<{ kosten?: Kosten[]; saldo?: Saldo[]; deze_maand?: Record<string, number> }>("huis_kosten", { p_gezin: id });
  return { kosten: (r.kosten ?? []).map((k) => ({ ...k, bedrag: Number(k.bedrag) })),
    saldo: (r.saldo ?? []).map((s) => ({ ...s, saldo: Number(s.saldo) })), deze_maand: r.deze_maand ?? {} };
}

export const kostenToevoegen = (id: number, bedrag: number, omschrijving: string, betaaldDoor: number | null = null,
  terugbetaling = false, verdeeld: number[] = []) =>
  doe("huis_kosten_toevoegen", { p_gezin: id, p_bedrag: Math.round(bedrag * 100) / 100, p_omschrijving: omschrijving.trim(),
    p_categorie: "", p_datum: new Date().toISOString().slice(0, 10), p_betaald_door: betaaldDoor, p_verdeeld: verdeeld,
    p_terugbetaling: terugbetaling });

export const kostenWeg = (kostenId: number) => doe("huis_kosten_weg", { p_id: kostenId });

/** Zo min mogelijk overboekingen om quitte te spelen: wie betaalt wie hoeveel. */
export function verrekenen(saldo: Saldo[]): { van: Saldo; naar: Saldo; bedrag: number }[] {
  const krijgt = saldo.filter((s) => s.saldo > 0.005).map((s) => ({ ...s })).sort((a, b) => b.saldo - a.saldo);
  const moet = saldo.filter((s) => s.saldo < -0.005).map((s) => ({ ...s, saldo: -s.saldo })).sort((a, b) => b.saldo - a.saldo);
  const stappen = [];
  while (krijgt.length && moet.length) {
    const k = krijgt[0], m = moet[0];
    const bedrag = Math.round(Math.min(k.saldo, m.saldo) * 100) / 100;
    stappen.push({ van: m, naar: k, bedrag });
    k.saldo -= bedrag;
    m.saldo -= bedrag;
    if (k.saldo < 0.005) krijgt.shift();
    if (m.saldo < 0.005) moet.shift();
  }
  return stappen;
}

// --- Klussen om de beurt ----------------------------------------------------------------------------------------

export async function klussen(id: number): Promise<Klus[]> {
  return (await doe<{ klussen?: Klus[] }>("huis_klussen", { p_gezin: id })).klussen ?? [];
}
export const klusBijwerken = (id: number, actie: "maken" | "klaar" | "open" | "weg", klusId: number | null = null, titel = "",
  elke: "dag" | "week" = "week", volgorde: number[] = []) =>
  doe("huis_klus_bijwerken", { p_gezin: id, p_id: klusId, p_titel: titel.trim(), p_elke: elke, p_volgorde: volgorde, p_actie: actie });
