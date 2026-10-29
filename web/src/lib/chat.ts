// De chat met mensen, met end-to-end-versleuteling. Zelfde werkwijze als de chat in de huidige app, zodat beide
// apps met elkaar kunnen praten:
// - Elk apparaat heeft een eigen sleutelpaar om te versleutelen (ECDH P-256) en een om te ondertekenen (ECDSA P-256).
//   De geheime sleutels worden hier gemaakt, kunnen niet worden uitgelezen en staan alleen in IndexedDB.
// - Per bericht een nieuwe willekeurige sleutel (AES-256-GCM), voor elk apparaat van elke deelnemer apart ingepakt
//   (ECDH met een tijdelijke sleutel + HKDF + AES-GCM). Het bericht wordt ondertekend. De server ziet alleen geheimtaal.
import { alsIk, huidigeSessie } from "../api";

const enc = new TextEncoder();
const dec = new TextDecoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const hex = (buf: ArrayBuffer) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const rnd = (n: number) => crypto.getRandomValues(new Uint8Array(n));

// --- Opslag op dit apparaat ----------------------------------------------------------------------------------------

let db: Promise<IDBDatabase> | null = null;
function idb() {
  db ??= new Promise((klaar, mis) => {
    const r = indexedDB.open("assistent-chat", 2);
    r.onupgradeneeded = () => {
      for (const naam of ["sleutels", "geverifieerd", "voorbeeld"])
        if (!r.result.objectStoreNames.contains(naam)) r.result.createObjectStore(naam);
    };
    r.onsuccess = () => klaar(r.result);
    r.onerror = () => mis(r.error);
  });
  return db;
}
async function idbGet<T>(store: string, key: string): Promise<T | undefined> {
  const d = await idb();
  return new Promise((klaar, mis) => {
    const r = d.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => klaar(r.result as T);
    r.onerror = () => mis(r.error);
  });
}
async function idbPut(store: string, key: string, value: unknown) {
  const d = await idb();
  return new Promise<void>((klaar, mis) => {
    const t = d.transaction(store, "readwrite");
    t.objectStore(store).put(value, key);
    t.oncomplete = () => klaar();
    t.onerror = () => mis(t.error);
  });
}

// --- Cryptografie ------------------------------------------------------------------------------------------------

type Jwk = { kty: "EC"; crv: string; x: string; y: string };
const ECDH = { name: "ECDH", namedCurve: "P-256" };
const ECDSA = { name: "ECDSA", namedCurve: "P-256" };
const pub = (jwk: JsonWebKey): Jwk => ({ kty: "EC", crv: jwk.crv!, x: jwk.x!, y: jwk.y! });

async function vingerafdruk(ecdh: Jwk, teken: Jwk) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(`${ecdh.x}.${ecdh.y}.${teken.x}.${teken.y}`)));
}

async function nieuwApparaat() {
  // false: de geheime sleutel kan nooit uit de browser worden gehaald, ook niet door de app zelf.
  const ecdh = await crypto.subtle.generateKey(ECDH, false, ["deriveBits"]);
  const teken = await crypto.subtle.generateKey(ECDSA, false, ["sign", "verify"]);
  const ecdhJwk = pub(await crypto.subtle.exportKey("jwk", ecdh.publicKey));
  const tekenJwk = pub(await crypto.subtle.exportKey("jwk", teken.publicKey));
  return { ecdh, teken, ecdhJwk, tekenJwk, vinger: await vingerafdruk(ecdhJwk, tekenJwk) };
}

async function inpakSleutel(gedeeld: ArrayBuffer, iv: Uint8Array, apparaatId: number, gebruik: "encrypt" | "decrypt") {
  const basis = await crypto.subtle.importKey("raw", gedeeld, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: iv as BufferSource, info: enc.encode(`chat:${apparaatId}`) },
    basis, { name: "AES-GCM", length: 256 }, false, [gebruik]);
}

