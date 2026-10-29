// Sport en gezondheid: je trainingen (sportafspraken in je agenda), doelen, en wat sport- en gezondheidsapps
// binnenbrengen. Zelfde gegevens als de vorige app: afspraak.sport + afspraak.sport_resultaat, g.sportdoelen, en
// stappen en slaap per dag in instellingen.gezondheid_dagen. Koppelen gaat via de Edge Function `gezondheid`; de
// toegangscodes van Strava, Fitbit en de rest ziet de app nooit.
import { SLEUTEL, SUPABASE, alsIk, bijwerken, huidigeSessie, type Afspraak, type Gegevens } from "../api";
import { datumTekst, nuTekst, plusDagen } from "./tijd";

export type Resultaat = { minuten?: number; afstand_km?: number; gevoel?: number; notitie?: string; calorieen?: number;
  bron?: string };
export type SportAfspraak = Afspraak & { sport_resultaat?: Resultaat; extern_id?: string; strava_id?: number;
  tijden?: Record<string, string> };
export type Maatstaf = "keer_per_week" | "minuten_per_week" | "km_per_week" | "langste_km" | "totaal_km" | "eigen";
export type Doel = { id: number; omschrijving: string; sport: string; maatstaf: Maatstaf; doelwaarde: number;
  deadline: string; gestart: string; actief: boolean; eenheid?: string; stand?: number };
export type Dagwaarden = { datum: string; stappen?: number; slaap_min?: number; slaap_score?: number;
  rusthartslag?: number; bron?: string };

export const SPORTEN = ["american football", "atletiek", "badminton", "basketbal", "beachvolleybal", "bmx", "boksen",
  "boogschieten", "bootcamp", "boulderen", "calisthenics", "cricket", "crossfit", "dansen", "darten", "duiken", "fietsen",
  "fitness", "futsal", "golf", "handbal", "hardlopen", "hiken", "hockey", "honkbal", "ijshockey", "judo", "kanoën",
  "karate", "karten", "kickboksen", "kitesurfen", "klimmen", "korfbal", "krachttraining", "mma", "motorcross",
  "mountainbiken", "paardrijden", "padel", "parkour", "pilates", "roeien", "rugby", "schaatsen", "schaken", "schermen",
  "skateboarden", "skaten", "skiën", "snowboarden", "softbal", "spinning", "squash", "surfen", "tafeltennis",
  "taekwondo", "tennis", "touwtjespringen", "triatlon", "turnen", "volleybal", "voetbal", "wandelen", "wandelvoetbal",
  "waterpolo", "wielrennen", "worstelen", "yoga", "zeilen", "zwemmen"];

export const MAATSTAVEN: [Maatstaf, string, string][] = [
  ["keer_per_week", "Aantal keer per week", "keer deze week"],
  ["minuten_per_week", "Minuten per week", "minuten deze week"],
  ["km_per_week", "Kilometers per week", "km deze week"],
  ["langste_km", "Afstand in één keer (km)", "km in één keer"],
  ["totaal_km", "Kilometers bij elkaar", "km totaal"],
  ["eigen", "Zelf bijhouden (kilo's, rondes, tijd)", ""],
];

/** De Beweegrichtlijn van de Gezondheidsraad: minstens 150 minuten per week matig intensief bewegen. */
export const BEWEEGNORM = 150;
export const GEVOEL = ["Zwaar", "Pittig", "Goed", "Lekker", "Top"];

const isSport = (a: Afspraak) => Boolean((a as SportAfspraak).sport);
const minutenTussen = (van: string, tot: string) =>
  Math.max(0, Math.round((new Date(tot).getTime() - new Date(van).getTime()) / 60000));

/** Hoe lang er gesport is: ingevuld resultaat, anders de geplande duur, anders een uur. */
export function minuten(a: SportAfspraak) {
  if (a.sport_resultaat?.minuten) return a.sport_resultaat.minuten;
  if (a.einde?.includes("T") && a.start.includes("T")) return minutenTussen(a.start, a.einde);
  return 60;
}
export const km = (a: SportAfspraak) => a.sport_resultaat?.afstand_km ?? 0;

