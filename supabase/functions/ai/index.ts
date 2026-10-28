// De assistent voor wie geen eigen Anthropic-sleutel heeft.
//
// De app praat met deze functie zoals met de Anthropic API (POST .../ai/v1/messages, ook met streaming). Deze functie
// controleert wie je bent en of je deze maand nog ruimte hebt, stuurt het verzoek door met de sleutel van het platform
// en telt daarna op wat het kostte. De sleutel van het platform verlaat deze functie nooit.
//
// Wie je bent, staat in de kop x-api-key: "abo." + base64(JSON [naam, wachtwoord of sessie]).

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANTHROPIC_API = Deno.env.get("ANTHROPIC_API") ?? "https://api.anthropic.com";
const MODELLEN = new Set(["claude-opus-5-5"]);
const MAX_GROOTTE = 20_000_000;

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status} ${await r.text()}`);
  return r.json();
}

// Een fout in de vorm die de Anthropic-SDK begrijpt, zodat de app hem netjes kan tonen.
function fout(status: number, bericht: string, soort = "invalid_request_error") {
  return Response.json({ type: "error", error: { type: soort, message: bericht } }, { status });
}

type Gebruik = Record<string, number>;
type Prijzen = { invoer: number; uitvoer: number; cache_lezen: number; cache_schrijven: number; zoekopdracht: number };

export function kosten(g: Gebruik, p: Prijzen) {
  return ((g.input_tokens ?? 0) * p.invoer + (g.output_tokens ?? 0) * p.uitvoer
    + (g.cache_read_input_tokens ?? 0) * p.cache_lezen + (g.cache_creation_input_tokens ?? 0) * p.cache_schrijven)
    / 1_000_000 + (g.web_search_requests ?? 0) * p.zoekopdracht;
}

// Neemt het hoogste getal per soort over (bij streaming komt het gebruik in delen binnen).
function bij(g: Gebruik, usage: Record<string, any> | undefined) {
  if (!usage) return;
  for (const k of ["input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"]) {
    if (typeof usage[k] === "number") g[k] = Math.max(g[k] ?? 0, usage[k]);
  }
  const zoek = usage.server_tool_use?.web_search_requests;
  if (typeof zoek === "number") g.web_search_requests = Math.max(g.web_search_requests ?? 0, zoek);
}

// Leest de stroom mee en geeft aan het eind het totale gebruik.
export async function gebruikUitStroom(stroom: ReadableStream<Uint8Array>) {
  const g: Gebruik = {};
  const lezer = stroom.pipeThrough(new TextDecoderStream()).getReader();
  let rest = "";
  while (true) {
    const { value, done } = await lezer.read();
    if (done) break;
    rest += value;
    const regels = rest.split("\n");
    rest = regels.pop() ?? "";
    for (const regel of regels) {
      if (!regel.startsWith("data:")) continue;
      try {
        const e = JSON.parse(regel.slice(5));
        if (e.type === "message_start") bij(g, e.message?.usage);
        if (e.type === "message_delta") bij(g, e.usage);
      } catch { /* geen JSON: overslaan */ }
    }
  }
  return g;
}

function wieBenJe(sleutel: string): [string, string] | null {
  if (!sleutel.startsWith("abo.")) return null;
  try {
    const [naam, wachtwoord] = JSON.parse(new TextDecoder().decode(
      Uint8Array.from(atob(sleutel.slice(4).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))));
    return typeof naam === "string" && typeof wachtwoord === "string" && wachtwoord ? [naam, wachtwoord] : null;
  } catch {
    return null;
  }
}

export async function verwerk(verzoek: Request): Promise<Response> {
  if (verzoek.method !== "POST") return new Response("alleen POST", { status: 405 });
  if (!new URL(verzoek.url).pathname.endsWith("/v1/messages")) return fout(404, "Onbekend adres.", "not_found_error");
  try {
    const wie = wieBenJe(verzoek.headers.get("x-api-key") ?? "");
    const id = wie && await rpc("bank_gebruiker", { p_naam: wie[0], p_wachtwoord: wie[1] });
    if (!id) return fout(401, "Log opnieuw in.", "authentication_error");
    const toegang = await rpc("ai_toegang", { p_gebruiker: id });
    if (toegang.fout) return fout(429, toegang.fout, "rate_limit_error");

    const tekst = await verzoek.text();
    if (tekst.length > MAX_GROOTTE) return fout(413, "Dit is te groot.", "request_too_large");
    const body = JSON.parse(tekst);
    if (!MODELLEN.has(body.model)) return fout(400, "Dit model is niet beschikbaar.");
    body.max_tokens = Math.min(Number(body.max_tokens) || 4096, 32000);

    const kop: Record<string, string> = { "x-api-key": toegang.sleutel, "content-type": "application/json",
      "anthropic-version": verzoek.headers.get("anthropic-version") ?? "2023-06-01" };
    const beta = verzoek.headers.get("anthropic-beta");
    if (beta) kop["anthropic-beta"] = beta;
    const antwoord = await fetch(`${ANTHROPIC_API}/v1/messages`, { method: "POST", headers: kop,
                                                                   body: JSON.stringify(body) });
    const terugKop = { "content-type": antwoord.headers.get("content-type") ?? "application/json" };
    if (!antwoord.ok || !antwoord.body) {
      const t = await antwoord.text();
      console.error("anthropic", antwoord.status, t.slice(0, 300));
      return new Response(t, { status: antwoord.status, headers: terugKop });
    }

    const tellen = (g: Gebruik) => rpc("ai_gebruik_bij", { p_gebruiker: id, p_euro: kosten(g, toegang.prijzen) })
      .catch((e) => console.error("tellen", e));
    if (!body.stream) {
      const j = await antwoord.json();
      const g: Gebruik = {};
      bij(g, j.usage);
      await tellen(g);
      return Response.json(j);
    }
    const [naarApp, meelezen] = antwoord.body.tee();
    const klaar = gebruikUitStroom(meelezen).then(tellen);
    // @ts-ignore: EdgeRuntime bestaat alleen in Supabase
    if (typeof EdgeRuntime !== "undefined") EdgeRuntime.waitUntil(klaar);
    return new Response(naarApp, { headers: { ...terugKop, "cache-control": "no-cache" } });
  } catch (e) {
    console.error(e);
    return fout(500, "De assistent is even niet bereikbaar. Probeer het zo opnieuw.", "api_error");
  }
}

// De nieuwe app (GitHub Pages) praat vanuit de browser met deze functie. Alleen die herkomst mag dat; wie je bent,
// blijft gewoon in x-api-key staan.
const HERKOMSTEN = new Set(["https://blaslavio.github.io"]);

export function corsKoppen(verzoek: Request): Record<string, string> {
  const herkomst = verzoek.headers.get("origin") ?? "";
  if (!HERKOMSTEN.has(herkomst) && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(herkomst)) return {};
  return {
    "Access-Control-Allow-Origin": herkomst,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": verzoek.headers.get("access-control-request-headers") ?? "content-type, x-api-key",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

export async function metCors(verzoek: Request): Promise<Response> {
  const koppen = corsKoppen(verzoek);
  if (verzoek.method === "OPTIONS") return new Response(null, { status: koppen["Access-Control-Allow-Origin"] ? 204 : 403, headers: koppen });
  const antwoord = await verwerk(verzoek);
  if (!koppen["Access-Control-Allow-Origin"]) return antwoord;
  const h = new Headers(antwoord.headers);
  for (const [k, v] of Object.entries(koppen)) h.set(k, v);
  return new Response(antwoord.body, { status: antwoord.status, headers: h });
}

Deno.serve(metCors);