const ondertekenTekst = (gesprek: number | string, apparaat: number, iv: string, inhoud: string, epk: Jwk) =>
  enc.encode(`${gesprek}|${apparaat}|${iv}|${inhoud}|${epk.x}|${epk.y}`);

type Sleutels = { ecdh: CryptoKeyPair; teken: CryptoKeyPair };
type Apparaat = { id: number; gebruiker: number; ecdh: Jwk; vingerafdruk: string };

async function versleutel(ik: Ik, gesprek: number | string, apparaten: Apparaat[], bericht: Bericht) {
  const sleutel = rnd(32);
  const iv = rnd(12);
  const aes = await crypto.subtle.importKey("raw", sleutel, "AES-GCM", false, ["encrypt"]);
  const inhoud = b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`${gesprek}|${ik.apparaat}`) },
    aes, enc.encode(JSON.stringify(bericht))));
  const tijdelijk = await crypto.subtle.generateKey(ECDH, true, ["deriveBits"]) as CryptoKeyPair;
  const epk = pub(await crypto.subtle.exportKey("jwk", tijdelijk.publicKey));
  const sleutels: Record<number, { i: string; w: string }> = {};
  for (const a of apparaten) {
    // Eén toestel met een kapotte sleutel mag de rest niet tegenhouden: dat toestel krijgt dit bericht dan niet.
    let hunPub: CryptoKey;
    try {
      hunPub = await crypto.subtle.importKey("jwk", a.ecdh, ECDH, false, []);
    } catch {
      continue;
    }
    const gedeeld = await crypto.subtle.deriveBits({ name: "ECDH", public: hunPub }, tijdelijk.privateKey, 256);
    const inpak = await inpakSleutel(gedeeld, iv, a.id, "encrypt");
    const iv2 = rnd(12);
    sleutels[a.id] = { i: b64(iv2), w: b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv2 }, inpak, sleutel)) };
  }
  const ivB64 = b64(iv);
  const handtekening = b64(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, ik.sleutels.teken.privateKey,
    ondertekenTekst(gesprek, ik.apparaat, ivB64, inhoud, epk)));
  return { inhoud, iv: ivB64, epk, sleutels, handtekening };
}

const controleSleutels = new Map<number, CryptoKey>();
async function ontsleutel(ik: Ik, gesprek: number | string, b: RuwBericht): Promise<{ bericht?: Bericht; fout?: string }> {
  const controle = controleSleutels.get(b.apparaat) ?? await crypto.subtle.importKey("jwk", b.teken, ECDSA, false, ["verify"]);
  controleSleutels.set(b.apparaat, controle);
  const echt = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, controle, unb64(b.handtekening),
    ondertekenTekst(gesprek, b.apparaat, b.iv, b.inhoud!, b.epk));
  if (!echt) return { fout: "onecht" };
  if (!b.sleutel) return { fout: "geen_sleutel" };
  const iv = unb64(b.iv);
  const hunPub = await crypto.subtle.importKey("jwk", b.epk, ECDH, false, []);
  const gedeeld = await crypto.subtle.deriveBits({ name: "ECDH", public: hunPub }, ik.sleutels.ecdh.privateKey, 256);
  const inpak = await inpakSleutel(gedeeld, iv, ik.apparaat, "decrypt");
  const sleutel = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(b.sleutel.i) }, inpak, unb64(b.sleutel.w));
  const aes = await crypto.subtle.importKey("raw", sleutel, "AES-GCM", false, ["decrypt"]);
  const tekst = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: enc.encode(`${gesprek}|${b.apparaat}`) },
    aes, unb64(b.inhoud!));
  return { bericht: JSON.parse(dec.decode(tekst)) };
}

