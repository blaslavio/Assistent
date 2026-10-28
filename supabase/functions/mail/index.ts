// Je mailbox lezen voor de nieuwe app (die draait in de browser en kan zelf geen IMAP).
//
// Alleen lezen: de map wordt met EXAMINE geopend, dus niets wordt als gelezen gemarkeerd, verplaatst of gewist.
// Je mailinstellingen haalt deze functie zelf uit je gegevens; je wachtwoord komt dus niet van de browser hierheen
// (behalve bij "testen", voordat je het bewaart). Er wordt niets bewaard en niets gelogd van je mail.
//
// Wie je bent, staat in de kop x-api-key: "abo." + base64(JSON [naam, sessie]), net als bij de functie "ai".

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const AANTAL = 20;
const PER_BERICHT = 40_000;
const WACHTTIJD = 20_000;

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
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

// --- MIME ----------------------------------------------------------------------------------------------------------

const latin = (b: Uint8Array) => Array.from(b, (c) => String.fromCharCode(c)).join("");
const bytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

function tekenset(b: Uint8Array, naam = "utf-8") {
  try {
    return new TextDecoder(naam.toLowerCase().replace(/^(us-)?ascii$/, "utf-8"), { fatal: false }).decode(b);
  } catch {
    return new TextDecoder("utf-8").decode(b);
  }
}

function qp(s: string, kop = false) {
  if (kop) s = s.replace(/_/g, " ");
  return bytes(s.replace(/=\r?\n/g, "").replace(/=([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))));
}

function b64(s: string) {
  const schoon = s.replace(/[^A-Za-z0-9+/=]/g, "").replace(/=+$/, "");
  const heel = schoon.slice(0, schoon.length - (schoon.length % 4 === 1 ? 1 : 0));
  try {
    return bytes(atob(heel + "=".repeat((4 - (heel.length % 4)) % 4)));
  } catch {
    return new Uint8Array();
  }
}

/** "=?utf-8?B?...?=" en "=?iso-8859-1?Q?...?=" in koppen leesbaar maken. */
export function kopTekst(s: string) {
  return s.replace(/\?=\s+=\?/g, "?==?").replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_, set, soort, inhoud) =>
    tekenset(soort.toUpperCase() === "B" ? b64(inhoud) : qp(inhoud, true), set)).replace(/\s+/g, " ").trim();
}

type Deel = { koppen: Record<string, string>; lijf: string };

function splitsKoppen(ruw: string): Deel {
  const grens = ruw.search(/\r?\n\r?\n/);
  const kop = grens < 0 ? ruw : ruw.slice(0, grens);
  const lijf = grens < 0 ? "" : ruw.slice(grens).replace(/^\r?\n\r?\n/, "");
  const koppen: Record<string, string> = {};
  for (const regel of kop.replace(/\r?\n[ \t]+/g, " ").split(/\r?\n/)) {
    const i = regel.indexOf(":");
    if (i > 0) koppen[regel.slice(0, i).trim().toLowerCase()] ??= regel.slice(i + 1).trim();
  }
  return { koppen, lijf };
}

