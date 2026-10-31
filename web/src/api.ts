// Praat met dezelfde database als de oude app (Supabase). Alles gaat via databasefuncties die zelf controleren
// wie je bent; de publieke sleutel hieronder geeft verder nergens toegang toe.
export const SUPABASE = import.meta.env.VITE_SUPABASE ?? "https://lnjsekmlpjyiwdlzcowa.supabase.co";
export const SLEUTEL = "sb_publishable_Bq-K3J6yt0-B-mHWYj-tnQ_DWD0c9KX";
const APPARAAT_SLEUTEL = "assistent.apparaat";
// Zo bewaarde de vorige app (Streamlit) zijn apparaatsleutel. Op dat adres kent de nieuwe app je daarmee ook meteen.
const VORIGE_SLEUTEL = "mijn-assistent-apparaat";
const apparaatToken = () => lees(APPARAAT_SLEUTEL) ?? lees(VORIGE_SLEUTEL);
// Waar de huidige app staat: naast de nieuwe op GitHub Pages, of het adres van de Streamlit-app als de nieuwe app daar
// in een pagina draait.
export const OUDE_APP = (globalThis as { OUDE_APP?: string }).OUDE_APP ?? "../";

export class GeenToegang extends Error {}
import * as snelstart from "./lib/snelstart";
import { TE_LANG, Verbindingsfout, isNetwerkfout, statusTekst } from "./lib/net";

// Een databasefunctie die alleen leest, mag bij een haperende verbinding één keer opnieuw: dubbel lezen kan geen kwaad.
const ALLEEN_LEZEN = /^(mijn_|.*_(bekijken|zoeken|lijst|overzicht|lezen|stand)$)/;
// Langer dan dit wachten op antwoord van de database heeft geen zin; ook een grote foto past er ruim in.
const WACHTTIJD = 45_000;

export async function rpc<T = unknown>(functie: string, parameters: Record<string, unknown> = {}): Promise<T> {
  const poging = async () => {
    const stop = new AbortController();
    const klok = setTimeout(() => stop.abort(), WACHTTIJD);
    try {
      return await fetch(`${SUPABASE}/rest/v1/rpc/${functie}`, {
        method: "POST",
        headers: { apikey: SLEUTEL, "Content-Type": "application/json" },
        body: JSON.stringify(parameters),
        signal: stop.signal,
      });
    } catch (e) {
      throw stop.signal.aborted ? new Verbindingsfout(TE_LANG) : isNetwerkfout(e) ? new Verbindingsfout() : e;
    } finally {
      clearTimeout(klok);
    }
  };
  let r: Response;
  try {
    r = await poging();
  } catch (e) {
    if (!(e instanceof Verbindingsfout) || !ALLEEN_LEZEN.test(functie) || navigator.onLine === false) throw e;
    await new Promise((klaar) => setTimeout(klaar, 1500));
    r = await poging();
  }
  if (!r.ok) throw Object.assign(new Error(statusTekst(r.status)), { status: r.status });
  return r.status === 204 ? (null as T) : r.json();
}

export type Sessie = { naam: string; token: string };

let sessie: Sessie | null = null;
// Tijdens de bliksemstart staat de vorige stand al op het scherm terwijl het inloggen nog loopt; wie dan al iets
// vraagt, wacht daarop. Lukte het niet door de verbinding, dan is dat een verbindingsfout en geen uitlogreden.
let sessieWacht: Promise<unknown> | null = null;
let startZonderVerbinding = false;

function zetSessie(nieuw: Sessie | null) {
  sessie = nieuw;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("assistent-sessie"));
}

export function huidigeSessie() {
  return sessie;
}