/** Twaalf groepjes van vijf cijfers die beide kanten moeten zien om te weten dat niemand meeleest. */
export async function veiligheidscode(apparatenA: Apparaat[], apparatenB: Apparaat[]) {
  const deel = async (lijst: Apparaat[]) =>
    hex(await crypto.subtle.digest("SHA-256", enc.encode(lijst.map((a) => a.vingerafdruk).sort().join(","))));
  const [a, b] = [await deel(apparatenA), await deel(apparatenB)].sort();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(a + b)));
  const groepen = [];
  for (let i = 0; i < 12; i++) groepen.push(String(((h[i * 2] << 8) | h[i * 2 + 1]) % 100000).padStart(5, "0"));
  return groepen.join(" ");
}

// --- Gesprekken en berichten ------------------------------------------------------------------------------------

export type Lid = { id: number; naam: string; gebruikersnaam?: string; status: string; gelezen_tot: number;
  ontvangen_tot: number; contact?: boolean };
export type Gesprek = { id: number; soort: "twee" | "groep"; naam?: string; status: "lid" | "verzoek"; laatst?: string;
  ongelezen: number; laatste_id?: number; leden: Lid[]; community?: number | null; alleen_beheer?: boolean;
  beheerder?: boolean; verdwijnen?: number | null; community_naam?: string | null };
export type Bericht = { t: string; tekst?: string; titel?: string; vraag?: string; naam?: string; [k: string]: unknown };
type RuwBericht = { id: number; afzender: number; apparaat: number; aangemaakt: string; weg: boolean; inhoud?: string;
  iv: string; epk: Jwk; sleutel?: { i: string; w: string }; handtekening: string; teken: Jwk };
export type Regel = { id: number; afzender: number; tijd: string; weg: boolean; bericht?: Bericht; fout?: string };

type Ik = { apparaat: number; gebruiker: number; sleutels: Sleutels };
let ik: Ik | null = null;

async function rpc<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

function apparaatNaam() {
  const ua = navigator.userAgent;
  return `Nieuwe app (${/iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : "browser"})`;
}

/** Meldt dit apparaat aan voor de chat (eenmalig) en geeft je eigen id. */
export async function starten() {
  const s = huidigeSessie();
  const sleutelNaam = `apparaat:${s?.naam || "eigenaar"}`;
  let opgeslagen = await idbGet<{ apparaat: number; sleutels: Sleutels }>("sleutels", sleutelNaam);
  let wie = opgeslagen ? await rpc<{ gebruiker: number; apparaat_geldig: boolean }>("chat_ik", { p_apparaat: opgeslagen.apparaat }) : null;
  if (!opgeslagen || !wie?.apparaat_geldig) {
    const nieuw = await nieuwApparaat();
    const r = await rpc<{ id: number }>("chat_apparaat_aanmelden", { p_apparaat: apparaatNaam(), p_ecdh: nieuw.ecdhJwk,
      p_teken: nieuw.tekenJwk, p_vingerafdruk: nieuw.vinger });
    opgeslagen = { apparaat: r.id, sleutels: { ecdh: nieuw.ecdh, teken: nieuw.teken } };
    await idbPut("sleutels", sleutelNaam, opgeslagen);
    wie = await rpc("chat_ik", { p_apparaat: r.id });
  }
  ik = { apparaat: opgeslagen.apparaat, gebruiker: wie!.gebruiker, sleutels: opgeslagen.sleutels };
  return ik.gebruiker;
}

/** Of dit apparaat al eens voor de chat is aangemeld. Zo niet, dan maken we hier nog geen sleutels. */
export async function startenAlsBekend() {
  if (ik) return ik.gebruiker;
  const s = huidigeSessie();
  const opgeslagen = await idbGet("sleutels", `apparaat:${s?.naam || "eigenaar"}`).catch(() => undefined);
  return opgeslagen ? starten() : null;
}

export const mijnApparaat = () => ik?.apparaat ?? 0;

export type Kanaal = { id: number; naam: string; alleen_beheer: boolean; laatst?: string; ongelezen: number };
export type Community = { id: number; naam: string; omschrijving: string; rol: "eigenaar" | "beheerder" | "lid";
  status: "lid" | "uitgenodigd"; door?: string; leden: number; kanalen: Kanaal[]; openbaar?: boolean;
  eindigt?: string | null; na_afloop?: "herinnering" | "opheffen"; herinnering?: boolean; herinnering_sinds?: string | null;
  bewaard?: boolean; aangemaakt?: string };

