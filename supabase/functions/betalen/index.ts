// Betalen via de app met Stripe Connect.
//
// Het geld van de koper komt eerst bij het platform (bij Stripe) en gaat pas naar de verkoper als de koper
// bevestigt dat alles goed is ontvangen. Bij een geschil beslist de beheerder.
// De Stripe-sleutels staan in de database (private.platform) of als geheim van deze functie; nooit in de code.
//
// Acties (POST, JSON): verkoper_aanmelden, verkoper_status, afrekenen, ontvangen, geschil_besluiten,
// boeking_afrekenen, boekingen_verrekenen, en voor extra opslag (per maand): abonnement_afsluiten,
// abonnement_bijwerken, abonnement_opzeggen, abonnement_beheren, abonnement_stoppen, en in community's:
// cursus_afrekenen, cursus_controleren, pakket_afrekenen, pakket_controleren, community_abonneren,
// community_controleren, community_opzeggen.
// Stripe stuurt gebeurtenissen (webhook) naar dezelfde URL, met de kop stripe-signature.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const STRIPE_API = Deno.env.get("STRIPE_API") ?? "https://api.stripe.com";

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

let platform: { sleutel: string; webhook_geheim: string; app_adres: string } | null = null;

async function instellingen() {
  if (!platform) {
    const p = await rpc("stripe_platform");
    platform = {
      sleutel: Deno.env.get("STRIPE_SECRET_KEY") || p.sleutel,
      webhook_geheim: Deno.env.get("STRIPE_WEBHOOK_SECRET") || p.webhook_geheim,
      app_adres: (p.app_adres || "").replace(/\/$/, ""),
    };
  }
  if (!platform.sleutel) throw new Fout("Betalen via de app staat nog niet aan.");
  return platform;
}

// Stripe verwacht formulier-codering met haakjes voor geneste velden.
function formulier(data: Record<string, unknown>, voorvoegsel = "", uit = new URLSearchParams()) {
  for (const [sleutel, waarde] of Object.entries(data)) {
    if (waarde === undefined || waarde === null) continue;
    const naam = voorvoegsel ? `${voorvoegsel}[${sleutel}]` : sleutel;
    if (typeof waarde === "object") formulier(waarde as Record<string, unknown>, naam, uit);
    else uit.append(naam, String(waarde));
  }
  return uit;
}

async function stripe(methode: string, pad: string, data?: Record<string, unknown>, idempotentie?: string) {
  const { sleutel } = await instellingen();
  const headers: Record<string, string> = { Authorization: `Bearer ${sleutel}` };
  if (data) headers["Content-Type"] = "application/x-www-form-urlencoded";
  if (idempotentie) headers["Idempotency-Key"] = idempotentie;
  const r = await fetch(`${STRIPE_API}${pad}`, { method: methode, headers, body: data ? formulier(data) : undefined });
  const antwoord = await r.json();
  if (!r.ok) {
    console.error("stripe", pad, antwoord?.error?.message);
    throw new Fout("Stripe gaf een fout: " + (antwoord?.error?.message ?? r.status));
  }
  return antwoord;
}

const centen = (euro: number) => Math.round(Number(euro) * 100);

async function gebruiker(body: Record<string, unknown>) {
  const g = await rpc("stripe_gebruiker", { p_naam: body.naam ?? "", p_wachtwoord: body.wachtwoord ?? "" });
  if (!g) throw new Fout("Geen toegang. Log opnieuw in.");
  return g;
}

async function verkoperAanmelden(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const { app_adres } = await instellingen();
  let account = g.stripe_account;
  if (!account) {
    const nieuw = await stripe("POST", "/v1/accounts", {
      type: "express",
      country: "NL",
      email: g.email ?? undefined,
      capabilities: { transfers: { requested: true } },
      metadata: { gebruiker: g.id },
    }, `account-${g.id}`);
    account = nieuw.id;
    await rpc("stripe_account_opslaan", { p_gebruiker: g.id, p_account: account });
  }
  const link = await stripe("POST", "/v1/account_links", {
    account,
    refresh_url: `${app_adres}/?stripe=opnieuw`,
    return_url: `${app_adres}/?stripe=klaar`,
    type: "account_onboarding",
  });
  return { url: link.url };
}