const param = (kop: string, naam: string) =>
  kop.match(new RegExp(`${naam}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, "i"))?.slice(1).find(Boolean) ?? "";

function zonderHtml(h: string) {
  return h.replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|tr|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}

/** De leesbare tekst van een bericht (eerst text/plain, anders text/html zonder opmaak). */
export function tekstVan(deel: Deel, diepte = 0): { soort: "plain" | "html" | ""; tekst: string } {
  const type = (deel.koppen["content-type"] ?? "text/plain").toLowerCase();
  if (type.startsWith("multipart/") && diepte < 5) {
    const grens = param(deel.koppen["content-type"] ?? "", "boundary");
    if (!grens) return { soort: "", tekst: "" };
    const stukken = deel.lijf.split(`--${grens}`).slice(1).filter((s) => !s.startsWith("--")).map(splitsKoppen);
    let html = "";
    for (const s of stukken) {
      const t = tekstVan(s, diepte + 1);
      if (t.soort === "plain" && t.tekst.trim()) return t;
      if (t.soort === "html" && !html) html = t.tekst;
    }
    return { soort: html ? "html" : "", tekst: html };
  }
  if (!type.startsWith("text/") || /attachment/i.test(deel.koppen["content-disposition"] ?? "")) return { soort: "", tekst: "" };
  const codering = (deel.koppen["content-transfer-encoding"] ?? "").toLowerCase();
  const ruw = codering === "base64" ? b64(deel.lijf) : codering === "quoted-printable" ? qp(deel.lijf) : bytes(deel.lijf);
  const tekst = tekenset(ruw, param(type, "charset") || "utf-8");
  return type.startsWith("text/html") ? { soort: "html", tekst: zonderHtml(tekst) } : { soort: "plain", tekst };
}

export type Kort = { uid: number; van: string; adres: string; onderwerp: string; datum: string; gelezen: boolean; tekst: string };

// Koppen horen ASCII te zijn, maar sommige afzenders sturen er gewoon UTF-8 in.
const kopUtf = (s: string) => kopTekst(/[\x80-\xff]/.test(s) ? tekenset(bytes(s)) : s);

export function bericht(uid: number, gelezen: boolean, ruw: string, max = 1500): Kort {
  const deel = splitsKoppen(ruw);
  const vanRuw = kopUtf(deel.koppen.from ?? "");
  const adres = vanRuw.match(/<([^>]+)>/)?.[1] ?? vanRuw.match(/[\w.+-]+@[\w.-]+/)?.[0] ?? "";
  const van = vanRuw.replace(/<[^>]*>/, "").replace(/"/g, "").trim() || adres;
  const d = new Date(deel.koppen.date ?? "");
  const tekst = tekstVan(deel).tekst.split(/\r?\n/).filter((r) => !r.startsWith(">")).join("\n")
    .replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n").trim().slice(0, max);
  return { uid, van, adres, onderwerp: kopUtf(deel.koppen.subject ?? "") || "(geen onderwerp)",
    datum: isNaN(d.getTime()) ? "" : d.toISOString(), gelezen, tekst };
}

// --- IMAP --------------------------------------------------------------------------------------------------------

export type Antwoord = { regels: string[]; literals: Uint8Array[] };

/** Een kleine IMAP-client: genoeg om in te loggen, een map alleen-lezen te openen en berichten op te halen. */
export class Imap {
  #buffer = new Uint8Array();
  #nummer = 0;
  constructor(private verbinding: Deno.Conn) {}

  static async open(host: string, poort: number, opties: { caCerts?: string[] } = {}) {
    const v = await Deno.connectTls({ hostname: host, port: poort, ...opties });
    const imap = new Imap(v);
    const groet = await imap.#regel();
    if (!/^\* (OK|PREAUTH)/i.test(groet)) throw new Error("Deze mailserver antwoordt niet zoals verwacht.");
    return imap;
  }

  async #meer() {
    const stuk = new Uint8Array(65536);
    const n = await this.verbinding.read(stuk);
    if (n === null) throw new Error("De mailserver verbrak de verbinding.");
    const nieuw = new Uint8Array(this.#buffer.length + n);
    nieuw.set(this.#buffer);
    nieuw.set(stuk.subarray(0, n), this.#buffer.length);
    this.#buffer = nieuw;
  }

  async #regel(): Promise<string> {
    while (true) {
      const i = this.#buffer.indexOf(10);
      if (i >= 0) {
        const r = latin(this.#buffer.subarray(0, i)).replace(/\r$/, "");
        this.#buffer = this.#buffer.subarray(i + 1);
        return r;
      }
      if (this.#buffer.length > 10_000_000) throw new Error("Antwoord te groot.");
      await this.#meer();
    }
  }

  async #precies(n: number) {
    while (this.#buffer.length < n) await this.#meer();
    const uit = this.#buffer.slice(0, n);
    this.#buffer = this.#buffer.subarray(n);
    return uit;
  }

  /** Stuurt een opdracht en leest alles tot het antwoord met hetzelfde label. Literals ({n}) komen apart terug. */
  async opdracht(tekst: string): Promise<Antwoord> {
    const label = `A${++this.#nummer}`;
    await this.verbinding.write(new TextEncoder().encode(`${label} ${tekst}\r\n`));
    const regels: string[] = [];
    const literals: Uint8Array[] = [];
    while (true) {
      let r = await this.#regel();
      // Een regel kan een of meer literals bevatten; die plakken we eraan vast als plaatshouder.
      while (true) {
        const m = r.match(/\{(\d+)\}$/);
        if (!m) break;
        literals.push(await this.#precies(Number(m[1])));
        r = `${r.slice(0, -m[0].length)}\u0000${literals.length - 1}\u0000${await this.#regel()}`;
      }
      if (r.startsWith(`${label} `)) {
        if (!/^\S+ OK/i.test(r)) throw new ImapFout(r.slice(label.length + 1));
        return { regels, literals };
      }
      regels.push(r);
    }
  }

  sluiten() {
    this.opdracht("LOGOUT").catch(() => {}).finally(() => { try { this.verbinding.close(); } catch { /* al dicht */ } });
  }
}

export class ImapFout extends Error {}

export const tekstje = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export type Instellingen = { imap?: string; imap_poort?: number | string; adres?: string; gebruiker?: string; wachtwoord?: string };

export async function inloggen(m: Instellingen, opties: { caCerts?: string[] } = {}) {
  if (!m.imap || !m.adres || !m.wachtwoord) throw new GeenMail();
  if (!/^[a-z0-9.-]+$/i.test(m.imap)) throw new ImapFout("Onbekende mailserver.");
  const imap = await Imap.open(m.imap, Number(m.imap_poort) || 993, opties);
  try {
    await imap.opdracht(`LOGIN ${tekstje(m.gebruiker || m.adres)} ${tekstje(m.wachtwoord)}`);
  } catch (e) {
    imap.sluiten();
    throw e instanceof ImapFout ? new ImapFout("Inloggen bij je mail lukte niet. Klopt het app-wachtwoord?") : e;
  }
  return imap;
}

export class GeenMail extends Error {}

/** De nieuwste berichten in de inbox, alleen-lezen. */
export async function lijst(imap: Imap, aantal = AANTAL): Promise<Kort[]> {
  await imap.opdracht("EXAMINE INBOX");
  const zoek = await imap.opdracht("UID SEARCH ALL");
  const uids = (zoek.regels.find((r) => r.startsWith("* SEARCH")) ?? "").slice(8).trim().split(/\s+/).filter(Boolean)
    .map(Number).filter((n) => n > 0).sort((a, b) => a - b).slice(-aantal);
  if (!uids.length) return [];
  const a = await imap.opdracht(`UID FETCH ${uids.join(",")} (UID FLAGS BODY.PEEK[]<0.${PER_BERICHT}>)`);
  const uit: Kort[] = [];
  for (const r of a.regels) {
    const uid = Number(r.match(/UID (\d+)/)?.[1]);
    const lit = r.match(/\u0000(\d+)\u0000/);
    if (!uid || !lit) continue;
    const gelezen = /FLAGS \([^)]*\\Seen/i.test(r);
    uit.push(bericht(uid, gelezen, latin(a.literals[Number(lit[1])])));
  }
  return uit.sort((x, y) => y.uid - x.uid);
}

// --- Verzoeken ---------------------------------------------------------------------------------------------------

const metTijd = <T>(p: Promise<T>) => Promise.race([p, new Promise<never>((_, nee) =>
  setTimeout(() => nee(new ImapFout("Je mailserver reageert te traag.")), WACHTTIJD))]);

export async function verwerk(verzoek: Request): Promise<Response> {
  if (verzoek.method !== "POST") return new Response("alleen POST", { status: 405 });
  const wie = wieBenJe(verzoek.headers.get("x-api-key") ?? "");
  try {
    const g = wie && await rpc("mijn_gegevens", { p_naam: wie[0], p_wachtwoord: wie[1] });
    if (!g || g.geen_toegang) return Response.json({ fout: "Log opnieuw in." }, { status: 401 });
    const body = await verzoek.json().catch(() => ({}));
    if (body.actie === "testen") {
      const imap = await metTijd(inloggen(body.mail ?? {}));
      imap.sluiten();
      return Response.json({ ok: true });
    }
    const m: Instellingen = g.data?.instellingen?.mail ?? {};
    const imap = await metTijd(inloggen(m));
    try {
      return Response.json({ berichten: await metTijd(lijst(imap)) });
    } finally {
      imap.sluiten();
    }
  } catch (e) {
    if (e instanceof GeenMail) return Response.json({ geen_mail: true });
    if (e instanceof ImapFout) return Response.json({ fout: e.message });
    console.error("mail", e instanceof Error ? e.name : "fout");
    return Response.json({ fout: "Je mail is even niet bereikbaar. Probeer het zo opnieuw." });
  }
}

const HERKOMSTEN = new Set(["https://blaslavio.github.io", "https://eisreyyrtvlgtjpqiyhpm2.streamlit.app"]);

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
  const h = new Headers(antwoord.headers);
  for (const [k, v] of Object.entries(koppen)) h.set(k, v);
  return new Response(antwoord.body, { status: antwoord.status, headers: h });
}

if (import.meta.main) Deno.serve(metCors);
