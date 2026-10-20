// Bankkoppeling via Enable Banking (PSD2, alleen lezen).
//
// De gebruiker logt bij zijn eigen bank in en geeft toestemming om af- en bijschrijvingen te lezen. Deze functie
// haalt ze op en geeft ze aan de app, die ze in het budget zet. Geld overmaken kan via deze koppeling niet.
// De sleutel van Enable Banking staat in de database (private.platform) of als geheim van deze functie; nooit in de
// code, en de app krijgt hem nooit te zien.
//
// Acties (POST, JSON met naam en wachtwoord van de gebruiker): banken, koppelen, afmaken, ophalen, ontkoppelen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const EB_API = Deno.env.get("ENABLE_BANKING_API") ?? "https://api.enablebanking.com";
const MAX_PAGINAS = 20;

class Fout extends Error {}

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status} ${await r.text()}`);
  return r.json();
}

let platform: { app_id: string; sleutel: CryptoKey; app_adres: string } | null = null;

async function instellingen() {
  if (!platform) {
    const p = await rpc("bank_platform");
    const appId = Deno.env.get("ENABLE_BANKING_APP_ID") || p.app_id;
    const pem = Deno.env.get("ENABLE_BANKING_KEY") || p.sleutel;
    if (!appId || !pem) throw new Fout("De bankkoppeling staat nog niet aan.");
    if (pem.includes("BEGIN RSA PRIVATE KEY")) {
      throw new Fout("Deze sleutel heeft een oud formaat. Download bij Enable Banking een nieuwe (.pem).");
    }
    const ruw = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "")), (c) => c.charCodeAt(0));
    const sleutel = await crypto.subtle.importKey("pkcs8", ruw, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false,
      ["sign"]);
    platform = { app_id: appId, sleutel, app_adres: (p.app_adres || "").replace(/\/$/, "") };
  }
  return platform;
}

const base64url = (data: Uint8Array | string) =>
  btoa(typeof data === "string" ? data : String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_")
    .replace(/=+$/, "");

// Enable Banking wil bij elk verzoek een JWT, ondertekend met de sleutel van de applicatie (RS256).
async function jwt() {
  const { app_id, sleutel } = await instellingen();
  const nu = Math.floor(Date.now() / 1000);
  const kop = base64url(JSON.stringify({ typ: "JWT", alg: "RS256", kid: app_id }));
  const inhoud = base64url(JSON.stringify({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: nu,
    exp: nu + 3600 }));
  const handtekening = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", sleutel,
    new TextEncoder().encode(`${kop}.${inhoud}`));
  return `${kop}.${inhoud}.${base64url(new Uint8Array(handtekening))}`;
}

async function eb(methode: string, pad: string, data?: unknown) {
  const r = await fetch(`${EB_API}${pad}`, {
    method: methode,
    headers: { Authorization: `Bearer ${await jwt()}`, "Content-Type": "application/json" },
    body: data ? JSON.stringify(data) : undefined,
  });
  const tekst = await r.text();
  const antwoord = tekst ? JSON.parse(tekst) : {};
  if (!r.ok) {
    console.error("enable banking", methode, pad, r.status, tekst.slice(0, 300));
    const e = new Fout(r.status === 401 || r.status === 403 ? "De bank geeft geen toegang meer. Koppel opnieuw."
      : "De bank is nu niet bereikbaar. Probeer het later opnieuw.");
    (e as Fout & { status?: number }).status = r.status;
    throw e;
  }
  return antwoord;
}

async function gebruiker(body: Record<string, unknown>) {
  const id = await rpc("bank_gebruiker", { p_naam: body.naam ?? "", p_wachtwoord: body.wachtwoord ?? "" });
  if (!id) throw new Fout("Geen toegang. Log opnieuw in.");
  return id as number;
}

// --- Acties ---------------------------------------------------------------------------------------------------

async function banken(body: Record<string, unknown>) {
  await gebruiker(body);
  const land = String(body.land ?? "NL").slice(0, 2).toUpperCase();
  const a = await eb("GET", `/aspsps?country=${land}`);
  return {
    banken: (a.aspsps ?? []).filter((b: Record<string, any>) => !b.psu_types || b.psu_types.includes("personal"))
      .map((b: Record<string, unknown>) => ({ naam: b.name, logo: b.logo ?? "",
      max_dagen: Math.floor(Number(b.maximum_consent_validity ?? 0) / 86400) || null })),
  };
}

async function koppelen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const { app_adres } = await instellingen();
  if (!app_adres) throw new Fout("Het adres van de app is nog niet ingesteld.");
  const bank = String(body.bank ?? "").slice(0, 80);
  const land = String(body.land ?? "NL").slice(0, 2).toUpperCase();
  const staat = crypto.randomUUID();
  const nieuw = await rpc("bank_koppeling_starten", { p_gebruiker: id, p_bank: bank, p_land: land, p_staat: staat });
  if (!nieuw) throw new Fout("Je hebt al tien bankkoppelingen.");
  // Zo lang als de bank toestaat, maar hooguit 180 dagen.
  const dagen = Math.min(180, Number(body.dagen) || 90);
  const a = await eb("POST", "/auth", {
    access: { valid_until: new Date(Date.now() + dagen * 86400_000).toISOString() },
    aspsp: { name: bank, country: land },
    state: staat,
    redirect_url: `${app_adres}/`,
    psu_type: "personal",
  });
  return { url: a.url };
}

async function afmaken(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const s = await eb("POST", "/sessions", { code: String(body.code ?? "") });
  const rekeningen = (s.accounts ?? []).map((r: Record<string, any>) => ({
    uid: r.uid,
    iban: r.account_id?.iban ?? r.account_id?.other?.identification ?? "",
    naam: r.name ?? r.product ?? r.details ?? "",
  }));
  const k = await rpc("bank_koppeling_afmaken", { p_gebruiker: id, p_staat: String(body.staat ?? ""),
    p_sessie: s.session_id, p_rekeningen: rekeningen, p_geldig_tot: s.access?.valid_until ?? null });
  if (!k) {
    // Onbekende of verlopen poging: de sessie meteen weer intrekken.
    await eb("DELETE", `/sessions/${s.session_id}`).catch(() => {});
    throw new Fout("Deze koppeling is verlopen. Probeer het opnieuw.");
  }
  return { ...k, rekeningen: rekeningen.map((r: { iban: string; naam: string }) => ({ iban: r.iban, naam: r.naam })) };
}

function regel(t: Record<string, any>, iban: string) {
  const bij = t.credit_debit_indicator === "CRDT";
  const bedrag = Math.abs(Number(t.transaction_amount?.amount ?? 0)) * (bij ? 1 : -1);
  const tegen = bij ? t.debtor : t.creditor;
  const omschrijving = [].concat(t.remittance_information ?? []).join(" ").replace(/\s+/g, " ").trim();
  return {
    datum: t.booking_date ?? t.value_date ?? t.transaction_date,
    bedrag: Math.round(bedrag * 100) / 100,
    valuta: t.transaction_amount?.currency ?? "EUR",
    tegenpartij: (tegen?.name ?? "").slice(0, 120),
    omschrijving: (omschrijving || t.bank_transaction_code?.description || "").slice(0, 300),
    rekening: iban,
    referentie: t.entry_reference ?? t.transaction_id ?? "",
  };
}

async function ophalen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const k = await rpc("bank_koppeling", { p_gebruiker: id, p_id: body.koppeling });
  if (!k) throw new Fout("Koppeling niet gevonden.");
  if (k.geldig_tot && new Date(k.geldig_tot) < new Date()) {
    await rpc("bank_koppeling_bijwerken", { p_gebruiker: id, p_id: k.id, p_status: "verlopen", p_fout: "",
      p_opgehaald: false });
    throw new Fout("De toestemming bij je bank is verlopen. Koppel opnieuw.");
  }
  const vanaf = /^\d{4}-\d{2}-\d{2}$/.test(String(body.vanaf ?? "")) ? String(body.vanaf)
    : new Date(Date.now() - 90 * 86400_000).toISOString().slice(0, 10);
  const regels: unknown[] = [];
  const saldi: { iban: string; bedrag: number }[] = [];
  try {
    for (const r of k.rekeningen) {
      let sleutel = "";
      for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
        const q = new URLSearchParams({ date_from: vanaf, ...(sleutel ? { continuation_key: sleutel } : {}) });
        const a = await eb("GET", `/accounts/${r.uid}/transactions?${q}`);
        for (const t of a.transactions ?? []) {
          if (!t.status || t.status === "BOOK") regels.push(regel(t, r.iban));
        }
        sleutel = a.continuation_key ?? "";
        if (!sleutel) break;
      }
      const b = await eb("GET", `/accounts/${r.uid}/balances`).catch(() => null);
      const saldo = (b?.balances ?? []).find((x: Record<string, any>) => ["ITBD", "CLBD", "XPCD", "ITAV", "CLAV"]
        .includes(x.balance_type)) ?? b?.balances?.[0];
      if (saldo) {
        const teken = saldo.credit_debit_indicator === "DBIT" ? -1 : 1;
        saldi.push({ iban: r.iban, bedrag: teken * Math.abs(Number(saldo.balance_amount?.amount ?? 0)) });
      }
    }
  } catch (fout) {
    const status = (fout as { status?: number }).status;
    await rpc("bank_koppeling_bijwerken", { p_gebruiker: id, p_id: k.id,
      p_status: status === 401 || status === 403 ? "verlopen" : "", p_fout: (fout as Error).message,
      p_opgehaald: false });
    throw fout;
  }
  await rpc("bank_koppeling_bijwerken", { p_gebruiker: id, p_id: k.id, p_status: "actief", p_fout: "",
    p_opgehaald: true });
  return { regels, saldi };
}

async function ontkoppelen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const k = await rpc("bank_koppeling", { p_gebruiker: id, p_id: body.koppeling });
  if (!k) return { ok: true };
  if (k.sessie) await eb("DELETE", `/sessions/${k.sessie}`).catch(() => {});
  await rpc("bank_koppeling_bijwerken", { p_gebruiker: id, p_id: k.id, p_status: "weg", p_fout: "",
    p_opgehaald: false });
  return { ok: true };
}

const ACTIES: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  banken, koppelen, afmaken, ophalen, ontkoppelen,
};

export async function verwerk(verzoek: Request): Promise<Response> {
  if (verzoek.method !== "POST") return new Response("alleen POST", { status: 405 });
  try {
    const body = await verzoek.json();
    const actie = ACTIES[body.actie];
    if (!actie) return Response.json({ fout: "Onbekende actie." }, { status: 400 });
    return Response.json(await actie(body));
  } catch (fout) {
    if (fout instanceof Fout) return Response.json({ fout: fout.message });
    console.error(fout);
    return Response.json({ fout: "De bankkoppeling gaf een fout. Probeer het later opnieuw." }, { status: 500 });
  }
}

Deno.serve(verwerk);