export async function overzicht(ontvangstBijwerken = true) {
  const r = await rpc<{ gesprekken: Gesprek[]; communities?: Community[] }>("chat_gesprekken");
  const hoogste = Math.max(0, ...r.gesprekken.map((g) => g.laatste_id ?? 0));
  if (hoogste && ontvangstBijwerken) rpc("chat_ontvangen").catch(() => {});
  return { gesprekken: r.gesprekken, communities: r.communities ?? [] };
}

export const gesprekken = async () => (await overzicht()).gesprekken;

/** Nieuwe berichten lezen zonder ze als gelezen te markeren (voor oproepen die binnenkomen). */
export async function stilLezen(gesprek: number, na: number) {
  if (!ik) return [];
  const r = await rpc<{ berichten: RuwBericht[] }>("chat_berichten", { p_gesprek: gesprek, p_na: na, p_apparaat: ik.apparaat });
  const uit: { id: number; afzender: number; apparaat: number; tijd: string; bericht: Bericht }[] = [];
  for (const b of r.berichten) {
    if (b.weg || !b.inhoud) continue;
    try {
      const o = await ontsleutel(ik, gesprek, b);
      if (o.bericht) uit.push({ id: b.id, afzender: b.afzender, apparaat: b.apparaat, tijd: b.aangemaakt, bericht: o.bericht });
    } catch {
      /* niet te lezen: overslaan */
    }
  }
  return uit;
}

// --- Community's ---------------------------------------------------------------------------------------------------

export type Deelnemer = { id: number; naam: string; gebruikersnaam: string; rol: string; status: string };
export const community = (id: number) =>
  rpc<Community & { code?: string | null; code_aan: boolean; deelnemers: Deelnemer[] }>("chat_community", { p_community: id });
export const communityMaken = (naam: string, omschrijving: string) =>
  rpc<{ id: number }>("chat_community_maken", { p_community: naam, p_omschrijving: omschrijving });
export const communityDeelnemen = (code: string) =>
  rpc<{ id: number; naam: string }>("chat_community_deelnemen", { p_code: code });
export const communityUitnodigen = (id: number, wie: string) =>
  rpc<{ status: string }>("chat_community_uitnodigen", { p_community: id, p_wie: wie });
export const communityAntwoorden = (id: number, antwoord: "ja" | "nee" | "verlaten") =>
  rpc("chat_community_antwoorden", { p_community: id, p_antwoord: antwoord });

// Beheer van een community: alleen eigenaar en beheerders. De server controleert dat zelf.
export const communityInstellen = (id: number, p: { titel?: string; omschrijving?: string; code_aan?: boolean;
  nieuwe_code?: boolean; opheffen?: boolean }) =>
  rpc("chat_community_instellen", { p_community: id, p_titel: p.titel ?? null, p_omschrijving: p.omschrijving ?? null,
    p_code_aan: p.code_aan ?? null, p_nieuwe_code: p.nieuwe_code ?? false, p_opheffen: p.opheffen ?? false });
// Opruimen zonder iets kwijt te raken: tijdelijk (met einddatum), herinnering (alleen-lezen) of voor jezelf bewaren.
export const communityTijdelijk = (id: number, eindigt: Date | null, naAfloop: "herinnering" | "opheffen") =>
  rpc("community_tijdelijk", { p_community: id, p_eindigt: eindigt?.toISOString() ?? null, p_na_afloop: naAfloop });
export const communityHerinnering = (id: number, aan: boolean) => rpc("community_herinnering", { p_community: id, p_aan: aan });
export const communityBewaren = (id: number, aan: boolean) => rpc("community_bewaren", { p_community: id, p_aan: aan });
/** In de lijst met herinneringen in plaats van bij je actieve community's. */
export const isHerinnering = (c: Community) => Boolean(c.herinnering || c.bewaard);

