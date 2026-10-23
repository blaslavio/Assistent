// Sport en gezondheid koppelen, alleen lezen: trainingen, stappen en slaap uit Strava, Fitbit, Polar, Withings en Oura,
// en gegevens die een app zelf instuurt (zoals Health Auto Export voor Apple Gezondheid).
//
// De client ID's en secrets van de apps staan in de database (private.gezondheid_apps), de toegangscodes per gebruiker
// ook (private.gezondheid_koppelingen). Alleen deze functie leest ze, met de service-rol. De app en de browser krijgen
// ze nooit te zien; de app krijgt alleen de trainingen en dagwaarden terug.
//
// Acties (POST, JSON met naam en wachtwoord/sessie van de gebruiker): starten, afmaken, ophalen, ontkoppelen.
// Insturen door een andere app: POST naar deze functie met ?code=<geheime code> (of Authorization: Bearer <code>).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const MAX_INZENDEN = 2_000_000;

class Fout extends Error {
  status?: number;
}

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function gebruiker(body: Record<string, unknown>) {
  const id = await rpc("bank_gebruiker", { p_naam: body.naam ?? "", p_wachtwoord: body.wachtwoord ?? "" });
  if (!id) throw new Fout("Geen toegang. Log opnieuw in.");
  return id as number;
}

const base64url = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sha256(tekst: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(tekst)));
  return [...h].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const willekeurig = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)));
const datum = (d: Date) => d.toISOString().slice(0, 10);
// "2026-10-23T08:15:00+02:00" of "2026-10-23 08:15:00 +0200" → "2026-10-23T08:15" (de plaatselijke tijd).
const lokaal = (s: unknown) => String(s ?? "").replace(" ", "T").slice(0, 16);

// --- De apps ----------------------------------------------------------------------------------------------------

type App = {
  auth: string;
  token: string;
  scope: string;
  basic?: boolean; // client ID en secret in de Authorization-kop
  pkce?: boolean;
  extra?: Record<string, string>;
};

const APPS: Record<string, App> = {
  strava: {
    auth: "https://www.strava.com/oauth/authorize",
    token: "https://www.strava.com/oauth/token",
    scope: "activity:read_all",
    extra: { approval_prompt: "auto" },
  },
  fitbit: {
    auth: "https://www.fitbit.com/oauth2/authorize",
    token: "https://api.fitbit.com/oauth2/token",
    scope: "activity sleep",
    basic: true,
    pkce: true,
  },
  polar: {
    auth: "https://flow.polar.com/oauth2/authorization",
    token: "https://polarremote.com/v2/oauth2/token",
    scope: "accesslink.read_all",
    basic: true,
  },
  withings: {
    auth: "https://account.withings.com/oauth2_user/authorize2",
    token: "https://wbsapi.withings.net/v2/oauth2",
    scope: "user.activity,user.metrics",
  },
  oura: {
    auth: "https://cloud.ouraring.com/oauth/authorize",
    token: "https://api.ouraring.com/oauth/token",
    scope: "workout daily personal",
  },
};

type Instelling = { client_id: string; client_secret: string; app_adres: string };

async function instelling(aanbieder: string): Promise<Instelling> {
  if (!APPS[aanbieder]) throw new Fout("Onbekende app.");
  const p = await rpc("gezondheid_platform", { p_aanbieder: aanbieder });
  if (!p) throw new Fout("Deze koppeling staat nog niet aan.");
  if (!p.app_adres) throw new Fout("Het adres van de app is nog niet ingesteld.");
  return { ...p, app_adres: String(p.app_adres).replace(/\/$/, "") };
}

type Tokens = { access: string; refresh: string; verloopt: string | null; extern_id: string; naam: string };