async function verkoperStatus(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  if (!g.stripe_account) return { klaar: false, aangemeld: false };
  const a = await stripe("GET", `/v1/accounts/${g.stripe_account}`);
  const klaar = Boolean(a.details_submitted && a.payouts_enabled);
  await rpc("stripe_account_klaar", { p_account: g.stripe_account, p_klaar: klaar });
  return { klaar, aangemeld: true };
}

async function afrekenen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const b = await rpc("stripe_bestelling", { p_id: body.bestelling });
  if (!b || b.koper !== g.id) throw new Fout("Bestelling niet gevonden.");
  if (b.betaalwijze !== "app" || b.status !== "geaccepteerd") throw new Fout("Deze bestelling kan nu niet betaald worden.");
  if (!b.verkoper_klaar) throw new Fout("De verkoper kan nog geen betalingen ontvangen.");
  const { app_adres } = await instellingen();
  const sessie = await stripe("POST", "/v1/checkout/sessions", {
    mode: "payment",
    customer_email: g.email ?? undefined,
    line_items: {
      0: { quantity: 1, price_data: { currency: "eur", unit_amount: centen(b.bedrag), product_data: { name: b.titel } } },
      // In de webshop betaalt de koper geen kopersbescherming (de verkoper betaalt commissie).
      ...(centen(b.kosten) > 0 ? {
        1: {
          quantity: 1,
          price_data: { currency: "eur", unit_amount: centen(b.kosten), product_data: { name: "Kopersbescherming" } },
        },
      } : {}),
    },
    payment_intent_data: { transfer_group: `bestelling-${b.id}`, metadata: { bestelling: b.id } },
    metadata: { bestelling: b.id },
    success_url: `${app_adres}/?betaald=${b.id}`,
    cancel_url: `${app_adres}/?betaald=0`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  await rpc("stripe_sessie_opslaan", { p_id: b.id, p_sessie: sessie.id, p_kosten: b.kosten });
  return { url: sessie.url };
}

// Het geld van de koper naar de verkoper overmaken (zonder de kosten voor kopersbescherming,
// en bij de webshop zonder de commissie).
async function uitbetalen(bestellingId: number) {
  const b = await rpc("stripe_bestelling", { p_id: bestellingId });
  if (b.uitbetaald) return;
  const betaling = await stripe("GET", `/v1/payment_intents/${b.stripe_betaling}`);
  await stripe("POST", "/v1/transfers", {
    amount: centen(b.bedrag) - centen(b.commissie ?? 0),
    currency: "eur",
    destination: b.verkoper_account,
    source_transaction: betaling.latest_charge,
    transfer_group: `bestelling-${b.id}`,
    metadata: { bestelling: b.id },
  }, `uitbetaling-${b.id}`);
  await rpc("stripe_uitbetaald", { p_id: b.id });
}

async function ontvangen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const vrij = await rpc("stripe_vrijgeven", { p_id: body.bestelling, p_door: g.id });
  if (!vrij) throw new Fout("Dat kan nu niet bij deze bestelling.");
  await uitbetalen(Number(body.bestelling));
  return { ok: true };
}

