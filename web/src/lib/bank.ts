// Bankkoppeling: af- en bijschrijvingen komen vanzelf in je budget, via Enable Banking (PSD2, alleen lezen).
// Je logt één keer in bij je eigen bank en geeft toestemming om mee te lezen. Geld overmaken kan via deze koppeling
// niet. De sleutel van Enable Banking zit alleen in de Edge Function `bank`; de app praat alleen met die functie.
import { SLEUTEL, SUPABASE, alsIk, huidigeSessie, instellingenBijwerken } from "../api";
import { appAdres } from "./bestellingen";
import { categorieRaden } from "./afschrift";

export type Koppeling = { id: number; bank: string; status: "actief" | "verlopen"; rekeningen: { iban: string; naam: string }[];
  geldig_tot: string | null; laatst_opgehaald: string | null; fout: string };
export type BankStatus = { aan: boolean; app_id_ingesteld: boolean; koppelingen: Koppeling[] };
export type Bank = { naam: string; logo: string };
type BankRegel = { datum: string; bedrag: number; omschrijving: string; tegenpartij: string; rekening: string; referentie: string;
  valuta?: string };

export const ELKE_UUR = 6;

async function functie<T>(actie: string, velden: Record<string, unknown> = {}): Promise<T> {
  const s = huidigeSessie();
  if (!s) throw new Error("Log opnieuw in.");
  const r = await fetch(`${SUPABASE}/functions/v1/bank`, {
    method: "POST", headers: { "content-type": "application/json", apikey: SLEUTEL },
    body: JSON.stringify({ actie, naam: s.naam, wachtwoord: s.token, ...velden }),
  });
  const a = await r.json().catch(() => ({ fout: "De bankkoppeling is even niet bereikbaar. Probeer het later opnieuw." }));
  if (a.fout) throw new Error(a.fout);
  return a as T;
}

export async function bankStatus(): Promise<BankStatus> {
  const r = await alsIk<Partial<BankStatus>>("bank_status");
  return { aan: !!r.aan, app_id_ingesteld: !!r.app_id_ingesteld, koppelingen: r.koppelingen ?? [] };
}

let bankenBewaard: { tijd: number; lijst: Bank[] } | null = null;
/** De banken die je kunt koppelen (een dag onthouden). */
export async function banken(): Promise<Bank[]> {
  if (bankenBewaard && Date.now() - bankenBewaard.tijd < 86400_000) return bankenBewaard.lijst;
  const { banken } = await functie<{ banken: Bank[] }>("banken", { land: "NL" });
  const lijst = [...banken].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  bankenBewaard = { tijd: Date.now(), lijst };
  return lijst;
}

/** Naar de inlogpagina van je bank. Daarna kom je terug in de app met ?code=...&state=... */
export async function koppelen(bank: string) {
  const { url } = await functie<{ url: string }>("koppelen", { bank, land: "NL", dagen: 180 });
  (window.top ?? window).location.href = url;
}

export const ontkoppelen = (id: number) => functie("ontkoppelen", { koppeling: id });

/** Alleen de eigenaar: het application ID en de .pem-sleutel van Enable Banking, plus het adres van de app. */
export async function bankInstellen(appId: string, sleutel: string) {
  const r = await alsIk<{ fout?: string; geen_toegang?: boolean }>("bank_platform_instellen",
    { p_app_id: appId.trim(), p_sleutel: sleutel.trim() });
  if (r.geen_toegang) throw new Error("Alleen de eigenaar kan dit instellen.");
  if (r.fout) throw new Error(r.fout);
  await alsIk("platform_instellen", { p_stripe_sleutel: "", p_webhook_geheim: "", p_app_adres: appAdres() });
}

// Python's hashlib.sha1, zodat de sleutels gelijk zijn aan die van de vorige app en niets dubbel binnenkomt.
async function sha1(tekst: string) {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(tekst));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function bankSleutel(r: BankRegel) {
  const basis = r.referentie || `${r.datum}|${r.bedrag}|${r.tegenpartij}|${r.omschrijving}`;
  return "bank:" + (await sha1(`${r.rekening}|${basis}`)).slice(0, 32);
}