async function tokenVerzoek(aanbieder: string, inst: Instelling, velden: Record<string, string>): Promise<Tokens> {
  const app = APPS[aanbieder];
  const body = new URLSearchParams(velden);
  const kop: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
  if (app.basic) kop.Authorization = "Basic " + btoa(`${inst.client_id}:${inst.client_secret}`);
  else {
    body.set("client_id", inst.client_id);
    body.set("client_secret", inst.client_secret);
  }
  if (aanbieder === "withings") body.set("action", "requesttoken");
  const r = await fetch(app.token, { method: "POST", headers: kop, body });
  let j = await r.json().catch(() => ({}));
  if (aanbieder === "withings") j = j.status === 0 ? j.body : {};
  if (!r.ok || !j.access_token) {
    console.error("token", aanbieder, r.status, JSON.stringify(j).slice(0, 200));
    const e = new Fout("De app gaf geen toegang. Probeer opnieuw te koppelen.");
    e.status = 401;
    throw e;
  }
  const verloopt = j.expires_at ? new Date(j.expires_at * 1000) : j.expires_in ? new Date(Date.now() + j.expires_in * 1000) : null;
  const sporter = j.athlete ?? {};
  return {
    access: j.access_token,
    refresh: j.refresh_token ?? "",
    verloopt: verloopt ? verloopt.toISOString() : null,
    extern_id: String(sporter.id ?? j.user_id ?? j.x_user_id ?? j.userid ?? ""),
    naam: [sporter.firstname, sporter.lastname].filter(Boolean).join(" "),
  };
}

// --- Koppelen ---------------------------------------------------------------------------------------------------

async function starten(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const aanbieder = String(body.aanbieder ?? "");
  const inst = await instelling(aanbieder);
  const app = APPS[aanbieder];
  const staat = "gz." + willekeurig(24);
  const verifier = app.pkce ? willekeurig(48) : "";
  if (!await rpc("gezondheid_starten", { p_gebruiker: id, p_aanbieder: aanbieder, p_staat_hash: await sha256(staat),
    p_verifier: verifier })) {
    throw new Fout("Te veel pogingen. Probeer het over een uur opnieuw.");
  }
  const q = new URLSearchParams({ client_id: inst.client_id, response_type: "code", redirect_uri: `${inst.app_adres}/`,
    scope: app.scope, state: staat, ...(app.extra ?? {}) });
  if (verifier) {
    const uitdaging = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
    q.set("code_challenge", uitdaging);
    q.set("code_challenge_method", "S256");
  }
  return { url: `${app.auth}?${q}` };
}

async function afmaken(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const poging = await rpc("gezondheid_poging", { p_gebruiker: id, p_staat_hash: await sha256(String(body.staat ?? "")) });
  if (!poging) throw new Fout("Deze koppeling is verlopen. Probeer het opnieuw.");
  const inst = await instelling(poging.aanbieder);
  const t = await tokenVerzoek(poging.aanbieder, inst, {
    grant_type: "authorization_code", code: String(body.code ?? ""), redirect_uri: `${inst.app_adres}/`,
    ...(poging.verifier ? { code_verifier: poging.verifier } : {}),
  });
  if (poging.aanbieder === "polar") {
    // Polar wil dat je de gebruiker één keer aanmeldt bij je app (409 = al aangemeld).
    const r = await fetch("https://www.polaraccesslink.com/v3/users", {
      method: "POST",
      headers: { Authorization: `Bearer ${t.access}`, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ "member-id": `assistent-${id}` }),
    });
    if (!r.ok && r.status !== 409) console.error("polar aanmelden", r.status);
  }
  await rpc("gezondheid_tokens", { p_gebruiker: id, p_id: poging.id, p_access: t.access, p_refresh: t.refresh,
    p_verloopt: t.verloopt, p_extern_id: t.extern_id, p_extern_naam: t.naam });
  return { aanbieder: poging.aanbieder, naam: t.naam };
}

