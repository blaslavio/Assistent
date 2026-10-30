/** Supabase beheert OAuth en PKCE; de app accepteert uitsluitend de bestaande server-gecontroleerde sessie. */
import { SUPABASE, SLEUTEL, huidigeSessie, apparaatNaam, sessieStarten, adresWaarde, adresOpruimen } from "../api";
import type { GoTrueClient } from "@supabase/auth-js";
export type Aanbieder = "google" | "apple" | "azure";
export const AANBIEDERS: { id: Aanbieder; naam: string }[] = [
  { id: "google", naam: "Google" }, { id: "apple", naam: "Apple" }, { id: "azure", naam: "Microsoft" },
];
const OPSLAG = "assistent.externe-auth";
const POGING = `${OPSLAG}.poging`;
const MISLUKT = "Aanmelden lukte niet. Probeer opnieuw of gebruik je mailadres en wachtwoord.";
let client: Promise<GoTrueClient> | undefined;
let afronden: Promise<void> | undefined;

async function metTijd(input: RequestInfo | URL, init?: RequestInit) {
  const stop = new AbortController();
  const afbreken = () => stop.abort();
  init?.signal?.addEventListener("abort", afbreken, { once: true });
  if (init?.signal?.aborted) stop.abort();
  const klok = setTimeout(afbreken, 20_000);
  try { return await fetch(input, { ...init, signal: stop.signal }); }
  finally { clearTimeout(klok); init?.signal?.removeEventListener("abort", afbreken); }
}
function auth() {
  return client ??= import("@supabase/auth-js").then(({ AuthClient }) => new AuthClient({
    url: `${SUPABASE}/auth/v1`, headers: { apikey: SLEUTEL },
    flowType: "pkce", persistSession: true, storage: sessionStorage, storageKey: OPSLAG,
    autoRefreshToken: false, detectSessionInUrl: false, fetch: metTijd,
  }));
}
function opruimen() {
  for (const key of [POGING, OPSLAG, `${OPSLAG}-code-verifier`, `${OPSLAG}-user`]) sessionStorage.removeItem(key);
}
export const isExterneTerugkomst = () => adresWaarde("aanmelding") === "extern";

async function controleerBackend() {
  const r = await metTijd(`${SUPABASE}/rest/v1/rpc/externe_aanmelding_status`, {
    method: "POST", headers: { apikey: SLEUTEL, "Content-Type": "application/json" }, body: "{}",
  });
  if (!r.ok || (await r.json())?.versie !== 1) throw new Error("Externe aanmelding is nog niet beschikbaar. Gebruik je mailadres en wachtwoord.");
}
export async function beschikbareAanbieders(): Promise<Record<Aanbieder, boolean>> {
  const r = await metTijd(`${SUPABASE}/auth/v1/settings`, { headers: { apikey: SLEUTEL } });
  if (!r.ok) throw new Error("Aanmeldmogelijkheden konden niet worden opgehaald. Inloggen met je wachtwoord blijft mogelijk.");
  const { external } = await r.json();
  if ([external?.google,external?.apple,external?.azure].some(v => v === true)) await controleerBackend();
  return { google: external?.google === true, apple: external?.apple === true, azure: external?.azure === true };
}

/** Gebruik de eigen pagina als terugkeeradres, ook in het gelijknamige Streamlit-venster. Geen vrije redirect. */
export function terugkeerVenster(): { venster: Window; url: URL } {
  for (const venster of [window.parent, window]) {
    try {
      const url = new URL(venster.location.href);
      if (!["https:", "http:"].includes(url.protocol)) continue;
      if (url.protocol === "http:" && !["localhost", "127.0.0.1"].includes(url.hostname)) continue;
      url.search = ""; url.hash = ""; url.searchParams.set("aanmelding", "extern");
      return { venster, url };
    } catch { /* Andere oorsprong is geen geldig terugkeeradres. */ }
  }
  throw new Error("Open de app in een eigen browservenster om extern in te loggen.");
}

export async function externBeginnen(aanbieder: Aanbieder, akkoord: boolean) {
  const account = huidigeSessie();
  if (!AANBIEDERS.some(a => a.id === aanbieder)) throw new Error(MISLUKT);
  if (!akkoord) throw new Error("Bevestig eerst je leeftijd en de voorwaarden.");
  if (!(await beschikbareAanbieders())[aanbieder]) throw new Error("Deze aanmeldmethode is nog niet beschikbaar. Gebruik je mailadres en wachtwoord.");
  const { venster, url } = terugkeerVenster();
  opruimen();
  sessionStorage.setItem(POGING, JSON.stringify({ aanbieder, akkoord: true, verloopt: Date.now() + 15 * 60_000 }));
  try {
    const c = await auth();
    const { data, error } = await c.signInWithOAuth({ provider: aanbieder, options: {
      redirectTo: url.toString(), skipBrowserRedirect: true, ...(aanbieder === "azure" ? { scopes: "email" } : {}),
    } });
    if (error || !data.url || huidigeSessie() !== account) throw new Error(MISLUKT);
    const bestemming = new URL(data.url);
    if (bestemming.origin !== new URL(SUPABASE).origin || bestemming.pathname !== "/auth/v1/authorize") throw new Error(MISLUKT);
    venster.location.assign(bestemming.toString());
  } catch { opruimen(); throw new Error(MISLUKT); }
}

/** Eén inwisseling per pagina, ook bij React StrictMode. Geen tokens in een URL of permanente browseropslag. */
export function externAfronden(): Promise<void> {
  return afronden ??= (async () => {
    const code = adresWaarde("code");
    const geweigerd = adresWaarde("error");
    const marker = isExterneTerugkomst();
    adresOpruimen("aanmelding", "code", "error", "error_description", "error_code");
    try {
      const poging = JSON.parse(sessionStorage.getItem(POGING) ?? "null");
      if (!marker || geweigerd || !code || code.length > 4096 || !poging || poging.akkoord !== true
        || !AANBIEDERS.some(a => a.id === poging.aanbieder) || !Number.isFinite(poging.verloopt)
        || poging.verloopt <= Date.now() || poging.verloopt > Date.now() + 15 * 60_000) throw new Error(MISLUKT);
      sessionStorage.removeItem(POGING);
      const c = await auth();
      const { data, error } = await c.exchangeCodeForSession(code);
      if (error || !data.session?.access_token || data.session.user.app_metadata.provider !== poging.aanbieder) throw new Error(MISLUKT);
      await controleerBackend();
      const r = await metTijd(`${SUPABASE}/rest/v1/rpc/inloggen_extern`, {
        method: "POST", headers: { apikey: SLEUTEL, Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ p_apparaat: apparaatNaam(), p_akkoord: true }),
      });
      if (!r.ok) throw new Error(MISLUKT);
      const antwoord = await r.json();
      if (!antwoord.token || typeof antwoord.token !== "string" || typeof antwoord.naam !== "string") throw new Error(MISLUKT);
      await sessieStarten(antwoord.naam, antwoord.token);
    } catch { throw new Error(MISLUKT); }
    finally { opruimen(); }
  })();
}
