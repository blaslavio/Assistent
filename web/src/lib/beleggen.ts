// Beleggen: je portefeuille en een volglijst met actuele koersen. Alleen meekijken en uitleg, nooit kopen of verkopen.
// Dezelfde gegevens als de vorige app (instellingen.beleggen) en dezelfde berekeningen (beleggen.py). Koersen komen via
// de functie "koersen" (de browser mag Yahoo Finance niet zelf vragen) en worden een halve minuut onthouden.
import { SLEUTEL, SUPABASE, huidigeSessie, instellingenBijwerken, type Gegevens } from "../api";

export const MARKTEN: Record<string, Record<string, string>> = {
  "Nederland en België": { "AEX": "^AEX", "AMX (middelgrote bedrijven)": "^AMX", "BEL 20": "^BFX" },
  "Europa": { "Euro Stoxx 50": "^STOXX50E", "DAX (Duitsland)": "^GDAXI", "CAC 40 (Frankrijk)": "^FCHI",
    "FTSE 100 (Verenigd Koninkrijk)": "^FTSE" },
  "Verenigde Staten": { "S&P 500": "^GSPC", "Nasdaq": "^IXIC", "Dow Jones": "^DJI" },
  "Azië": { "Nikkei 225 (Japan)": "^N225", "Hang Seng (Hongkong)": "^HSI" },
  "Wereld": { "Wereld (MSCI World)": "IWDA.AS", "Opkomende landen": "EMIM.AS" },
  "Grondstoffen": { "Goud": "GC=F", "Zilver": "SI=F", "Olie (Brent)": "BZ=F" },
  "Crypto": { "Bitcoin": "BTC-EUR", "Ethereum": "ETH-EUR" },
  "Valuta": { "Euro in dollar": "EURUSD=X", "Euro in pond": "EURGBP=X" },
};
export const MARKT: Record<string, string> = Object.assign({}, ...Object.values(MARKTEN));
export const STANDAARD_MARKTEN = ["AEX", "Wereld (MSCI World)", "S&P 500", "Nasdaq", "DAX (Duitsland)", "Goud", "Bitcoin",
  "Euro in dollar"];
export const SOORTEN: Record<string, string> = { ETF: "Indexfonds (ETF)", EQUITY: "Aandeel", MUTUALFUND: "Beleggingsfonds",
  CRYPTOCURRENCY: "Crypto", INDEX: "Index", CURRENCY: "Valuta", FUTURE: "Grondstof", BOND: "Obligatie" };
export const WAARSCHUWING = "Dit is uitleg, geen persoonlijk financieel advies. Beleggen kent risico's: je kunt (een deel van) "
  + "je inleg verliezen. De app koopt of verkoopt nooit iets.";

export type Koers = { symbool: string; prijs: number; valuta: string; vandaag_pct: number | null; maand_pct: number | null;
  verloop: number[]; soort: string; naam: string; tijd: number | null };
export type Positie = { id: string; symbool: string; naam: string; aantal: number; aankoopprijs: number; soort?: string;
  valuta?: string; eigen_koers?: number | null };
export type Volg = { symbool: string; naam: string; soort?: string };
export type Gevonden = { symbool: string; naam: string; beurs: string; soort: string };
export type Instellingen = { posities: Positie[]; volglijst: Volg[]; markten: string[] };

export function instellingen(data: Gegevens): Instellingen {
  const b = (data.instellingen?.beleggen ?? {}) as Partial<Instellingen>;
  return {
    posities: Array.isArray(b.posities) ? b.posities : [],
    volglijst: Array.isArray(b.volglijst) ? b.volglijst : [],
    markten: (Array.isArray(b.markten) ? b.markten : STANDAARD_MARKTEN).filter((m) => m in MARKT),
  };
}

function bewaren(velden: Partial<Instellingen>) {
  return instellingenBijwerken((i) => { i.beleggen = { ...((i.beleggen as object) ?? {}), ...velden }; });
}
const huidig = (g: Gegevens) => instellingen(g);

export const marktenKiezen = (namen: string[]) => bewaren({ markten: namen.filter((m) => m in MARKT) });

const nieuwId = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (b) => b.toString(16).padStart(2, "0")).join("");

/** Een belegging die je hebt (aankoopprijs per stuk, in euro's). */
export function positieToevoegen(p: { symbool: string; naam: string; aantal: number; aankoopprijs: number; soort?: string }) {
  const nieuw: Positie = { id: nieuwId(), symbool: p.symbool.trim().toUpperCase(), naam: p.naam.trim() || p.symbool.toUpperCase(),
    aantal: Number(p.aantal), aankoopprijs: Math.round(Number(p.aankoopprijs) * 1e4) / 1e4, soort: p.soort ?? "", valuta: "EUR" };
  return instellingenBijwerken((i) => {
    const b = huidig({ instellingen: i } as Gegevens);
    i.beleggen = { ...((i.beleggen as object) ?? {}), posities: [...b.posities, nieuw] };
  });
}