export type LidActie = "beheerder" | "lid" | "eigenaar" | "verwijderen" | "weren";
export const communityLid = (id: number, wie: number, actie: LidActie) =>
  rpc("chat_community_lid", { p_community: id, p_wie: wie, p_actie: actie });
export const kanaalMaken = (id: number, naam: string, alleenBeheer: boolean) =>
  rpc<{ id: number }>("chat_kanaal_maken", { p_community: id, p_kanaal: naam, p_alleen_beheer: alleenBeheer });
export const kanaalInstellen = (kanaal: number, p: { titel?: string; alleen_beheer?: boolean; weg?: boolean }) =>
  rpc("chat_kanaal_instellen", { p_kanaal: kanaal, p_titel: p.titel ?? null, p_alleen_beheer: p.alleen_beheer ?? null,
    p_weg: p.weg ?? false });

export function gesprekNaam(g: Gesprek, mijnId: number) {
  if (g.soort === "groep") return g.naam || "Groep";
  return g.leden.find((l) => l.id !== mijnId)?.naam || "Gesprek";
}

/** Een korte, leesbare omschrijving van een bericht, voor de lijst en voor soorten die hier nog niet getoond worden. */
export function kortTekst(m?: Bericht) {
  if (!m) return "";
  const t = (s: unknown) => (typeof s === "string" ? s : "");
  switch (m.t) {
    case "tekst": return t(m.tekst).slice(0, 100);
    case "project": return "Project: " + t(m.titel).slice(0, 80);
    case "foto": return "Foto";
    case "afspraak": return `Afspraak: ${t(m.titel)}`;
    case "peiling": return `Peiling: ${t(m.vraag)}`;
    case "lijstje": return `Lijstje: ${t(m.titel)}`;
    case "plek": return `Locatie: ${t(m.naam) || "gedeeld"}`;
    case "vrij": return "Wanneer ik kan";
    case "betaal": return "Betaalverzoek";
    case "diensten": return `Diensten: ${t(m.titel)}`;
    case "winkel": return `Webshop: ${t(m.naam)}`;
    case "boeking": return `Boeking: ${t(m.soort)}`;
    case "bel": return m.fase === "einde" ? (m.duur ? `${m.video ? "Videogesprek" : "Gesprek"} van ${belDuur(Number(m.duur))}`
      : "Gemiste oproep") : "Oproep";
  }
  return "";
}

export function belDuur(sec: number) {
  const m = Math.floor(sec / 60), s = sec % 60;
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
}

/** Soorten die alleen iets bijwerken (een duimpje, een stem) en geen eigen regel in het gesprek krijgen. */
const STIL = new Set(["emoji", "stem", "vink", "item", "reactie", "betaald"]);

export async function voorbeeld(g: Gesprek): Promise<string> {
  if (!ik || !g.laatste_id) return "";
  const sleutel = `${ik.gebruiker}:${g.id}`;
  const bewaard = await idbGet<{ id: number; tekst: string }>("voorbeeld", sleutel).catch(() => undefined);
  if (bewaard && bewaard.id >= g.laatste_id) return bewaard.tekst;
  const r = await rpc<{ berichten: RuwBericht[] }>("chat_berichten", { p_gesprek: g.id, p_na: g.laatste_id - 1, p_apparaat: ik.apparaat });
  const b = r.berichten[r.berichten.length - 1];
  let tekst = bewaard?.tekst ?? "";
  if (b?.weg) tekst = "Bericht verwijderd";
  else if (b?.inhoud) {
    try {
      const o = await ontsleutel(ik, g.id, b);
      const k = kortTekst(o.bericht);
      if (k) tekst = (b.afzender === ik.gebruiker ? "Jij: " : "") + k;
    } catch {
      tekst = "Versleuteld bericht";
    }
  }
  idbPut("voorbeeld", sleutel, { id: g.laatste_id, tekst }).catch(() => {});
  return tekst;
}