async function geschilBesluiten(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  if (!g.beheerder) throw new Fout("Alleen de beheerder kan dit.");
  const b = await rpc("stripe_bestelling", { p_id: body.bestelling });
  if (!b || b.status !== "geschil" || b.betaalwijze !== "app") throw new Fout("Geen open geschil.");
  if (body.uitkomst === "koper") {
    await stripe("POST", "/v1/refunds", { payment_intent: b.stripe_betaling, metadata: { bestelling: b.id } },
                 `terugbetaling-${b.id}`);
    await rpc("stripe_terugbetaald", { p_id: b.id });
  } else if (body.uitkomst === "verkoper") {
    if (!await rpc("stripe_vrijgeven", { p_id: b.id, p_door: 1 })) throw new Fout("Dat kan nu niet.");
    await uitbetalen(b.id);
  } else {
    throw new Fout("Kies koper of verkoper.");
  }
  return { ok: true };
}

// --- Boekingen (diensten via de chat) ----------------------------------------------------------
// De klant betaalt vooraf; het geld blijft bij Stripe tot na de afspraak. Bij annuleren rekent de database uit wat
// terug gaat (annuleringsregel van de aanbieder). Verrekenen = terugbetalen en/of uitbetalen, min de commissie.

async function boekingAfrekenen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const ids = Array.isArray(body.boekingen) ? body.boekingen.map(Number).filter(Number.isFinite) : [];
  const b = await rpc("stripe_boekingen", { p_ids: ids, p_klant: g.id });
  if (!b) throw new Fout("Deze boeking kan niet (meer) betaald worden. Boek opnieuw.");
  if (!b.kan_ontvangen) throw new Fout("De aanbieder kan op dit moment geen betalingen ontvangen.");
  const { app_adres } = await instellingen();
  const verloopt = Math.floor(Date.now() / 1000) + 31 * 60;  // Stripe: minstens 30 minuten
  const sessie = await stripe("POST", "/v1/checkout/sessions", {
    mode: "payment",
    customer_email: g.email ?? undefined,
    line_items: { 0: { quantity: 1, price_data: { currency: "eur", unit_amount: b.totaal, product_data: { name: b.titel } } } },
    payment_intent_data: { transfer_group: `boeking-${b.ids[0]}`, metadata: { boekingen: b.ids.join(",") } },
    metadata: { boekingen: b.ids.join(",") },
    success_url: `${app_adres}/?boeking_betaald=1`,
    cancel_url: `${app_adres}/?boeking_betaald=0`,
    expires_at: verloopt,
  });
  await rpc("stripe_boeking_sessie", { p_ids: b.ids, p_klant: g.id, p_sessie: sessie.id,
                                       p_tot: new Date(verloopt * 1000).toISOString() });
  return { url: sessie.url };
}

async function verrekenen(gebruikerId: number | null) {
  const lijst = await rpc("stripe_te_verrekenen", { p_gebruiker: gebruikerId });
  let klaar = 0;
  for (const b of lijst) {
    try {
      if (b.terug > 0) {
        await stripe("POST", "/v1/refunds", { payment_intent: b.betaling, amount: b.terug, metadata: { boeking: b.id } },
                     `boeking-terug-${b.id}`);
        await rpc("stripe_boeking_teruggestort", { p_id: b.id });
      }
      const uit = b.aan - b.commissie;
      if (uit > 0) {
        if (!b.account || !b.klaar) continue;  // later opnieuw, als de aanbieder weer kan ontvangen
        const betaling = await stripe("GET", `/v1/payment_intents/${b.betaling}`);
        await stripe("POST", "/v1/transfers", {
          amount: uit, currency: "eur", destination: b.account, source_transaction: betaling.latest_charge,
          transfer_group: `boeking-${b.id}`, metadata: { boeking: b.id },
        }, `boeking-uit-${b.id}`);
      }
      await rpc("stripe_boeking_verrekend", { p_id: b.id });
      klaar++;
    } catch (fout) {
      console.error("verrekenen", b.id, fout);
    }
  }
  return klaar;
}

async function boekingenVerrekenen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  return { verrekend: await verrekenen(g.id) };
}

// --- Extra opslag (abonnement per maand) ------------------------------------------------------

type Aanbod = Record<string, { naam: string; prijs: number; gb: number }>;