export function positieBijwerken(id: string, velden: Partial<Pick<Positie, "aantal" | "aankoopprijs" | "naam" | "eigen_koers">>) {
  return instellingenBijwerken((i) => {
    const b = huidig({ instellingen: i } as Gegevens);
    i.beleggen = { ...((i.beleggen as object) ?? {}), posities: b.posities.map((p) => (p.id === id ? { ...p, ...velden } : p)) };
  });
}

export const positieWeg = (id: string) => instellingenBijwerken((i) => {
  const b = huidig({ instellingen: i } as Gegevens);
  i.beleggen = { ...((i.beleggen as object) ?? {}), posities: b.posities.filter((p) => p.id !== id) };
});

export const volgen = (v: Volg) => instellingenBijwerken((i) => {
  const b = huidig({ instellingen: i } as Gegevens);
  const s = v.symbool.trim().toUpperCase();
  i.beleggen = { ...((i.beleggen as object) ?? {}), volglijst: [...b.volglijst.filter((x) => x.symbool !== s),
    { symbool: s, naam: v.naam.trim() || s, soort: v.soort ?? "" }] };
});

export const nietVolgen = (symbool: string) => instellingenBijwerken((i) => {
  const b = huidig({ instellingen: i } as Gegevens);
  i.beleggen = { ...((i.beleggen as object) ?? {}), volglijst: b.volglijst.filter((x) => x.symbool !== symbool.toUpperCase()) };
});

// --- Koersen ---------------------------------------------------------------------------------------------------------

function sleutel() {
  const s = huidigeSessie();
  if (!s) throw new Error("Log opnieuw in.");
  return "abo." + btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify([s.naam, s.token]))))
    .replace(/\+/g, "-").replace(/\//g, "_");
}

async function vraag<T>(body: Record<string, unknown>): Promise<T> {
  const r = await fetch(`${SUPABASE}/functions/v1/koersen`, {
    method: "POST", headers: { "content-type": "application/json", apikey: SLEUTEL, "x-api-key": sleutel() },
    body: JSON.stringify(body),
  });
  const a = await r.json().catch(() => ({ fout: "Koersen zijn even niet bereikbaar." }));
  if (a.fout) throw new Error(a.fout);
  return a as T;
}

const bewaard = new Map<string, [number, Koers | null]>();

/** Actuele koersen (een halve minuut onthouden). null als een koers niet te krijgen is. */
export async function koersen(symbolen: string[]): Promise<Record<string, Koers | null>> {
  const uniek = [...new Set(symbolen)];
  const nu = Date.now();
  const ophalen = uniek.filter((s) => { const b = bewaard.get(s); return !b || nu - b[0] > (b[1] ? 30_000 : 120_000); });
  if (ophalen.length) {
    const { koersen: k } = await vraag<{ koersen: Record<string, Koers | null> }>({ actie: "koersen", symbolen: ophalen });
    for (const s of ophalen) bewaard.set(s, [nu, k[s] ?? null]);
  }
  return Object.fromEntries(uniek.map((s) => [s, bewaard.get(s)?.[1] ?? null]));
}

export const bewaardeKoers = (symbool: string) => bewaard.get(symbool)?.[1] ?? null;

/** Zoekt een aandeel, ETF of crypto op naam of ticker. */
export async function zoeken(term: string): Promise<Gevonden[]> {
  if (!term.trim()) return [];
  return (await vraag<{ gevonden: Gevonden[] }>({ actie: "zoeken", term })).gevonden;
}