export async function berichten(gesprek: number, na: number) {
  if (!ik) throw new Error("De chat is nog niet gestart.");
  const r = await rpc<{ berichten: RuwBericht[]; gesprek: Gesprek }>("chat_berichten",
    { p_gesprek: gesprek, p_na: na, p_apparaat: ik.apparaat });
  const regels: Regel[] = [];
  for (const b of r.berichten) {
    const regel: Regel = { id: b.id, afzender: b.afzender, tijd: b.aangemaakt, weg: b.weg };
    if (!b.weg && b.inhoud) {
      try {
        Object.assign(regel, await ontsleutel(ik, gesprek, b));
      } catch {
        regel.fout = "kapot";
      }
    }
    if (regel.bericht && STIL.has(regel.bericht.t)) continue;
    if (regel.bericht?.t === "bel" && regel.bericht.fase !== "einde") continue;
    regels.push(regel);
  }
  const hoogste = r.berichten.length ? r.berichten[r.berichten.length - 1].id : 0;
  if (hoogste && r.gesprek?.status === "lid") rpc("chat_gelezen", { p_gesprek: gesprek, p_tot: hoogste }).catch(() => {});
  return { regels, gesprek: r.gesprek, hoogste, meer: r.berichten.length === 200 };
}

/** Alleen voor expliciet projectadvies: haal een volledige, actuele leesbare bewijsbasis op. */
export async function projectRegelsVers(gesprek: number, voorAi = true) {
  const regels: Regel[] = [];
  let na = 0;
  for (let i = 0; i < 50; i++) {
    const r = await berichten(gesprek, na);
    if (r.gesprek?.status !== "lid" || (voorAi && r.gesprek.alleen_beheer)) throw new Error("Projectcontrole is niet beschikbaar met deze kanaalrechten.");
    if (r.regels.some(r => r.weg || r.fout)) throw new Error("De geschiedenis is niet volledig leesbaar. AI-toestemming kan niet betrouwbaar worden gecontroleerd.");
    regels.push(...r.regels);
    if (!r.meer) return { regels, gesprek: r.gesprek };
    if (r.hoogste <= na) break;
    na = r.hoogste;
  }
  throw new Error("Te veel projectgeschiedenis voor een volledige toestemmingscontrole. Er is niets naar AI verstuurd.");
}

export async function versturen(gesprek: number, bericht: Bericht) {
  if (!ik) throw new Error("De chat is nog niet gestart.");
  const apparaat = ik;
  const sessie = huidigeSessie();
  const { apparaten } = await rpc<{ apparaten: Apparaat[] }>("chat_sleutels", { p_gesprek: gesprek });
  if (ik !== apparaat || huidigeSessie() !== sessie) throw new Error("Het account is intussen gewijzigd.");
  const p = await versleutel(apparaat, gesprek, apparaten, bericht);
  if (ik !== apparaat || huidigeSessie() !== sessie) throw new Error("Het account is intussen gewijzigd.");
  return rpc<{ id: number }>("chat_versturen", { p_gesprek: gesprek, p_apparaat: apparaat.apparaat, p_inhoud: p.inhoud,
    p_iv: p.iv, p_epk: p.epk, p_sleutels: p.sleutels, p_handtekening: p.handtekening });
}