async function klant(id: number) {
  const k = await rpc("abonnement_klant", { p_gebruiker: id });
  if (!k) throw new Fout("Geen toegang. Log opnieuw in.");
  if (!k.klant) {
    const nieuw = await stripe("POST", "/v1/customers", { email: k.email ?? undefined, metadata: { gebruiker: id } },
                               `klant-${id}`);
    await rpc("abonnement_klant_opslaan", { p_gebruiker: id, p_klant: nieuw.id });
    k.klant = (await rpc("abonnement_klant", { p_gebruiker: id })).klant;
  }
  return k as { id: number; klant: string; aanbod: Aanbod; app_adres: string;
                abonnementen: { plan: string; status: string; stripe_abonnement: string }[] };
}

// De prijs bij Stripe voor dit plan en dit bedrag; bestaat hij nog niet, dan wordt hij gemaakt.
// Verandert de prijs in de database, dan krijgt het plan vanzelf een nieuwe prijs bij Stripe.
async function prijs(plan: string, aanbod: Aanbod) {
  const p = aanbod[plan];
  if (!p) throw new Fout("Onbekend abonnement.");
  const sleutel = `abonnement_${plan}_${centen(p.prijs)}`;
  const gevonden = await stripe("GET", `/v1/prices?active=true&lookup_keys[]=${encodeURIComponent(sleutel)}`);
  if (gevonden.data?.length) return gevonden.data[0].id as string;
  const nieuw = await stripe("POST", "/v1/prices", {
    currency: "eur", unit_amount: centen(p.prijs), recurring: { interval: "month" }, lookup_key: sleutel,
    product_data: { name: `Extra opslag ${p.naam}` }, metadata: { plan },
  }, `prijs-${sleutel}`);
  return nieuw.id as string;
}

const planVan = (sub: Record<string, any>) => {
  const item = sub.items?.data?.[0] ?? {};
  return /^abonnement_(.+)_\d+$/.exec(item.price?.lookup_key ?? "")?.[1] ?? item.price?.metadata?.plan ?? sub.metadata?.plan;
};

async function opslaan(sub: Record<string, any>) {
  const tot = sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end;
  if (sub.metadata?.community_plan) {
    // Een abonnement op een community, niet op extra opslag.
    await rpc("stripe_community_abonnement_opslaan", { p_abonnement: sub.id, p_plan: Number(sub.metadata.community_plan),
      p_gebruiker: Number(sub.metadata.gebruiker), p_status: sub.status,
      p_tot: tot ? new Date(tot * 1000).toISOString() : null, p_opzeggen: Boolean(sub.cancel_at_period_end) });
    return;
  }
  await rpc("abonnement_opslaan", { p_klant: sub.customer, p_abonnement: sub.id, p_plan: planVan(sub) ?? "",
    p_status: sub.status, p_tot: tot ? new Date(tot * 1000).toISOString() : null,
    p_opzeggen: Boolean(sub.cancel_at_period_end) });
}

const actief = (k: Awaited<ReturnType<typeof klant>>) =>
  k.abonnementen.filter((a) => ["active", "trialing", "past_due"].includes(a.status));

async function abonnementAfsluiten(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const k = await klant(g.id);
  const plan = String(body.plan ?? "");
  const prijsId = await prijs(plan, k.aanbod);
  const lopend = actief(k)[0];
  if (lopend) {
    // Al een opslagabonnement: wisselen, met verrekening van wat je al betaalde.
    const sub = await stripe("GET", `/v1/subscriptions/${lopend.stripe_abonnement}`);
    const bijgewerkt = await stripe("POST", `/v1/subscriptions/${sub.id}`, {
      items: { 0: { id: sub.items.data[0].id, price: prijsId } }, proration_behavior: "create_prorations",
      cancel_at_period_end: false, metadata: { plan },
    });
    await opslaan(bijgewerkt);
    return { gewijzigd: true };
  }
  const { app_adres } = await instellingen();
  const sessie = await stripe("POST", "/v1/checkout/sessions", {
    mode: "subscription", customer: k.klant, line_items: { 0: { price: prijsId, quantity: 1 } },
    subscription_data: { metadata: { gebruiker: g.id, plan } }, metadata: { gebruiker: g.id, plan },
    success_url: `${app_adres}/?abonnement=klaar`, cancel_url: `${app_adres}/?abonnement=stop`,
  });
  return { url: sessie.url };
}