async function ontkoppelen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const k = await rpc("gezondheid_koppeling", { p_gebruiker: id, p_aanbieder: String(body.aanbieder ?? "") });
  if (k) {
    if (k.aanbieder === "strava" && k.access_token) {
      await fetch("https://www.strava.com/oauth/deauthorize", { method: "POST",
        headers: { Authorization: `Bearer ${k.access_token}` } }).catch(() => {});
    }
    await rpc("gezondheid_bijwerken", { p_gebruiker: id, p_id: k.id, p_status: "weg", p_fout: "", p_opgehaald: false });
  }
  return { ok: true };
}

// --- Ophalen ----------------------------------------------------------------------------------------------------

type Training = { id: string; naam: string; start: string; sport: string; minuten: number; afstand_km: number;
  calorieen: number };
type Dag = { datum: string; stappen?: number; slaap_min?: number; slaap_score?: number };

async function haal(url: string, token: string, init: RequestInit = {}) {
  const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, Accept: "application/json",
    "Accept-Language": "nl_NL", ...(init.headers ?? {}) } });
  if (r.status === 401 || r.status === 403) {
    const e = new Fout("De app geeft geen toegang meer. Koppel opnieuw.");
    e.status = 401;
    throw e;
  }
  if (r.status === 204) return {};
  if (!r.ok) {
    console.error("ophalen", url.split("?")[0], r.status);
    throw new Fout("De app is nu niet bereikbaar. Probeer het later opnieuw.");
  }
  return r.json();
}

const minuten = (seconden: unknown) => Math.round(Number(seconden ?? 0) / 60);
const km = (meter: unknown) => Math.round(Number(meter ?? 0) / 100) / 10;

// "PT1H2M30S" → 62 minuten
function isoDuur(d: unknown) {
  const m = String(d ?? "").match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:([\d.]+)S)?/);
  return m ? Number(m[1] ?? 0) * 60 + Number(m[2] ?? 0) + Math.round(Number(m[3] ?? 0) / 60) : 0;
}

const WITHINGS_SPORT: Record<number, string> = { 1: "wandelen", 2: "hardlopen", 3: "wandelen", 6: "fietsen",
  7: "zwemmen", 9: "tennis", 16: "yoga", 17: "yoga", 18: "fitness", 28: "voetbal", 187: "roeien", 188: "fitness",
  272: "fitness", 306: "wandelen", 307: "hardlopen", 308: "fietsen" };

async function strava(token: string, sinds: Date) {
  const trainingen: Training[] = [];
  for (let pagina = 1; pagina <= 3; pagina++) {
    const lijst = await haal(`https://www.strava.com/api/v3/athlete/activities?after=${Math.floor(sinds.getTime() / 1000)}` +
      `&per_page=100&page=${pagina}`, token);
    for (const a of lijst) {
      trainingen.push({ id: `strava:${a.id}`, naam: a.name ?? "", start: lokaal(a.start_date_local), sport: a.sport_type ?? a.type,
        minuten: minuten(a.moving_time ?? a.elapsed_time), afstand_km: km(a.distance),
        calorieen: Math.round(Number(a.kilojoules ?? 0) / 4.184) });
    }
    if (lijst.length < 100) break;
  }
  return { trainingen, dagen: [] as Dag[] };
}