/** Een versleutelde, herhaalbare archiefopdracht voorbereiden; nog geen schrijfaanvraag. */
export async function projectArchiefVoorstel(gesprek: number, bestand: string, tekst: string, titel = "projectbestand.md", auteurs: number[] = [], herkomstOnbekend = false) {
  if (!ik || tekst.length > 50_000) throw new Error("Open de chat en kies een geldig tekstbestand.");
  const apparaat = ik, sessie = huidigeSessie();
  const { apparaten } = await rpc<{ apparaten: Apparaat[] }>("chat_sleutels", { p_gesprek: gesprek });
  if (ik !== apparaat || huidigeSessie() !== sessie) throw new Error("Account gewijzigd.");
  const bronAuteurs = [...new Set([apparaat.gebruiker, ...auteurs])];
  if (bronAuteurs.length > 1000 || bronAuteurs.some(id => !Number.isSafeInteger(id) || id < 1)) throw new Error("De bronbijdragers konden niet worden gecontroleerd.");
  const p = await versleutel(apparaat, gesprek, apparaten, { t: "projectversie", versie: 1, bestand, tekst, titel, auteurs: bronAuteurs, herkomstOnbekend });
  const opdracht = crypto.randomUUID();
  return async () => {
    if (ik !== apparaat || huidigeSessie() !== sessie) throw new Error("Account gewijzigd.");
    return rpc<{ id: number; aangemaakt: string }>("project_archief_bewaren", { p_gesprek: gesprek, p_bestand: bestand,
      p_opdracht: opdracht, p_apparaat: apparaat.apparaat, p_inhoud: p.inhoud, p_iv: p.iv,
      p_epk: p.epk, p_sleutels: p.sleutels, p_handtekening: p.handtekening });
  };
}
export const projectArchiefLijst = (gesprek: number, bestand: string, voor: number | null = null) =>
  rpc<{ versies: { id: number; afzender: number; aangemaakt: string }[] }>("project_archief_lijst", { p_gesprek: gesprek, p_bestand: bestand, p_voor: voor });
export const projectArchiefBestanden = (gesprek: number) => rpc<{ bestanden: { bestand: string; laatst: string; aantal: number }[] }>("project_archief_bestanden", { p_gesprek: gesprek });
export async function projectArchiefGegevens(gesprek: number, bestand: string, id: number) {
  if (!ik) throw new Error("Open eerst de chat.");
  const apparaat = ik, sessie = huidigeSessie();
  const r = await rpc<RuwBericht & { bestand: string }>("project_archief_lezen", { p_gesprek: gesprek, p_id: id, p_apparaat: apparaat.apparaat });
  if (ik !== apparaat || huidigeSessie() !== sessie || r.bestand !== bestand) throw new Error("Open de archiefversie opnieuw.");
  const b = (await ontsleutel(apparaat, gesprek, r)).bericht;
  if (!b || b.t !== "projectversie" || b.versie !== 1 || b.bestand !== bestand || typeof b.tekst !== "string" || b.tekst.length > 50_000) throw new Error("De archiefversie is onleesbaar.");
  const titel = typeof b.titel === "string" && b.titel.length <= 100 && /\.(md|txt)$/i.test(b.titel) && !/[\p{Cc}\p{Cs}]/u.test(b.titel) ? b.titel : "hersteld-projectbestand.md";
  const auteurs = Array.isArray(b.auteurs) && b.auteurs.length <= 1000 && b.auteurs.every(id => Number.isSafeInteger(id) && id > 0) ? [...new Set(b.auteurs as number[])] : null;
  return { tekst: b.tekst, titel, auteurs: auteurs ?? [], herkomstOnbekend: !auteurs || b.herkomstOnbekend === true };
}
export async function projectArchiefLezen(gesprek: number, bestand: string, id: number) {
  return (await projectArchiefGegevens(gesprek, bestand, id)).tekst;
}

export const nieuwGesprek = (met: string) =>
  rpc<{ id: number }>("chat_starten", { p_met: met.trim().replace(/^@/, "") });

export const antwoorden = (gesprek: number, antwoord: "ja" | "nee") =>
  rpc("chat_antwoorden", { p_gesprek: gesprek, p_antwoord: antwoord });

export type Contact = { id: number; naam: string; gebruikersnaam: string; chat: boolean };
export const contacten = async () => (await rpc<{ contacten: Contact[] }>("chat_contacten")).contacten;

export const VERDWIJNEN: [number, string][] = [[0, "Uit"], [3600, "1 uur"], [86400, "24 uur"], [604800, "7 dagen"], [7776000, "90 dagen"]];