async function abonnementBijwerken(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const k = await rpc("abonnement_klant", { p_gebruiker: g.id });
  if (!k?.klant) return { ok: true };
  const lijst = await stripe("GET", `/v1/subscriptions?customer=${encodeURIComponent(k.klant)}&status=all&limit=20`);
  for (const sub of lijst.data ?? []) await opslaan(sub);
  return { ok: true };
}

// Opzeggen gaat in aan het eind van de betaalde maand; terug = toch doorgaan.
async function abonnementOpzeggen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const k = await klant(g.id);
  const lopend = actief(k)[0];
  if (!lopend) throw new Fout("Je hebt geen abonnement.");
  await opslaan(await stripe("POST", `/v1/subscriptions/${lopend.stripe_abonnement}`,
                             { cancel_at_period_end: body.terug !== true }));
  return { ok: true };
}

async function abonnementBeheren(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const k = await klant(g.id);
  const sessie = await stripe("POST", "/v1/billing_portal/sessions",
                              { customer: k.klant, return_url: `${k.app_adres.replace(/\/$/, "")}/?abonnement=klaar` });
  return { url: sessie.url };
}

// Bij het verwijderen van je account: meteen stoppen, zodat er niets meer wordt afgeschreven.
async function abonnementStoppen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const k = await rpc("abonnement_klant", { p_gebruiker: g.id });
  for (const a of (k?.abonnementen ?? []) as { stripe_abonnement: string }[]) {
    await opslaan(await stripe("DELETE", `/v1/subscriptions/${a.stripe_abonnement}`));
  }
  for (const a of await rpc("stripe_community_abonnementen", { p_gebruiker: g.id }) as { stripe_abonnement: string }[]) {
    await opslaan(await stripe("DELETE", `/v1/subscriptions/${a.stripe_abonnement}`));
  }
  return { ok: true };
}

// --- Community's: cursussen en pakketten (eenmalig) en abonnementen (per maand of jaar) -------------------------------
// Het geld gaat via Stripe meteen naar de eigenaar van de community, min de commissie van het platform.
// Na het betalen komt de koper terug met het nummer van de betaalsessie; die controleren we bij Stripe zelf,
// zodat de toegang er meteen is (de webhook doet hetzelfde, voor als iemand de app sluit).

const sessieId = (waarde: unknown) => {
  const id = String(waarde ?? "");
  if (!/^cs_[A-Za-z0-9_]{10,200}$/.test(id)) throw new Fout("Onbekende betaling.");
  return id;
};

async function cursusGekocht(sessie: Record<string, any>) {
  if (sessie.payment_status !== "paid" || !sessie.metadata?.cursus) return false;
  return await rpc("stripe_cursus_gekocht", { p_cursus: Number(sessie.metadata.cursus),
    p_gebruiker: Number(sessie.metadata.gebruiker), p_sessie: sessie.id, p_betaling: sessie.payment_intent,
    p_bedrag: sessie.amount_total });
}