async function fitbit(token: string, sinds: Date) {
  const a = await haal(`https://api.fitbit.com/1/user/-/activities/list.json?afterDate=${datum(sinds)}&sort=asc&offset=0&limit=100`, token);
  const trainingen = (a.activities ?? []).map((x: Record<string, any>) => ({
    id: `fitbit:${x.logId}`, naam: x.activityName ?? "", start: lokaal(x.startTime), sport: x.activityName ?? "",
    minuten: Math.round(Number(x.activeDuration ?? x.duration ?? 0) / 60000),
    afstand_km: Math.round(Number(x.distance ?? 0) * (x.distanceUnit === "Mile" ? 1.609 : 1) * 10) / 10,
    calorieen: Number(x.calories ?? 0) }));
  const dagen: Record<string, Dag> = {};
  const s = await haal(`https://api.fitbit.com/1/user/-/activities/steps/date/${datum(sinds)}/today.json`, token);
  for (const x of s["activities-steps"] ?? []) (dagen[x.dateTime] ??= { datum: x.dateTime }).stappen = Number(x.value);
  const v = await haal(`https://api.fitbit.com/1.2/user/-/sleep/date/${datum(sinds)}/${datum(new Date())}.json`, token);
  for (const x of v.sleep ?? []) {
    if (!x.isMainSleep) continue;
    const d = (dagen[x.dateOfSleep] ??= { datum: x.dateOfSleep });
    d.slaap_min = Number(x.minutesAsleep ?? 0);
    if (x.efficiency) d.slaap_score = Number(x.efficiency);
  }
  return { trainingen, dagen: Object.values(dagen) };
}

async function polar(token: string) {
  const lijst = await haal("https://www.polaraccesslink.com/v3/exercises", token);
  const trainingen = (Array.isArray(lijst) ? lijst : []).map((x: Record<string, any>) => ({
    id: `polar:${x.id}`, naam: x.detailed_sport_info ?? x.sport ?? "", start: lokaal(x.start_time),
    sport: x.detailed_sport_info ?? x.sport ?? "", minuten: isoDuur(x.duration), afstand_km: km(x.distance),
    calorieen: Number(x.calories ?? 0) }));
  return { trainingen, dagen: [] as Dag[] };
}

async function withings(token: string, sinds: Date) {
  const vraag = (pad: string, velden: Record<string, string>) => haal(`https://wbsapi.withings.net${pad}`, token, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(velden) }).then((j) => {
      if (j.status === 401) {
        const e = new Fout("De app geeft geen toegang meer. Koppel opnieuw.");
        e.status = 401;
        throw e;
      }
      return j.body ?? {};
    });
  const periode = { startdateymd: datum(sinds), enddateymd: datum(new Date()) };
  const w = await vraag("/v2/measure", { action: "getworkouts", ...periode, data_fields: "calories,distance" });
  const tijd = (s: number) => new Date(s * 1000).toLocaleString("sv-SE", { timeZone: "Europe/Amsterdam" });
  const trainingen = (w.series ?? []).map((x: Record<string, any>) => ({
    id: `withings:${x.id ?? x.startdate}`, naam: WITHINGS_SPORT[x.category] ?? "training", start: lokaal(tijd(x.startdate)),
    sport: WITHINGS_SPORT[x.category] ?? "", minuten: minuten(Number(x.enddate) - Number(x.startdate)),
    afstand_km: km(x.data?.distance), calorieen: Math.round(Number(x.data?.calories ?? 0)) }));
  const dagen: Record<string, Dag> = {};
  const a = await vraag("/v2/measure", { action: "getactivity", ...periode, data_fields: "steps" });
  for (const x of a.activities ?? []) (dagen[x.date] ??= { datum: x.date }).stappen = Number(x.steps ?? 0);
  const s = await vraag("/v2/sleep", { action: "getsummary", ...periode, data_fields: "total_sleep_time,sleep_score" });
  for (const x of s.series ?? []) {
    const d = (dagen[x.date] ??= { datum: x.date });
    if (x.data?.total_sleep_time) d.slaap_min = minuten(x.data.total_sleep_time);
    if (x.data?.sleep_score) d.slaap_score = Number(x.data.sleep_score);
  }
  return { trainingen, dagen: Object.values(dagen) };
}