/** Sportafspraken die echt gedaan zijn: met resultaat, of de tijd is voorbij. */
export function gedaan(g: Gegevens, van: string, tot: string, sport = "", nu = new Date()) {
  const n = nuTekst(nu);
  return (g.afspraken as SportAfspraak[]).filter((a) => isSport(a) && (!sport || a.sport === sport)
    && a.start.slice(0, 10) >= van && a.start.slice(0, 10) <= tot && (a.sport_resultaat || a.tijden || a.start <= n));
}

export function overzicht(g: Gegevens, van: string, tot: string, nu = new Date()) {
  const lijst = gedaan(g, van, tot, "", nu);
  return { aantal: lijst.length, minuten: lijst.reduce((s, a) => s + minuten(a), 0),
    km: Math.round(lijst.reduce((s, a) => s + km(a), 0) * 10) / 10 };
}

/** Deze week (maandag tot nu), voor de beweegnorm. */
export function dezeWeek(g: Gegevens, nu = new Date()) {
  const maandag = plusDagen(nu, -((nu.getDay() + 6) % 7));
  return overzicht(g, datumTekst(maandag), datumTekst(nu), nu);
}

export const doelen = (g: Gegevens) => ((g.sportdoelen as Doel[] | undefined) ?? []).filter((d) => d.actief !== false);

export function voortgang(g: Gegevens, d: Doel, nu = new Date()) {
  const vandaag = datumTekst(nu);
  const maandag = datumTekst(plusDagen(nu, -((nu.getDay() + 6) % 7)));
  const lijst = d.maatstaf === "eigen" ? [] : gedaan(g, d.maatstaf.endsWith("_per_week") ? maandag : d.gestart, vandaag, d.sport, nu);
  const huidig = {
    eigen: d.stand ?? 0,
    keer_per_week: lijst.length,
    minuten_per_week: lijst.reduce((s, a) => s + minuten(a), 0),
    km_per_week: lijst.reduce((s, a) => s + km(a), 0),
    langste_km: Math.max(0, ...lijst.map(km)),
    totaal_km: lijst.reduce((s, a) => s + km(a), 0),
  }[d.maatstaf];
  const rond = Math.round(huidig * 10) / 10;
  const eenheid = d.maatstaf === "eigen" ? d.eenheid ?? "" : MAATSTAVEN.find(([m]) => m === d.maatstaf)![2];
  const procent = d.doelwaarde ? Math.min(100, Math.round((100 * huidig) / d.doelwaarde)) : 0;
  const dagen = d.deadline ? Math.round((new Date(`${d.deadline}T12:00`).getTime() - new Date(`${vandaag}T12:00`).getTime()) / 86_400_000) : null;
  return { huidig: rond, procent, tekst: `${rond} van ${d.doelwaarde} ${eenheid}`.trim(), dagen };
}

export function doelMaken(g: Gegevens, d: Omit<Doel, "id" | "gestart" | "actief">) {
  const doel: Doel = { ...d, id: g.volgend_id, sport: d.sport.trim().toLowerCase(), gestart: datumTekst(new Date()), actief: true,
    ...(d.maatstaf === "eigen" ? { eenheid: (d.eenheid ?? "").slice(0, 40), stand: 0 } : {}) };
  g.volgend_id += 1;
  g.sportdoelen = [...((g.sportdoelen as Doel[] | undefined) ?? []), doel];
  return doel;
}

export function doelBijwerken(g: Gegevens, id: number, w: Partial<Pick<Doel, "stand" | "actief">>) {
  const d = ((g.sportdoelen as Doel[] | undefined) ?? []).find((x) => x.id === id);
  if (d) Object.assign(d, w);
  return d;
}

/** Trainingen plannen in je agenda, eventueel elke week. Geeft de nieuwe ids. */
export function plannen(g: Gegevens, sport: string, start: string, duur: number, weken = 1, waar = "") {
  const naam = sport.trim().toLowerCase();
  const ids: number[] = [];
  for (let w = 0; w < Math.min(26, Math.max(1, weken)); w += 1) {
    const begin = new Date(start);
    begin.setDate(begin.getDate() + 7 * w);
    const einde = new Date(begin.getTime() + duur * 60000);
    const id = g.volgend_id;
    g.volgend_id += 1;
    g.afspraken.push({ id, titel: naam.charAt(0).toUpperCase() + naam.slice(1), start: nuTekst(begin), einde: nuTekst(einde),
      locatie: waar.trim(), soort: "sport", sport: naam, notitie: "" });
    ids.push(id);
  }
  return ids;
}