async function cursusAfrekenen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const c = await rpc("stripe_cursus", { p_cursus: Number(body.cursus), p_gebruiker: g.id });
  if (!c) throw new Fout("Deze cursus is niet (meer) te koop.");
  if (c.al) throw new Fout("Je hebt deze cursus al.");
  if (c.eigen) throw new Fout("Dit is je eigen cursus.");
  if (!c.account || !c.klaar) throw new Fout("De maker kan op dit moment geen betalingen ontvangen.");
  if (body.akkoord !== true) throw new Fout("Geef eerst aan dat je meteen wilt beginnen.");
  const { app_adres } = await instellingen();
  const sessie = await stripe("POST", "/v1/checkout/sessions", {
    mode: "payment",
    customer_email: g.email ?? undefined,
    line_items: { 0: { quantity: 1, price_data: { currency: "eur", unit_amount: c.prijs_cent,
                                                 product_data: { name: `Cursus: ${c.titel}` } } } },
    payment_intent_data: { application_fee_amount: c.commissie_cent, transfer_data: { destination: c.account },
                           metadata: { cursus: c.id, gebruiker: g.id } },
    metadata: { cursus: c.id, gebruiker: g.id },
    success_url: `${app_adres}/?cursus_betaald={CHECKOUT_SESSION_ID}`,
    cancel_url: `${app_adres}/?cursus_betaald=0`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return { url: sessie.url };
}

async function cursusControleren(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const sessie = await stripe("GET", `/v1/checkout/sessions/${sessieId(body.sessie)}`);
  if (Number(sessie.metadata?.gebruiker) !== g.id || !sessie.metadata?.cursus) throw new Fout("Onbekende betaling.");
  return { betaald: Boolean(await cursusGekocht(sessie)), cursus: Number(sessie.metadata.cursus) };
}

// Per maand of per jaar. De sleutel noemt de periode (behalve bij maand, zodat bestaande prijzen blijven gelden).
async function communityPrijs(p: Record<string, any>) {
  const jaar = p.periode === "jaar";
  const sleutel = `community_${p.id}_${p.prijs_cent}${jaar ? "_jaar" : ""}`;
  const gevonden = await stripe("GET", `/v1/prices?active=true&lookup_keys[]=${encodeURIComponent(sleutel)}`);
  if (gevonden.data?.length) return gevonden.data[0].id as string;
  const nieuw = await stripe("POST", "/v1/prices", {
    currency: "eur", unit_amount: p.prijs_cent, recurring: { interval: jaar ? "year" : "month" }, lookup_key: sleutel,
    product_data: { name: `${p.community_naam}: ${p.naam}` }, metadata: { community_plan: p.id },
  }, `prijs-${sleutel}`);
  return nieuw.id as string;
}

async function communityAbonneren(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const p = await rpc("stripe_community_plan", { p_plan: Number(body.plan), p_gebruiker: g.id });
  if (!p) throw new Fout("Dit abonnement bestaat niet (meer).");
  if (p.al) throw new Fout("Je hebt al een abonnement op deze community.");
  if (p.eigen) throw new Fout("Dit is je eigen community.");
  if (!p.account || !p.klaar) throw new Fout("De eigenaar kan op dit moment geen betalingen ontvangen.");
  const k = await klant(g.id);
  const { app_adres } = await instellingen();
  const metadata = { gebruiker: g.id, community_plan: p.id };
  const sessie = await stripe("POST", "/v1/checkout/sessions", {
    mode: "subscription", customer: k.klant, line_items: { 0: { price: await communityPrijs(p), quantity: 1 } },
    subscription_data: { metadata, application_fee_percent: Number(p.procent),
                         transfer_data: { destination: p.account } },
    metadata,
    success_url: `${app_adres}/?community_abonnement={CHECKOUT_SESSION_ID}`,
    cancel_url: `${app_adres}/?community_abonnement=0`,
  });
  return { url: sessie.url };
}

async function communityControleren(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const sessie = await stripe("GET", `/v1/checkout/sessions/${sessieId(body.sessie)}?expand[]=subscription`);
  if (Number(sessie.metadata?.gebruiker) !== g.id || !sessie.metadata?.community_plan) throw new Fout("Onbekende betaling.");
  if (sessie.subscription && typeof sessie.subscription === "object") await opslaan(sessie.subscription);
  return { actief: ["active", "trialing"].includes(sessie.subscription?.status) };
}

// Een pakket: een paar cursussen of trainingen samen, eenmalig betaald. Werkt verder als een cursus kopen.
async function pakketGekocht(sessie: Record<string, any>) {
  if (sessie.payment_status !== "paid" || !sessie.metadata?.pakket) return false;
  return await rpc("stripe_pakket_gekocht", { p_pakket: Number(sessie.metadata.pakket),
    p_gebruiker: Number(sessie.metadata.gebruiker), p_sessie: sessie.id, p_betaling: sessie.payment_intent,
    p_bedrag: sessie.amount_total });
}

async function pakketAfrekenen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const k = await rpc("stripe_pakket", { p_pakket: Number(body.pakket), p_gebruiker: g.id });
  if (!k) throw new Fout("Dit pakket is niet (meer) te koop.");
  if (k.al) throw new Fout("Je hebt dit pakket al.");
  if (k.eigen) throw new Fout("Dit is je eigen pakket.");
  if (!k.account || !k.klaar) throw new Fout("De maker kan op dit moment geen betalingen ontvangen.");
  if (body.akkoord !== true) throw new Fout("Geef eerst aan dat je meteen wilt beginnen.");
  const { app_adres } = await instellingen();
  const sessie = await stripe("POST", "/v1/checkout/sessions", {
    mode: "payment",
    customer_email: g.email ?? undefined,
    line_items: { 0: { quantity: 1, price_data: { currency: "eur", unit_amount: k.prijs_cent,
                                                 product_data: { name: `Pakket: ${k.titel}` } } } },
    payment_intent_data: { application_fee_amount: k.commissie_cent, transfer_data: { destination: k.account },
                           metadata: { pakket: k.id, gebruiker: g.id } },
    metadata: { pakket: k.id, gebruiker: g.id },
    success_url: `${app_adres}/?pakket_betaald={CHECKOUT_SESSION_ID}`,
    cancel_url: `${app_adres}/?pakket_betaald=0`,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  });
  return { url: sessie.url };
}