async function oura(token: string, sinds: Date) {
  const periode = `start_date=${datum(sinds)}&end_date=${datum(new Date(Date.now() + 86400_000))}`;
  const w = await haal(`https://api.ouraring.com/v2/usercollection/workout?${periode}`, token);
  const trainingen = (w.data ?? []).map((x: Record<string, any>) => ({
    id: `oura:${x.id}`, naam: x.label || x.activity || "", start: lokaal(x.start_datetime), sport: x.activity ?? "",
    minuten: Math.round((Date.parse(x.end_datetime) - Date.parse(x.start_datetime)) / 60000) || 0,
    afstand_km: km(x.distance), calorieen: Math.round(Number(x.calories ?? 0)) }));
  const dagen: Record<string, Dag> = {};
  const a = await haal(`https://api.ouraring.com/v2/usercollection/daily_activity?${periode}`, token);
  for (const x of a.data ?? []) (dagen[x.day] ??= { datum: x.day }).stappen = Number(x.steps ?? 0);
  const s = await haal(`https://api.ouraring.com/v2/usercollection/daily_sleep?${periode}`, token);
  for (const x of s.data ?? []) (dagen[x.day] ??= { datum: x.day }).slaap_score = Number(x.score ?? 0);
  return { trainingen, dagen: Object.values(dagen) };
}

async function ophalen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const aanbieder = String(body.aanbieder ?? "");
  const k = await rpc("gezondheid_koppeling", { p_gebruiker: id, p_aanbieder: aanbieder });
  if (!k) throw new Fout("Niet gekoppeld.");
  let token = k.access_token as string;
  try {
    if (k.verloopt && Date.parse(k.verloopt) < Date.now() + 60_000) {
      if (!k.refresh_token) {
        const e = new Fout("De toestemming is verlopen. Koppel opnieuw.");
        e.status = 401;
        throw e;
      }
      const t = await tokenVerzoek(aanbieder, await instelling(aanbieder),
        { grant_type: "refresh_token", refresh_token: k.refresh_token });
      await rpc("gezondheid_tokens", { p_gebruiker: id, p_id: k.id, p_access: t.access, p_refresh: t.refresh,
        p_verloopt: t.verloopt, p_extern_id: "", p_extern_naam: "" });
      token = t.access;
    }
    const sinds = new Date(Date.now() - Math.min(60, Math.max(1, Number(body.dagen) || 14)) * 86400_000);
    const uit = aanbieder === "strava" ? await strava(token, sinds)
      : aanbieder === "fitbit" ? await fitbit(token, sinds)
      : aanbieder === "polar" ? await polar(token)
      : aanbieder === "withings" ? await withings(token, sinds)
      : aanbieder === "oura" ? await oura(token, sinds)
      : null;
    if (!uit) throw new Fout("Onbekende app.");
    await rpc("gezondheid_bijwerken", { p_gebruiker: id, p_id: k.id, p_status: "actief", p_fout: "", p_opgehaald: true });
    return uit;
  } catch (fout) {
    await rpc("gezondheid_bijwerken", { p_gebruiker: id, p_id: k.id,
      p_status: (fout as Fout).status === 401 ? "verlopen" : "", p_fout: (fout as Error).message.slice(0, 200),
      p_opgehaald: false });
    throw fout;
  }
}

// --- Insturen door een andere app -------------------------------------------------------------------------------