export function vastleggen(g: Gegevens, id: Afspraak["id"], r: Resultaat) {
  const a = (g.afspraken as SportAfspraak[]).find((x) => x.id === id);
  if (!a) return false;
  a.sport_resultaat = Object.fromEntries(Object.entries({ ...a.sport_resultaat, ...r }).filter(([, w]) => w)) as Resultaat;
  return true;
}

/** Sporttrainingen van vandaag die voorbij zijn en nog geen resultaat hebben: daar vragen we "hoe ging het?". */
export function zonderResultaat(g: Gegevens, nu = new Date()) {
  const vandaag = datumTekst(nu), n = nuTekst(nu);
  return (g.afspraken as SportAfspraak[]).filter((a) => isSport(a) && !a.sport_resultaat && a.start.slice(0, 10) === vandaag
    && a.start.includes("T") && (a.einde ?? a.start) <= n);
}

export type Gepland = { start: string; titel: string; sport: string; minuten: number; waar: string;
  soort: "eigen" | "boeking" | "les"; bij?: string; status?: string; id?: Afspraak["id"] };

const lokaalMoment = (iso: string) => nuTekst(new Date(iso));

/** Komende trainingen: eigen sportafspraken en (als je die hebt) boekingen en groepslessen bij anderen. */
export function gepland(g: Gegevens, extra: Gepland[] = [], dagen = 14, nu = new Date()): Gepland[] {
  const van = nuTekst(new Date(nu.getTime() - 3600_000)), tot = `${datumTekst(plusDagen(nu, dagen))}T23:59`;
  const eigen: Gepland[] = (g.afspraken as SportAfspraak[])
    .filter((a) => (isSport(a) || a.soort === "sport") && !a.sport_resultaat && a.start >= van && a.start <= tot)
    .map((a) => ({ start: a.start, titel: a.titel, sport: a.sport ?? "", minuten: minuten(a), waar: a.locatie ?? "",
      soort: "eigen", id: a.id }));
  const gezien = new Set<string>();
  return [...eigen, ...extra.filter((t) => t.start <= tot)]
    .sort((a, b) => a.start.localeCompare(b.start) || (a.soort === "eigen" ? -1 : 1))
    .filter((t) => { const k = `${t.start}|${t.titel.toLowerCase()}`; if (gezien.has(k)) return false; gezien.add(k); return true; });
}

export async function geboekt(): Promise<Gepland[]> {
  try {
    const m = await alsIk<{ boekingen?: { soort: string; start: string; minuten: number; status: string; bij: string; locatie: string }[];
      lessen?: { naam: string; start: string; minuten: number; status: string; bij: string; locatie: string }[] }>("mijn_trainingen");
    return [
      ...(m.boekingen ?? []).map((b): Gepland => ({ start: lokaalMoment(b.start), titel: b.soort, sport: sportNl(b.soort),
        minuten: b.minuten, waar: b.locatie, soort: "boeking", bij: b.bij, status: b.status })),
      ...(m.lessen ?? []).map((l): Gepland => ({ start: lokaalMoment(l.start), titel: l.naam, sport: sportNl(l.naam),
        minuten: l.minuten, waar: l.locatie, soort: "les", bij: l.bij, status: l.status })),
    ];
  } catch {
    return [];
  }
}

// --- Namen uit andere apps -------------------------------------------------------------------------------------

