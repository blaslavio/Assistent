// Je eigen bestanden in de app, opgeslagen in Supabase Storage (bucket 'bestanden', privé).
//
// Alleen deze functie kan bij de opslag (met de service-rol). Ze controleert eerst wie je bent en of het bestand
// van jou is, en geeft dan een kortlevende link: om te uploaden (na een controle of er nog ruimte is) of om te
// downloaden. Wat iemand mag en hoeveel ruimte er is, staat in de database (sql/bestanden.sql).
//
// Acties (POST, JSON met naam en wachtwoord/sessie): reserveren, bevestigen, downloaden, definitief, opruimen.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const BUCKET = "bestanden";

class Fout extends Error {}

const kop = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { ...kop, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status} ${await r.text()}`);
  return r.json();
}

async function opslag(methode: string, pad: string, body?: unknown) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1${pad}`, {
    method: methode,
    headers: { ...kop, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const tekst = await r.text();
  if (!r.ok) {
    console.error("opslag", methode, pad.split("/").slice(0, 3).join("/"), r.status, tekst.slice(0, 200));
    throw new Fout("De opslag is even niet bereikbaar. Probeer het later opnieuw.");
  }
  return tekst ? JSON.parse(tekst) : {};
}

async function gebruiker(body: Record<string, unknown>) {
  const id = await rpc("bank_gebruiker", { p_naam: body.naam ?? "", p_wachtwoord: body.wachtwoord ?? "" });
  if (!id) throw new Fout("Geen toegang. Log opnieuw in.");
  return id as number;
}

const geldigPad = (pad: string, id: number) => new RegExp(`^${id}/[0-9a-f]{32}$`).test(pad);

// De echte grootte van wat er is geüpload (null = er staat niets).
async function grootte(pad: string): Promise<number | null> {
  const [map, naam] = pad.split("/");
  const lijst = await opslag("POST", `/object/list/${BUCKET}`, { prefix: map, search: naam, limit: 2 });
  const item = (Array.isArray(lijst) ? lijst : []).find((i: Record<string, any>) => i.name === naam);
  return item ? Number(item.metadata?.size ?? 0) : null;
}

async function wissen(paden: string[]) {
  for (let i = 0; i < paden.length; i += 100) {
    await opslag("DELETE", `/object/${BUCKET}`, { prefixes: paden.slice(i, i + 100) });
  }
}

async function reserveren(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const r = await rpc("bestand_reserveren", { p_gebruiker: id, p_map: String(body.map ?? ""),
    p_naam: String(body.bestandsnaam ?? ""), p_grootte: Math.floor(Number(body.grootte ?? -1)),
    p_mime: String(body.mime ?? "") });
  if (r.fout) return r;
  const link = await opslag("POST", `/object/upload/sign/${BUCKET}/${r.pad}`);
  return { id: r.id, upload: `${SUPABASE_URL}/storage/v1${link.url}` };
}

async function bevestigen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const bestand = Number(body.id);
  const pad = await rpc("bestand_pad_bezig", { p_gebruiker: id, p_id: bestand });
  if (!pad || !geldigPad(pad, id)) throw new Fout("Niet gevonden.");
  // De grootte die telt, is wat er echt staat, niet wat de app opgaf.
  const echt = await grootte(pad);
  if (echt === null) return { fout: "Het uploaden is niet gelukt. Probeer het opnieuw." };
  const r = await rpc("bestand_bevestigen", { p_gebruiker: id, p_id: bestand, p_grootte: echt });
  if (r.fout && r.pad) await wissen([r.pad]);
  return r.fout ? { fout: r.fout, vol: r.vol } : r;
}

async function downloaden(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  const b = await rpc("bestand_pad", { p_gebruiker: id, p_id: Number(body.id) });
  if (!b || !geldigPad(b.pad, id)) throw new Fout("Niet gevonden.");
  const link = await opslag("POST", `/object/sign/${BUCKET}/${b.pad}`, { expiresIn: 300 });
  const los = body.opslaan ? `&download=${encodeURIComponent(b.naam)}` : "";
  return { url: `${SUPABASE_URL}/storage/v1${link.signedURL}${los}`, naam: b.naam, mime: b.mime, grootte: b.grootte };
}

async function opruimenVoor(id: number, item: number | null, alles: boolean) {
  const lijst = await rpc("bestanden_op_te_ruimen", { p_gebruiker: id, p_id: item, p_alles: alles });
  const paden = lijst.map((b: { pad: string }) => b.pad).filter((p: string) => p && geldigPad(p, id));
  if (paden.length) await wissen(paden);
  const aantal = await rpc("bestanden_verwijderd", { p_gebruiker: id, p_ids: lijst.map((b: { id: number }) => b.id) });
  return { ok: true, aantal };
}

// Eén ding uit je prullenbak echt weggooien (een map met alles erin).
async function definitief(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  return opruimenVoor(id, Number(body.id), false);
}

// Verlopen prullenbak (30 dagen) en afgebroken uploads; met alles: true alles (bij account verwijderen).
async function opruimen(body: Record<string, unknown>) {
  const id = await gebruiker(body);
  return opruimenVoor(id, null, body.alles === true);
}

const ACTIES: Record<string, (body: Record<string, unknown>) => Promise<unknown>> = {
  reserveren, bevestigen, downloaden, definitief, opruimen,
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
    return Response.json({ fout: "Er ging iets mis met je bestanden. Probeer het later opnieuw." }, { status: 500 });
  }
}

Deno.serve(verwerk);
