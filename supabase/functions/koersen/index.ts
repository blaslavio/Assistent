// Koersen en zoeken voor Beleggen in de nieuwe app. De browser kan Yahoo Finance niet zelf vragen (die staat dat niet
// toe vanaf een andere website), dus deze functie doet het. Alleen openbare marktgegevens: er gaat niets van jou
// naartoe behalve de tickers die je opvraagt, en hier wordt niets bewaard behalve een halve minuut de koersen zelf.
// Alleen voor wie ingelogd is (kop x-api-key: "abo." + base64(JSON [naam, sessie]), net als bij "mail" en "ai").

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const YAHOO = "https://query1.finance.yahoo.com";
const YAHOO_ZOEK = "https://query2.finance.yahoo.com";
const KOPPEN = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15" };
const SOORTEN = ["ETF", "EQUITY", "MUTUALFUND", "CRYPTOCURRENCY", "INDEX", "CURRENCY", "FUTURE", "BOND"];
const SYMBOOL = /^[A-Za-z0-9^=.\-]{1,24}$/;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "apikey, content-type, x-api-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS" };

export type Koers = { symbool: string; prijs: number; valuta: string; vandaag_pct: number | null; maand_pct: number | null;
  verloop: number[]; soort: string; naam: string; tijd: number | null };

async function rpc(functie: string, parameters: Record<string, unknown>) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status}`);
  return r.json();
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

const rond = (x: number, n = 2) => Math.round(x * 10 ** n) / 10 ** n;

/** Leest het antwoord van Yahoo's grafiek (een maand, per dag) uit; precies zoals de vorige app. */
export function uitlezen(symbool: string, antwoord: unknown): Koers | null {
  // deno-lint-ignore no-explicit-any
  const res = (antwoord as any)?.chart?.result?.[0];
  if (!res) return null;
  const meta = res.meta ?? {};
  const tijden: number[] = res.timestamp ?? [];
  const slotkoersen: (number | null)[] = res.indicators?.quote?.[0]?.close ?? [];
  const paren = tijden.map((t, i) => [t, slotkoersen[i]] as const).filter(([, k]) => typeof k === "number") as [number, number][];
  const slot = paren.map(([, k]) => k);
  const prijs = typeof meta.regularMarketPrice === "number" ? meta.regularMarketPrice : slot.at(-1);
  if (typeof prijs !== "number") return null;
  // Tijdens de handel is het slot van vandaag nog leeg: dan is het laatste slot dat van gisteren.
  const offset = meta.gmtoffset ?? 0;
  const vandaag = (meta.regularMarketTime ?? 0) + offset;
  const eerder = paren.filter(([t]) => Math.floor((t + offset) / 86400) < Math.floor(vandaag / 86400)).map(([, k]) => k);
  const vorige = eerder.length && vandaag ? eerder.at(-1)! : meta.previousClose ?? meta.chartPreviousClose;
  const pct = meta.regularMarketChangePercent;
  const begin = slot[0];
  return {
    symbool, prijs, valuta: meta.currency || "EUR",
    vandaag_pct: typeof pct === "number" ? rond(pct) : vorige ? rond((prijs / vorige - 1) * 100) : null,
    maand_pct: begin ? rond((prijs / begin - 1) * 100) : null,
    verloop: slot.slice(-22).map((k) => rond(k, 4)), soort: meta.instrumentType ?? "",
    naam: meta.longName || meta.shortName || symbool, tijd: meta.regularMarketTime ?? null,
  };
}

// Een halve minuut onthouden voor iedereen samen; een mislukte poging twee minuten (Yahoo niet blijven bestoken).
const bewaard = new Map<string, [number, Koers | null]>();

async function koers(symbool: string): Promise<Koers | null> {
  const b = bewaard.get(symbool);
  if (b && Date.now() - b[0] < (b[1] ? 30_000 : 120_000)) return b[1];
  let k: Koers | null = null;
  try {
    const r = await fetch(`${YAHOO}/v8/finance/chart/${encodeURIComponent(symbool)}?range=1mo&interval=1d`,
      { headers: KOPPEN, signal: AbortSignal.timeout(8000) });
    if (r.ok) k = uitlezen(symbool, await r.json());
  } catch {
    k = null;
  }
  if (bewaard.size > 2000) bewaard.clear();
  bewaard.set(symbool, [Date.now(), k]);
  return k;
}

async function zoeken(term: string) {
  const u = new URL(`${YAHOO_ZOEK}/v1/finance/search`);
  for (const [k, v] of Object.entries({ q: term, quotesCount: "8", newsCount: "0", lang: "nl-NL", region: "NL" })) {
    u.searchParams.set(k, v);
  }
  const r = await fetch(u, { headers: KOPPEN, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error("zoeken");
  // deno-lint-ignore no-explicit-any
  const quotes: any[] = (await r.json()).quotes ?? [];
  return quotes.filter((q) => q.symbol && SOORTEN.includes(q.quoteType)).map((q) => ({
    symbool: q.symbol, naam: q.longname || q.shortname || q.symbol, beurs: q.exchDisp || q.exchange || "", soort: q.quoteType,
  }));
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...CORS, "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });
  if (req.method !== "POST") return json({ fout: "Niet toegestaan." }, 405);
  try {
    const wie = wieBenJe(req.headers.get("x-api-key") ?? "");
    const id = wie && await rpc("bank_gebruiker", { p_naam: wie[0], p_wachtwoord: wie[1] });
    if (!id) return json({ fout: "Log opnieuw in.", geen_toegang: true }, 401);
    const body = await req.json().catch(() => ({}));
    if (body.actie === "koersen") {
      const symbolen = [...new Set(Array.isArray(body.symbolen) ? body.symbolen : [])].filter(
        (s): s is string => typeof s === "string" && SYMBOOL.test(s)).slice(0, 40);
      const lijst = await Promise.all(symbolen.map(koers));
      return json({ koersen: Object.fromEntries(symbolen.map((s, i) => [s, lijst[i]])) });
    }
    if (body.actie === "zoeken") {
      const term = typeof body.term === "string" ? body.term.trim().slice(0, 60) : "";
      if (!term) return json({ gevonden: [] });
      try {
        return json({ gevonden: await zoeken(term) });
      } catch {
        return json({ fout: "Zoeken lukt nu niet. Probeer het straks nog eens, of vul de ticker zelf in (bijvoorbeeld VWRL.AS)." });
      }
    }
    return json({ fout: "Onbekende actie." }, 400);
  } catch {
    return json({ fout: "Koersen zijn even niet bereikbaar." }, 500);
  }
});