const ENGELS: [string, string][] = [["trail", "hardlopen"], ["run", "hardlopen"], ["jog", "hardlopen"], ["hardlo", "hardlopen"],
  ["mountain", "mountainbiken"], ["mtb", "mountainbiken"], ["spin", "spinning"], ["ride", "fietsen"], ["cycl", "fietsen"],
  ["bik", "fietsen"], ["fiets", "fietsen"], ["swim", "zwemmen"], ["zwem", "zwemmen"], ["hik", "hiken"], ["walk", "wandelen"],
  ["wandel", "wandelen"], ["yoga", "yoga"], ["pilates", "pilates"], ["row", "roeien"], ["roei", "roeien"], ["padel", "padel"],
  ["tennis", "tennis"], ["squash", "squash"], ["badminton", "badminton"], ["soccer", "voetbal"], ["football", "voetbal"],
  ["voetbal", "voetbal"], ["basket", "basketbal"], ["volley", "volleybal"], ["hockey", "hockey"], ["golf", "golf"],
  ["ski", "skiën"], ["snowboard", "snowboarden"], ["skat", "schaatsen"], ["climb", "klimmen"], ["boulder", "boulderen"],
  ["box", "boksen"], ["danc", "dansen"], ["crossfit", "crossfit"], ["strength", "krachttraining"], ["weight", "krachttraining"],
  ["kracht", "krachttraining"], ["hiit", "fitness"], ["workout", "fitness"], ["training", "fitness"], ["elliptic", "fitness"],
  ["stair", "fitness"], ["gym", "fitness"], ["fitness", "fitness"], ["kayak", "kanoën"], ["canoe", "kanoën"], ["surf", "surfen"],
  ["sail", "zeilen"]];

export function sportNl(ruw: string) {
  const t = (ruw ?? "").toLowerCase().replace(/[^a-zë]+/g, " ").trim();
  if (SPORTEN.includes(t)) return t;
  const plat = t.replace(/ /g, "");
  return ENGELS.find(([stukje]) => plat.includes(stukje))?.[1] ?? (t.slice(0, 40) || "sport");
}

// --- Binnenhalen uit apps en bestanden --------------------------------------------------------------------------

export type Binnen = { id: string; naam?: string; start: string; sport?: string; minuten?: number; afstand_km?: number;
  calorieen?: number; bron?: string };

/**
 * Trainingen uit een app of bestand in je agenda zetten: bij een sportafspraak die rond die tijd (2 uur) begon, of als
 * nieuwe sportafspraak. Dubbel binnenkomen kan niet (extern_id). Stappen en slaap per dag, hooguit 60 dagen terug.
 */
export function verwerken(g: Gegevens, trainingen: Binnen[], dagen: Dagwaarden[], bron: string, nu = new Date()) {
  let nieuw = 0;
  const lijst = g.afspraken as SportAfspraak[];
  for (const t of trainingen) {
    const start = String(t.start ?? "").slice(0, 16);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start) || !t.id) continue;
    const id = String(t.id);
    if (lijst.some((a) => a.extern_id === id)) continue;
    const sport = sportNl(t.sport || t.naam || "");
    const r: Resultaat = Object.fromEntries(Object.entries({ minuten: Math.round(Number(t.minuten) || 0),
      afstand_km: Math.round((Number(t.afstand_km) || 0) * 10) / 10, calorieen: Math.round(Number(t.calorieen) || 0),
      bron: t.bron || bron }).filter(([, w]) => w)) as Resultaat;
    const moment = new Date(start).getTime();
    const bestaand = lijst.find((a) => a.sport && a.start.includes("T") && !a.strava_id && !a.extern_id
      && Math.abs(new Date(a.start).getTime() - moment) <= 2 * 3600_000);
    if (bestaand) {
      bestaand.extern_id = id;
      bestaand.sport_resultaat = { ...bestaand.sport_resultaat, ...r };
    } else {
      const naam = (t.naam ?? "").trim() || sport.charAt(0).toUpperCase() + sport.slice(1);
      g.afspraken.push({ id: g.volgend_id, titel: naam.slice(0, 80), start, einde: nuTekst(new Date(moment + (r.minuten ?? 0) * 60000)),
        notitie: "", locatie: "", sport, sport_resultaat: r, extern_id: id } as SportAfspraak);
      g.volgend_id += 1;
    }
    nieuw += 1;
  }
  if (dagen.length) {
    g.instellingen ??= {};
    const bewaard = { ...((g.instellingen.gezondheid_dagen as Record<string, Omit<Dagwaarden, "datum">> | undefined) ?? {}) };
    for (const d of dagen) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(d.datum ?? ""))) continue;
      const w = Object.fromEntries((["stappen", "slaap_min", "slaap_score", "rusthartslag"] as const)
        .filter((k) => typeof d[k] === "number" && d[k]! > 0).map((k) => [k, Math.round(d[k]!)]));
      if (Object.keys(w).length) bewaard[d.datum] = { ...bewaard[d.datum], ...w, bron: d.bron || bron };
    }
    const grens = datumTekst(plusDagen(nu, -60));
    g.instellingen.gezondheid_dagen = Object.fromEntries(Object.entries(bewaard).filter(([k]) => k >= grens).sort());
  }
  return nieuw;
}