type Bestaand = { datum: string; bedrag: number; bron?: string; tegenpartij?: string; omschrijving: string };

/** Staat deze regel er al via een ingelezen afschrift? Dan niet nog eens. */
export function alIngelezen(r: BankRegel, bestaand: Bestaand[]) {
  const naam = r.tegenpartij.toLowerCase().slice(0, 12);
  return bestaand.some((b) => b.datum === r.datum.slice(0, 10) && Math.abs(Number(b.bedrag) - r.bedrag) < 0.005
    && b.bron === "import" && (!naam || (b.tegenpartij || b.omschrijving).toLowerCase().includes(naam)));
}

const dag = (d: Date) => d.toISOString().slice(0, 10);

/** Nieuwe regels ophalen en in je budget zetten. Geeft het aantal nieuwe regels. */
export async function ophalen(k: Koppeling, regels: Record<string, string> = {}): Promise<number> {
  const laatst = k.laatst_opgehaald?.slice(0, 10);
  const vanaf = laatst ? dag(new Date(new Date(`${laatst}T12:00:00`).getTime() - 5 * 86400_000))
    : dag(new Date(Date.now() - 90 * 86400_000));
  const a = await functie<{ regels: BankRegel[]; saldi?: { bedrag: number }[] }>("ophalen", { koppeling: k.id, vanaf });
  const lijst = await alsIk<{ transacties?: Bestaand[] }>("transacties_lijst", { p_van: vanaf, p_tot: dag(new Date()) });
  const bestaand = lijst.transacties ?? [];
  const nieuw = [];
  for (const r of a.regels ?? []) {
    if (!r.datum || (r.valuta ?? "EUR") !== "EUR" || alIngelezen(r, bestaand)) continue;
    nieuw.push({ datum: r.datum.slice(0, 10), bedrag: r.bedrag, omschrijving: r.omschrijving, tegenpartij: r.tegenpartij,
      rekening: r.rekening, bron: "bank", categorie: categorieRaden(r.tegenpartij, r.omschrijving, r.bedrag, regels),
      sleutel: await bankSleutel(r) });
  }
  let aantal = 0;
  for (let i = 0; i < nieuw.length; i += 1000) {
    const t = await alsIk<{ nieuw?: number; fout?: string }>("transacties_toevoegen", { p_regels: nieuw.slice(i, i + 1000) });
    if (t.fout) throw new Error(t.fout);
    aantal += t.nieuw ?? 0;
  }
  if (a.saldi?.length) {
    const saldo = Math.round(a.saldi.reduce((s, x) => s + Number(x.bedrag), 0) * 100) / 100;
    await instellingenBijwerken((i) => { i.budget = { ...((i.budget as object) ?? {}), saldo, gebruikt: true }; });
  }
  return aantal;
}

/** Moet deze koppeling weer opgehaald worden? Elke zes uur, zolang de app open is. */
export const ophalenNodig = (k: Koppeling, nu = Date.now()) =>
  k.status === "actief" && (!k.laatst_opgehaald || nu - new Date(k.laatst_opgehaald).getTime() > ELKE_UUR * 3600_000);

/** Terug van de bank (?code=...&state=...): koppeling vastleggen en de eerste regels ophalen. */
export async function afmaken(code: string, staat: string, regels: Record<string, string> = {}) {
  const k = await functie<Koppeling>("afmaken", { code, staat });
  const nieuw = await ophalen({ ...k, laatst_opgehaald: null }, regels).catch(() => 0);
  return { bank: k.bank, nieuw };
}

// Na terugkeer van de bank opent de app meteen het budget.
let terug: { code: string; staat: string } | null = null;
export function terugVanBank(code: string | null, staat: string | null) {
  terug = code && staat && /^[\w-]{8,}$/.test(staat) ? { code, staat } : null;
  return terug !== null;
}
export function bankTerug() {
  const t = terug;
  terug = null;
  return t;
}