/** Hoe lang berichten in dit gesprek blijven staan (0 = altijd). Geldt voor iedereen in het gesprek. */
export const verdwijnenInstellen = (gesprek: number, seconden: number) =>
  rpc("chat_instellen", { p_gesprek: gesprek, p_verdwijnen: seconden, p_stil: null, p_groepsnaam: null });

// --- Stories ------------------------------------------------------------------------------------------------------
// Een foto, filmpje of korte tekst die 24 uur blijft staan en alleen je contacten zien. Versleuteld zoals een bericht, met
// "story" in plaats van een gespreksnummer, zodat een story nooit als chatbericht kan worden hergebruikt.

export type StoryInhoud = { t: "tekst"; tekst: string; kleur: string } | { t: "foto"; foto: string; tekst?: string }
  | { t: "video"; video: string; duur: number; tekst?: string };

function geldig(b: StoryInhoud | undefined): b is StoryInhoud {
  if (!b) return false;
  if (b.t === "tekst") return typeof b.tekst === "string";
  if (b.t === "foto") return /^data:image\/(jpeg|png|webp);base64,/.test(b.foto);
  if (b.t === "video") return /^data:video\/(mp4|webm);base64,/.test(b.video)
    && typeof b.duur === "number" && b.duur > 0 && b.duur <= 61;
  return false;
}
type RuweStory = RuwBericht & { maker: number; naam: string; verloopt: string; gezien: boolean;
  kijkers?: { naam: string; gezien: string }[] | null };
export type Story = { id: number; maker: number; naam: string; tijd: string; verloopt: string; gezien: boolean;
  kijkers?: { naam: string; gezien: string }[] | null; inhoud?: StoryInhoud };

export const STORY_KLEUREN = ["#4f46e5", "#0f766e", "#be185d", "#b45309", "#1f2937"];

export async function stories(): Promise<Story[]> {
  if (!ik) throw new Error("De chat is nog niet gestart.");
  const r = await rpc<{ stories: RuweStory[] }>("chat_stories", { p_apparaat: ik.apparaat });
  const uit: Story[] = [];
  for (const s of r.stories) {
    const story: Story = { id: s.id, maker: s.maker, naam: s.naam, tijd: s.aangemaakt, verloopt: s.verloopt,
      gezien: s.gezien, kijkers: s.kijkers };
    try {
      const o = await ontsleutel(ik, "story", s);
      const b = o.bericht as unknown as StoryInhoud | undefined;
      if (geldig(b)) story.inhoud = b;
    } catch {
      /* niet te lezen op dit apparaat: overslaan */
    }
    if (story.inhoud) uit.push(story);
  }
  return uit;
}

export async function storyPlaatsen(inhoud: StoryInhoud) {
  if (!ik) throw new Error("De chat is nog niet gestart.");
  const { apparaten } = await rpc<{ apparaten: Apparaat[] }>("chat_story_sleutels");
  const p = await versleutel(ik, "story", apparaten, inhoud as unknown as Bericht);
  return rpc<{ id: number }>("chat_story_plaatsen", { p_apparaat: ik.apparaat, p_inhoud: p.inhoud, p_iv: p.iv,
    p_epk: p.epk, p_sleutels: p.sleutels, p_handtekening: p.handtekening });
}

export const storyGezien = (id: number) => rpc("chat_story_gezien", { p_story: id }).catch(() => {});
export const storyWeg = (id: number) => rpc("chat_story_weg", { p_story: id });

/** Maakt een foto kleiner (hoogstens 1080 pixels breed of hoog) en geeft hem als JPEG. */
export async function fotoVerkleinen(bestand: File) {
  const beeld = await createImageBitmap(bestand);
  const schaal = Math.min(1, 1080 / Math.max(beeld.width, beeld.height));
  const doek = document.createElement("canvas");
  doek.width = Math.round(beeld.width * schaal);
  doek.height = Math.round(beeld.height * schaal);
  doek.getContext("2d")!.drawImage(beeld, 0, 0, doek.width, doek.height);
  return doek.toDataURL("image/jpeg", 0.82);
}