/** Stappen en slaap van de laatste dagen, nieuwste eerst. */
export function dagwaarden(g: Gegevens, aantal = 7): Dagwaarden[] {
  const b = (g.instellingen?.gezondheid_dagen as Record<string, Omit<Dagwaarden, "datum">> | undefined) ?? {};
  return Object.entries(b).sort(([a], [c]) => c.localeCompare(a)).slice(0, aantal).map(([datum, w]) => ({ datum, ...w }));
}

// --- Koppelingen ------------------------------------------------------------------------------------------------

export const AANBIEDERS: Record<string, [string, string]> = {
  strava: ["Strava", "Trainingen. Neemt ook over van Garmin, Apple Watch, Wahoo, Zwift, Suunto en COROS."],
  fitbit: ["Fitbit", "Trainingen, stappen en slaap. Ook Google Pixel Watch."],
  polar: ["Polar", "Trainingen van je Polar-horloge."],
  withings: ["Withings", "Trainingen, stappen en slaap."],
  oura: ["Oura", "Trainingen, stappen en slaap van je ring."],
};

export type Koppeling = { id: number; aanbieder: string; status: "actief" | "verlopen"; naam: string; laatst_opgehaald: string | null };
export type Status = { aan: string[]; koppelingen: Koppeling[]; inzendadres: boolean; eigenaar: boolean;
  ingesteld?: Record<string, boolean> | null };

export async function status(): Promise<Status> {
  const s = await alsIk<Partial<Status>>("gezondheid_status");
  return { aan: s.aan ?? [], koppelingen: s.koppelingen ?? [], inzendadres: !!s.inzendadres, eigenaar: !!s.eigenaar,
    ingesteld: s.ingesteld ?? null };
}

async function functie<T>(actie: string, velden: Record<string, unknown> = {}): Promise<T> {
  const s = huidigeSessie();
  if (!s) throw new Error("Log opnieuw in.");
  let a: T & { fout?: string };
  try {
    const r = await fetch(`${SUPABASE}/functions/v1/gezondheid`, { method: "POST",
      headers: { "content-type": "application/json", apikey: SLEUTEL },
      body: JSON.stringify({ actie, naam: s.naam, wachtwoord: s.token, ...velden }) });
    a = await r.json();
  } catch {
    throw new Error("De koppeling is even niet bereikbaar. Probeer het later opnieuw.");
  }
  if (a.fout) throw new Error(a.fout);
  return a;
}

/** De link om in te loggen bij de app. Daarna kom je terug op de app met ?code=...&state=gz.... */
export const koppelLink = async (aanbieder: string) => (await functie<{ url: string }>("starten", { aanbieder })).url;
export const ontkoppelen = (aanbieder: string) => functie("ontkoppelen", { aanbieder });

/** Nieuwe trainingen en dagwaarden van een gekoppelde app ophalen. Geeft het aantal nieuwe trainingen. */
export async function ophalen(aanbieder: string, dagen = 14) {
  const a = await functie<{ trainingen?: Binnen[]; dagen?: Dagwaarden[] }>("ophalen", { aanbieder, dagen });
  let nieuw = 0;
  if (a.trainingen?.length || a.dagen?.length) {
    await bijwerken((g) => { nieuw = verwerken(g, a.trainingen ?? [], a.dagen ?? [], AANBIEDERS[aanbieder]?.[0] ?? aanbieder); });
  }
  return nieuw;
}

