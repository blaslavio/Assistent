// Praat met dezelfde database als de oude app (Supabase). Alles gaat via databasefuncties die zelf controleren
// wie je bent; de publieke sleutel hieronder geeft verder nergens toegang toe.
export const SUPABASE = import.meta.env.VITE_SUPABASE ?? "https://lnjsekmlpjyiwdlzcowa.supabase.co";
const SLEUTEL = "sb_publishable_Bq-K3J6yt0-B-mHWYj-tnQ_DWD0c9KX";
const APPARAAT_SLEUTEL = "assistent.apparaat";

export class GeenToegang extends Error {}

export async function rpc<T = unknown>(functie: string, parameters: Record<string, unknown> = {}): Promise<T> {
  const r = await fetch(`${SUPABASE}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SLEUTEL, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`Even geen verbinding (${r.status}).`);
  return r.status === 204 ? (null as T) : r.json();
}

export type Sessie = { naam: string; token: string };

let sessie: Sessie | null = null;

export function huidigeSessie() {
  return sessie;
}

export async function alsIk<T = Record<string, unknown>>(functie: string, parameters: Record<string, unknown> = {}) {
  if (!sessie) throw new GeenToegang();
  const antwoord = await rpc<T>(functie, { p_naam: sessie.naam, p_wachtwoord: sessie.token, ...parameters });
  if (antwoord && typeof antwoord === "object" && (antwoord as { geen_toegang?: boolean }).geen_toegang) {
    sessie = null;
    throw new GeenToegang();
  }
  return antwoord;
}

function apparaatNaam() {
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
  if (a.token) {
    sessie = { naam: a.naam ?? naam.trim(), token: a.token };
    if (onthouden) {
      const r = await alsIk<{ token?: string }>("apparaat_onthouden", { p_apparaat: apparaatNaam() });
      if (r.token) schrijf(APPARAAT_SLEUTEL, r.token);
    }
  }
  return a;
}

/** Weer ingelogd met de sleutel die dit apparaat bewaarde. */
export async function terugkomen(): Promise<boolean> {
  const token = lees(APPARAAT_SLEUTEL);
  if (!token) return false;
  try {
    const a = await rpc<Inlogantwoord>("apparaat_inloggen", { p_token: token, p_apparaat: apparaatNaam() });
    if (a.token) {
      sessie = { naam: a.naam ?? "", token: a.token };
      return true;
    }
  } catch {
    return false;
  }
  schrijf(APPARAAT_SLEUTEL, null);
  return false;
}

export async function uitloggen() {
  const token = lees(APPARAAT_SLEUTEL);
  try {
    if (token) await rpc("apparaat_vergeten", { p_token: token });
    if (sessie) await alsIk("uitloggen");
  } catch {
    /* lokaal uitloggen lukt altijd */
  }
  schrijf(APPARAAT_SLEUTEL, null);
  sessie = null;
}

// --- Gegevens ----------------------------------------------------------------------------------------------------

export type Afspraak = {
  id: number | string; titel: string; start: string; einde?: string | null; locatie?: string; soort?: string;
  sport?: string; notitie?: string; extern?: boolean;
};
export type Taak = { id: number; titel: string; deadline?: string | null; klaar: boolean; prioriteit?: string };
export type Gegevens = {
  taken: Taak[]; afspraken: Afspraak[]; volgend_id: number;
  instellingen?: { thuisadres?: string; avatar?: { naam?: string; foto?: string } } & Record<string, unknown>;
} & Record<string, unknown>;
export type Gebruiker = { id: number; naam: string | null; weergavenaam?: string; email?: string; foto?: string };

export async function gegevensLaden(): Promise<{ gebruiker: Gebruiker; data: Gegevens }> {
  const a = await alsIk<{ gebruiker: Gebruiker; data: Partial<Gegevens> }>("mijn_gegevens");
  return { gebruiker: a.gebruiker, data: { taken: [], afspraken: [], volgend_id: 1, ...(a.data ?? {}) } as Gegevens };
}

/** Haalt eerst de nieuwste gegevens op, past ze aan en bewaart ze: zo gaat er niets verloren van elders. */
export async function bijwerken(aanpassen: (g: Gegevens) => void): Promise<Gegevens> {
  const { data } = await gegevensLaden();
  aanpassen(data);
  const ok = await alsIk<boolean>("mijn_gegevens_bewaren", { p_data: data });
  if (!ok) throw new GeenToegang();
  return data;
}