export function naarEuro(bedrag: number, valuta: string | undefined, wissel: Record<string, Koers | null>): number | null {
  if (!valuta || valuta === "EUR") return bedrag;
  if (valuta === "GBp") { bedrag /= 100; valuta = "GBP"; } // Londen noteert in pence
  const k = wissel[`EUR${valuta}=X`];
  return k && k.prijs ? bedrag / k.prijs : null;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export type Regel = Positie & { inleg: number; koers: number | null; eigen: boolean; vandaag_pct: number | null;
  maand_pct: number | null; verloop: number[]; waarde?: number; resultaat?: number; resultaat_pct?: number | null;
  aandeel_pct?: number | null };
export type Portefeuille = { posities: Regel[]; waarde: number; inleg: number; resultaat: number; resultaat_pct: number | null;
  vandaag: number; spreiding: Record<string, number>; let_op: string[]; zonder_koers: string[] };

/** Waarde, winst of verlies en spreiding van je beleggingen, in euro's. Zonder koersen: wat er bekend is. */
export function portefeuille(posities: Positie[], k: Record<string, Koers | null>, wissel: Record<string, Koers | null>): Portefeuille {
  let waarde = 0, inleg = 0, vandaag = 0;
  const regels: Regel[] = posities.map((p) => {
    const koers = k[p.symbool] ?? null;
    let prijs = koers ? naarEuro(koers.prijs, koers.valuta, wissel) : null;
    const eigen = prijs === null && !!p.eigen_koers;
    if (eigen) prijs = Number(p.eigen_koers);
    const inlegP = p.aantal * p.aankoopprijs;
    const regel: Regel = { ...p, inleg: r2(inlegP), koers: prijs !== null ? Math.round(prijs * 1e4) / 1e4 : null, eigen,
      soort: p.soort || koers?.soort || "", vandaag_pct: koers?.vandaag_pct ?? null, maand_pct: koers?.maand_pct ?? null,
      verloop: koers?.verloop ?? [] };
    if (prijs !== null) {
      const w = p.aantal * prijs;
      Object.assign(regel, { waarde: r2(w), resultaat: r2(w - inlegP), resultaat_pct: inlegP ? r2((w / inlegP - 1) * 100) : null });
      waarde += w;
      inleg += inlegP;
      if (regel.vandaag_pct !== null) vandaag += w - w / (1 + regel.vandaag_pct / 100);
    }
    return regel;
  });
  for (const r of regels) r.aandeel_pct = waarde && r.waarde ? Math.round((r.waarde / waarde) * 1000) / 10 : null;
  const spreiding: Record<string, number> = {};
  for (const r of regels) {
    if (!r.waarde) continue;
    const s = SOORTEN[r.soort ?? ""] ?? "Overig";
    spreiding[s] = (spreiding[s] ?? 0) + r.waarde;
  }
  const let_op: string[] = [];
  for (const r of regels) {
    if (r.aandeel_pct && r.aandeel_pct > 30 && regels.length > 1 && r.soort !== "ETF") {
      let_op.push(`${r.naam} is ${Math.round(r.aandeel_pct)}% van je portefeuille. Veel in één belegging maakt je gevoeliger voor tegenvallers.`);
    }
  }
  if (waarde > 0 && (spreiding.Crypto ?? 0) > 0.2 * waarde) let_op.push("Meer dan een vijfde zit in crypto. Dat kan hard op en neer gaan.");
  return { posities: regels, waarde: r2(waarde), inleg: r2(inleg), resultaat: r2(waarde - inleg),
    resultaat_pct: inleg ? r2((waarde / inleg - 1) * 100) : null, vandaag: r2(vandaag),
    spreiding: Object.fromEntries(Object.entries(spreiding).map(([s, w]) => [s, r2(w)])), let_op,
    zonder_koers: regels.filter((r) => r.koers === null).map((r) => r.naam) };
}

/** Haalt alle koersen op die de portefeuille nodig heeft (ook de wisselkoersen) en rekent hem uit. */
export async function portefeuilleOphalen(posities: Positie[]) {
  const k = await koersen(posities.map((p) => p.symbool)).catch(() => ({} as Record<string, Koers | null>));
  const valuta = [...new Set(Object.values(k).filter((v): v is Koers => !!v && v.valuta !== "EUR").map((v) => v.valuta))];
  const wissel = valuta.length ? await koersen(valuta.map((v) => `EUR${v === "GBp" ? "GBP" : v}=X`)).catch(() => ({})) : {};
  return portefeuille(posities, k, wissel);
}

export async function markt(namen: string[]) {
  const k = await koersen(namen.map((n) => MARKT[n]));
  return namen.map((n) => ({ ...(k[MARKT[n]] ?? {}), naam: n, symbool: MARKT[n] }) as Partial<Koers> & { naam: string; symbool: string });
}

export const euro = (x: number) => x.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
export const procent = (x: number | null | undefined) =>
  x === null || x === undefined ? "" : `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("nl-NL", { maximumFractionDigits: 2 })}%`;
export const prijsTekst = (x: number, valuta = "EUR") =>
  valuta === "GBp" ? `${x.toLocaleString("nl-NL", { maximumFractionDigits: 2 })}p`
    : x.toLocaleString("nl-NL", { style: "currency", currency: valuta.length === 3 ? valuta : "EUR", maximumFractionDigits: x < 10 ? 4 : 2 });