/** Terug van inloggen bij een sportapp: de code uit het adres (in de Streamlit-app op het venster eromheen). */
export function terugkomst(): { code: string; staat: string; venster: Window } | null {
  for (const venster of [window, window.parent]) {
    try {
      const q = new URLSearchParams(venster.location.search);
      const staat = q.get("state") ?? "";
      if (staat.startsWith("gz.")) return { code: q.get("code") ?? "", staat, venster };
    } catch {
      /* ander adres */
    }
  }
  return null;
}

export function terugkomstWeg(venster: Window) {
  const u = new URL(venster.location.href);
  for (const k of ["code", "state", "error", "error_description", "scope"]) u.searchParams.delete(k);
  venster.history.replaceState(null, "", u.toString());
}

/** Koppeling vastleggen en meteen de laatste 30 dagen ophalen. */
export async function afmaken(code: string, staat: string) {
  const k = await functie<{ aanbieder: string }>("afmaken", { code, staat });
  let nieuw = 0;
  try {
    nieuw = await ophalen(k.aanbieder, 30);
  } catch {
    /* koppelen lukte; ophalen komt later vanzelf */
  }
  return { naam: AANBIEDERS[k.aanbieder]?.[0] ?? k.aanbieder, nieuw };
}

export async function inzendcodeMaken() {
  const a = await alsIk<{ code?: string; fout?: string }>("gezondheid_inzendcode_maken");
  if (a.fout || !a.code) throw new Error(a.fout || "Dat lukte niet.");
  return `${SUPABASE}/functions/v1/gezondheid?code=${a.code}`;
}
export const inzendcodeStoppen = () => alsIk("gezondheid_inzendcode_stoppen");

/** Wat een app (zoals Health Auto Export) sinds de vorige keer instuurde, in je agenda en dagoverzicht zetten. */
export async function ingezondenVerwerken(g: Gegevens) {
  const na = (g.instellingen?.gezondheid_ingezonden_tot as string | undefined) ?? null;
  const a = await alsIk<{ items?: { soort: string; bron: string; sleutel: string; inhoud: Record<string, unknown>; ontvangen: string }[] }>(
    "gezondheid_ingezonden", { p_na: na });
  const items = a.items ?? [];
  if (!items.length) return 0;
  const trainingen = items.filter((i) => i.soort === "training")
    .map((i) => ({ ...i.inhoud, id: i.sleutel.replace(/^training:/, "inzenden:"), bron: i.bron }) as Binnen);
  const dagen = items.filter((i) => i.soort === "dag").map((i) => ({ ...i.inhoud, bron: i.bron }) as Dagwaarden);
  let nieuw = 0;
  await bijwerken((x) => {
    nieuw = verwerken(x, trainingen, dagen, items[items.length - 1].bron || "App");
    x.instellingen ??= {};
    x.instellingen.gezondheid_ingezonden_tot = items[items.length - 1].ontvangen;
  });
  return nieuw;
}

export async function appInstellen(aanbieder: string, clientId: string, geheim: string) {
  const a = await alsIk<{ ok?: boolean; fout?: string }>("gezondheid_app_instellen", { p_aanbieder: aanbieder,
    p_client_id: clientId.replace(/\s/g, ""), p_client_secret: geheim.replace(/\s/g, "") });
  if (a.fout) throw new Error(a.fout);
}

let laatsteKeer = 0;
/** Op de achtergrond bijhalen, hooguit eens per 10 minuten, en per app hooguit eens per 2 uur. Wacht nergens op. */
export async function vanzelf(g: Gegevens) {
  if (Date.now() - laatsteKeer < 600_000) return 0;
  laatsteKeer = Date.now();
  let nieuw = 0;
  try {
    const s = await status();
    for (const k of s.koppelingen) {
      if (k.status !== "actief" || (k.laatst_opgehaald && Date.now() - new Date(k.laatst_opgehaald).getTime() < 2 * 3600_000)) continue;
      nieuw += await ophalen(k.aanbieder).catch(() => 0);
    }
    if (s.inzendadres) nieuw += await ingezondenVerwerken(g).catch(() => 0);
  } catch {
    /* geen koppelingen of offline: niets aan de hand */
  }
  return nieuw;
}