async function pakketControleren(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const sessie = await stripe("GET", `/v1/checkout/sessions/${sessieId(body.sessie)}`);
  if (Number(sessie.metadata?.gebruiker) !== g.id || !sessie.metadata?.pakket) throw new Fout("Onbekende betaling.");
  return { betaald: Boolean(await pakketGekocht(sessie)), pakket: Number(sessie.metadata.pakket) };
}

// Opzeggen aan het eind van de betaalde periode (terug = toch doorgaan). Kan ook als je geen lid meer bent.
async function communityOpzeggen(body: Record<string, unknown>) {
  const g = await gebruiker(body);
  const lijst = await rpc("stripe_community_abonnementen", { p_gebruiker: g.id }) as
    { stripe_abonnement: string; plan: number; status: string }[];
  const a = lijst.find((x) => x.plan === Number(body.plan) && ["active", "trialing", "past_due"].includes(x.status));
  if (!a) throw new Fout("Je hebt dit abonnement niet.");
  await opslaan(await stripe("POST", `/v1/subscriptions/${a.stripe_abonnement}`,
                             { cancel_at_period_end: body.terug !== true }));
  return { ok: true };
}

// --- Webhook --------------------------------------------------------------------------------

async function handtekeningKlopt(payload: string, kop: string, geheim: string) {
  const delen = Object.fromEntries(kop.split(",").map((d) => d.split("=", 2)).filter((d) => d.length === 2));
  const tijd = Number(delen.t);
  if (!tijd || Math.abs(Date.now() / 1000 - tijd) > 300) return false;
  const sleutel = await crypto.subtle.importKey("raw", new TextEncoder().encode(geheim), { name: "HMAC", hash: "SHA-256" },
                                               false, ["sign"]);
  const handtekening = await crypto.subtle.sign("HMAC", sleutel, new TextEncoder().encode(`${delen.t}.${payload}`));
  const verwacht = Array.from(new Uint8Array(handtekening)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const gekregen = kop.split(",").filter((d) => d.startsWith("v1=")).map((d) => d.slice(3));
  return gekregen.some((v) => v.length === verwacht.length &&
    [...v].reduce((verschil, teken, i) => verschil | (teken.charCodeAt(0) ^ verwacht.charCodeAt(i)), 0) === 0);
}

async function webhook(payload: string, kop: string) {
  const { webhook_geheim } = await instellingen();
  if (!webhook_geheim || !await handtekeningKlopt(payload, kop, webhook_geheim)) {
    return new Response("ongeldige handtekening", { status: 400 });
  }
  const gebeurtenis = JSON.parse(payload);
  const object = gebeurtenis.data?.object ?? {};
  if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(gebeurtenis.type)
      && object.payment_status === "paid" && object.metadata?.bestelling) {
    await rpc("stripe_betaald", { p_id: Number(object.metadata.bestelling), p_sessie: object.id,
                                  p_betaling: object.payment_intent });
  } else if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(gebeurtenis.type)
             && object.payment_status === "paid" && object.metadata?.boekingen) {
    const r = await rpc("stripe_boeking_betaald", { p_sessie: object.id, p_betaling: object.payment_intent });
    if (r?.terug) await verrekenen(null);
  } else if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(gebeurtenis.type)
             && object.metadata?.cursus) {
    await cursusGekocht(object);
  } else if (["checkout.session.completed", "checkout.session.async_payment_succeeded"].includes(gebeurtenis.type)
             && object.metadata?.pakket) {
    await pakketGekocht(object);
  } else if (gebeurtenis.type.startsWith("customer.subscription.")) {
    await opslaan(object);
  } else if (gebeurtenis.type === "account.updated") {
    await rpc("stripe_account_klaar", { p_account: object.id,
                                        p_klaar: Boolean(object.details_submitted && object.payouts_enabled) });
  }
  return new Response("ok");
}