// Health Auto Export (Apple Gezondheid) of ons eigen formaat: {trainingen: [...], dagen: [...]}.
function inzendItems(j: Record<string, any>) {
  const items: { soort: string; sleutel: string; inhoud: Record<string, unknown> }[] = [];
  const data = j.data ?? j;
  for (const w of [...(data.workouts ?? []), ...(j.trainingen ?? [])]) {
    const start = lokaal(w.start);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(start)) continue;
    const afstand = typeof w.distance === "object" && w.distance
      ? Number(w.distance.qty ?? 0) * (/mi/.test(String(w.distance.units ?? "")) ? 1.609 : /^m$/.test(String(w.distance.units ?? "")) ? 0.001 : 1)
      : Number(w.afstand_km ?? 0);
    const naam = String(w.name ?? w.naam ?? "Training").slice(0, 80);
    items.push({ soort: "training", sleutel: `training:${String(w.id ?? start + naam).slice(0, 100)}`, inhoud: {
      naam, start, sport: String(w.sport ?? w.name ?? "").slice(0, 60),
      minuten: Math.round(Number(w.minuten ?? (w.duration ? Number(w.duration) / 60 : 0))),
      afstand_km: Math.round(afstand * 10) / 10,
      calorieen: Math.round(Number(w.activeEnergyBurned?.qty ?? w.activeEnergy?.qty ?? w.calorieen ?? 0)) } });
  }
  const dagen: Record<string, Record<string, number | string>> = {};
  for (const m of data.metrics ?? []) {
    for (const x of m.data ?? []) {
      const d = String(x.date ?? "").slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
      const dag = (dagen[d] ??= { datum: d });
      if (m.name === "step_count") dag.stappen = Math.round(Number(dag.stappen ?? 0) + Number(x.qty ?? 0));
      if (m.name === "sleep_analysis") {
        const uren = Number(x.totalSleep ?? x.asleep ?? x.qty ?? 0);
        if (uren) dag.slaap_min = Math.round(uren * 60);
      }
      if (m.name === "resting_heart_rate") dag.rusthartslag = Math.round(Number(x.qty ?? 0));
    }
  }
  for (const d of j.dagen ?? []) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(String(d.datum ?? ""))) dagen[d.datum] = { ...(dagen[d.datum] ?? {}), ...d };
  }
  for (const [d, inhoud] of Object.entries(dagen)) {
    const schoon: Record<string, number | string> = { datum: d };
    for (const k of ["stappen", "slaap_min", "slaap_score", "rusthartslag"]) {
      if (Number.isFinite(Number(inhoud[k])) && inhoud[k] !== undefined) schoon[k] = Math.round(Number(inhoud[k]));
    }
    items.push({ soort: "dag", sleutel: `dag:${d}`, inhoud: schoon });
  }
  return items;
}

async function inzenden(verzoek: Request, code: string) {
  const tekst = await verzoek.text();
  if (tekst.length > MAX_INZENDEN) return Response.json({ fout: "Te groot. Stuur minder dagen tegelijk." }, { status: 413 });
  let j: Record<string, any>;
  try {
    j = JSON.parse(tekst);
  } catch {
    return Response.json({ fout: "Geen geldige JSON." }, { status: 400 });
  }
  const bron = String(new URL(verzoek.url).searchParams.get("bron") ?? (j.data ? "Apple Gezondheid" : "App")).slice(0, 40);
  const items = inzendItems(j);
  let aantal = 0;
  for (let i = 0; i < items.length; i += 500) {
    const a = await rpc("gezondheid_inzenden", { p_code: code, p_bron: bron, p_items: items.slice(i, i + 500) });
    if (a.fout) return Response.json({ fout: a.fout }, { status: a.fout === "Onbekend adres." ? 401 : 429 });
    aantal += a.aantal;
  }
  return Response.json({ ok: true, aantal });
}

const ACTIES: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  starten, afmaken, ophalen, ontkoppelen,
};

export async function verwerk(verzoek: Request): Promise<Response> {
  if (verzoek.method !== "POST") return new Response("alleen POST", { status: 405 });
  try {
    const code = new URL(verzoek.url).searchParams.get("code")
      || (verzoek.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (code && /^[0-9a-f]{48}$/.test(code)) return await inzenden(verzoek, code);
    const body = await verzoek.json();
    const actie = ACTIES[body.actie];
    if (!actie) return Response.json({ fout: "Onbekende actie." }, { status: 400 });
    return Response.json(await actie(body));
  } catch (fout) {
    if (fout instanceof Fout) return Response.json({ fout: fout.message });
    console.error(fout);
    return Response.json({ fout: "De koppeling gaf een fout. Probeer het later opnieuw." }, { status: 500 });
  }
}

Deno.serve(verwerk);