export async function alsIk<T = Record<string, unknown>>(functie: string, parameters: Record<string, unknown> = {}) {
  if (!sessie && sessieWacht) await sessieWacht;
  if (!sessie && startZonderVerbinding) throw new Verbindingsfout();
  if (!sessie) throw new GeenToegang();
  const account = sessie;
  const antwoord = await rpc<T>(functie, { ...parameters, p_naam: account.naam, p_wachtwoord: account.token });
  if (sessie !== account) throw new GeenToegang("Het account is intussen gewijzigd.");
  if (antwoord && typeof antwoord === "object" && (antwoord as { geen_toegang?: boolean }).geen_toegang) {
    zetSessie(null);
    throw new GeenToegang();
  }
  return antwoord;
}

export function apparaatNaam() {
  const ua = navigator.userAgent;
  return /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "Browser";
}

function lees(sleutel: string) {
  try {
    return localStorage.getItem(sleutel);
  } catch {
    return null;
  }
}

function schrijf(sleutel: string, waarde: string | null) {
  try {
    if (waarde === null) localStorage.removeItem(sleutel);
    else localStorage.setItem(sleutel, waarde);
  } catch {
    /* privévenster: dan blijf je niet ingelogd */
  }
}

export type Inlogantwoord = { token?: string; naam?: string; code_nodig?: boolean; fout?: string };

/** Inloggen met naam of mailadres en wachtwoord (en de code uit je app als tweestapsverificatie aan staat). */
export async function inloggen(naam: string, wachtwoord: string, code = "", onthouden = true): Promise<Inlogantwoord> {
  const a = await rpc<Inlogantwoord>("inloggen", {
    p_naam: naam.trim(), p_wachtwoord: wachtwoord, p_code: code, p_apparaat: apparaatNaam(),
  });
  if (a.token) await sessieStarten(a.naam ?? naam.trim(), a.token, onthouden);
  return a;
}

/** Na inloggen, een nieuw account of een herstelcode: de sessie gebruiken en dit apparaat onthouden. */
export async function sessieStarten(naam: string, token: string, onthouden = true) {
  zetSessie({ naam, token });
  if (onthouden) {
    const r = await alsIk<{ token?: string }>("apparaat_onthouden", { p_apparaat: apparaatNaam() });
    if (r.token) schrijf(APPARAAT_SLEUTEL, r.token);
  }
}

export type Staat = { gebruiker: Gebruiker; data: Gegevens };

/**
 * Bliksemstart. `vorige` geeft meteen de stand van de vorige keer (versleuteld op dit apparaat), `vers` logt weer in
 * met de sleutel van dit apparaat en haalt in één keer de nieuwste gegevens op: de stand, null (opnieuw inloggen)
 * of "offline" (geen verbinding; de vorige stand blijft staan).
 */
export function opstarten(): { vorige: Promise<Staat | null>; vers: Promise<Staat | null | "offline"> } {
  const overstap = new URLSearchParams(location.search).get("overstap");
  if (overstap) {
    adresOpruimen("overstap");
    const vers = overstapInwisselen(overstap).then((gelukt) => (gelukt ? opstarten().vers : null));
    sessieWacht = vers.catch(() => null).finally(() => { sessieWacht = null; });
    return { vorige: Promise.resolve(null), vers };
  }
  const token = apparaatToken();
  if (!token) return { vorige: Promise.resolve(null), vers: Promise.resolve(null) };
  const account = snelstart.accountVan(token).catch(() => "");
  const vorige = account.then((a) => (a ? snelstart.lezen(a) : null));
  startZonderVerbinding = false;
  const vers = (async (): Promise<Staat | null | "offline"> => {
    let a: Inlogantwoord & { gegevens?: RuweGegevens };
    try {
      try {
        a = await rpc("apparaat_start", { p_token: token, p_apparaat: apparaatNaam() });
      } catch (e) {
        // Een database zonder apparaat_start (nog niet bijgewerkt): de oude weg, in twee stappen.
        if ((e as { status?: number }).status !== 404) throw e;
        a = await rpc("apparaat_inloggen", { p_token: token, p_apparaat: apparaatNaam() });
      }
    } catch {
      startZonderVerbinding = true;
      return "offline";
    }
    if (!a.token) {
      schrijf(APPARAAT_SLEUTEL, null);
      schrijf(VORIGE_SLEUTEL, null);
      await snelstart.wissen();
      return null;
    }
    zetSessie({ naam: a.naam ?? "", token: a.token });
    if (a.gegevens && !(a.gegevens as { geen_toegang?: boolean }).geen_toegang) return netjes(a.gegevens);
    return gegevensLaden();
  })();
  sessieWacht = vers.catch(() => null).finally(() => { sessieWacht = null; });
  return { vorige, vers };
}