const ACTIES: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  verkoper_aanmelden: verkoperAanmelden,
  verkoper_status: verkoperStatus,
  afrekenen,
  ontvangen,
  geschil_besluiten: geschilBesluiten,
  boeking_afrekenen: boekingAfrekenen,
  boekingen_verrekenen: boekingenVerrekenen,
  abonnement_afsluiten: abonnementAfsluiten,
  abonnement_bijwerken: abonnementBijwerken,
  abonnement_opzeggen: abonnementOpzeggen,
  abonnement_beheren: abonnementBeheren,
  abonnement_stoppen: abonnementStoppen,
  cursus_afrekenen: cursusAfrekenen,
  cursus_controleren: cursusControleren,
  community_abonneren: communityAbonneren,
  community_controleren: communityControleren,
  community_opzeggen: communityOpzeggen,
  pakket_afrekenen: pakketAfrekenen,
  pakket_controleren: pakketControleren,
};

// De chat in de app roept deze functie rechtstreeks vanuit de browser aan.
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
               "Access-Control-Allow-Headers": "content-type, apikey, authorization, x-client-info" };

export async function verwerk(verzoek: Request): Promise<Response> {
  if (verzoek.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (verzoek.method !== "POST") return new Response("alleen POST", { status: 405 });
  const payload = await verzoek.text();
  try {
    const kop = verzoek.headers.get("stripe-signature");
    if (kop) return await webhook(payload, kop);
    const body = JSON.parse(payload || "{}");
    const actie = ACTIES[body.actie];
    if (!actie) return Response.json({ fout: "Onbekende actie." }, { status: 400, headers: CORS });
    return Response.json(await actie(body), { headers: CORS });
  } catch (fout) {
    if (fout instanceof Fout) return Response.json({ fout: fout.message }, { headers: CORS });
    console.error(fout);
    return Response.json({ fout: "Er ging iets mis bij het betalen. Probeer het later opnieuw." }, { status: 500, headers: CORS });
  }
}

Deno.serve(verwerk);