async function overstapInwisselen(code: string) {
  if (!/^overstap\.[0-9a-f]{48}$/.test(code)) return false;
  try {
    const r = await rpc<{ token?: string }>("overstap_inwisselen", { p_code: code, p_apparaat: apparaatNaam() });
    if (r.token) schrijf(APPARAAT_SLEUTEL, r.token);
    return !!r.token;
  } catch {
    return false;
  }
}

/**
 * In de app op het adres van de vorige app, binnen de web-app op het beginscherm: geef die web-app een eenmalige code,
 * zodat de app daar (sneller, ander adres) je meteen kent. Alleen als je hier ingelogd blijft, en alleen naar dat adres.
 */
export async function overstappen() {
  if (!/^https?:\/\//.test(OUDE_APP) || adresWaarde("schil") !== "1" || !apparaatToken() || !sessie) return;
  if (overgestapt) return;
  overgestapt = true;
  const r = await alsIk<{ code?: string }>("overstap_code");
  if (!r.code) return;
  window.top?.postMessage({ soort: "overstap", code: r.code }, "https://blaslavio.github.io");
}
let overgestapt = false;

/** Voor de volgende keer openen; alleen als je op dit apparaat ingelogd blijft. */
export async function momentopnameBewaren(s: Staat) {
  const token = apparaatToken();
  if (!token || !sessie) return;
  await snelstart.bewaren(s, await snelstart.accountVan(token));
}

export async function uitloggen() {
  try {
    for (const token of new Set([lees(APPARAAT_SLEUTEL), lees(VORIGE_SLEUTEL)])) {
      if (token) await rpc("apparaat_vergeten", { p_token: token });
    }
    if (sessie) await alsIk("uitloggen");
  } catch {
    /* lokaal uitloggen lukt altijd */
  }
  schrijf(APPARAAT_SLEUTEL, null);
  schrijf(VORIGE_SLEUTEL, null);
  zetSessie(null);
  await snelstart.wissen();
}

// --- Gegevens ----------------------------------------------------------------------------------------------------

export type Afspraak = {
  id: number | string; titel: string; start: string; einde?: string | null; locatie?: string; soort?: string;
  sport?: string; notitie?: string; extern?: boolean; kaartpunt?: {lat:number;lon:number};
  projectplanning?: { gesprek:number; aanpak:string; stap:string; opdracht:string };
};
export type Taak = { id: number; titel: string; deadline?: string | null; klaar: boolean; prioriteit?: string; notitie?: string;
  herhaal?: Herhaal | null };
export type Herhaal = "dag" | "week" | "maand";
export type Gegevens = {
  taken: Taak[]; afspraken: Afspraak[]; volgend_id: number;
  instellingen?: { thuisadres?: string; avatar?: { naam?: string; foto?: string } } & Record<string, unknown>;
} & Record<string, unknown>;
export type Gebruiker = { id: number; naam: string | null; weergavenaam?: string; email?: string; email_bevestigd?: boolean; foto?: string;
  heeft_foto?: boolean; foto_zichtbaar?: string; over?: string };

type RuweGegevens = { gebruiker: Gebruiker; data: Partial<Gegevens> };

export async function gegevensLaden(): Promise<{ gebruiker: Gebruiker; data: Gegevens }> {
  return netjes(await alsIk<RuweGegevens>("mijn_gegevens"));
}

function netjes(a: RuweGegevens): { gebruiker: Gebruiker; data: Gegevens } {
  const data = { taken: [], afspraken: [], contacten: [], leerdoelen: [], sportdoelen: [], volgend_id: 1,
    ...(a.data ?? {}) } as Gegevens;
  // Oudere gegevens kunnen een lijst missen of iets anders bevatten; dan begint die lijst leeg.
  if (!Array.isArray(data.taken)) data.taken = [];
  if (!Array.isArray(data.afspraken)) data.afspraken = [];
  if (!data.instellingen || typeof data.instellingen !== "object" || Array.isArray(data.instellingen)) data.instellingen = {};
  return { gebruiker: a.gebruiker ?? { id: 0, naam: null }, data };
}

/** Eén versiegebonden opslag; bij een conflict nooit automatisch nogmaals wijzigen. */
export async function bijwerken(aanpassen: (g: Gegevens) => void): Promise<Gegevens> {
  const account = sessie;
  const antwoord = await alsIk<{ data: Partial<Gegevens> }>("mijn_gegevens");
  const basis = { taken: [], afspraken: [], contacten: [], leerdoelen: [], sportdoelen: [], volgend_id: 1,
    ...(antwoord.data ?? {}) } as Gegevens;
  const data = structuredClone(basis);
  if (sessie !== account) throw new GeenToegang("Het account is intussen gewijzigd.");
  aanpassen(data);
  const r = await alsIk<{ ok?: boolean; conflict?: boolean }>("mijn_gegevens_veilig_bewaren", { p_basis: basis, p_data: data });
  if (r.conflict) throw new Error("De gegevens zijn elders gewijzigd. Vernieuw en controleer je keuze.");
  if (r.ok !== true) throw new Error("Opslaan is niet bevestigd. Vernieuw voordat je opnieuw probeert.");
  return data;
}

/** Past je instellingen aan (bijvoorbeeld de stijl van de assistent) en bewaart ze meteen. */
export async function instellingenBijwerken(aanpassen: (inst: Record<string, unknown>) => void) {
  return bijwerken((g) => {
    g.instellingen ??= {};
    aanpassen(g.instellingen as Record<string, unknown>);
  });
}

/** Je weergavenaam wijzigen. Geeft een foutmelding, of niets als het lukte. */
export async function weergavenaamWijzigen(naam: string) {
  const a = await alsIk<{ fout?: string }>("profiel_bijwerken",
    { p_nieuwe_naam: null, p_weergavenaam: naam, p_nieuw_wachtwoord: null });
  return a?.fout ?? "";
}

/** Een waarde uit het adres (?naam=...). In de Streamlit-app staat het adres op het venster eromheen. */
export function adresWaarde(naam: string): string | null {
  for (const w of [window, window.parent]) {
    try {
      const v = new URLSearchParams(w.location.search).get(naam);
      if (v !== null) return v;
    } catch {
      /* ander adres */
    }
  }
  return null;
}

/** Haalt waarden uit het adres weg nadat de app ze gebruikt heeft, zodat herladen ze niet opnieuw uitvoert. */
export function adresOpruimen(...namen: string[]) {
  for (const w of [window, window.parent]) {
    try {
      const u = new URL(w.location.href);
      namen.forEach((n) => u.searchParams.delete(n));
      if (u.toString() !== w.location.href) w.history.replaceState(w.history.state, "", u.toString());
    } catch {
      /* ander adres */
    }
  }
}

/** Na "overal uitloggen" krijgt dit apparaat een nieuwe sleutel, zodat je hier ingelogd blijft. */
export async function ditApparaatOnthouden() {
  if (!apparaatToken()) return;
  const r = await alsIk<{ token?: string }>("apparaat_onthouden", { p_apparaat: apparaatNaam() });
  if (r.token) { schrijf(APPARAAT_SLEUTEL, r.token); schrijf(VORIGE_SLEUTEL, null); }
}
