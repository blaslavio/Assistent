// WebAuthn (toegangssleutels), zelf geschreven met alleen WebCrypto: een kleine CBOR-lezer, COSE-sleutels naar
// JWK, en het controleren van handtekeningen (ES256 en RS256). Geen attestatie: we vertrouwen op Face ID of
// Touch ID van het toestel zelf ("none"), zoals Apple, Google en Microsoft dat ook doen voor gewone accounts.

const tekst = new TextEncoder();

export const b64url = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const vanB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)),
    (c) => c.charCodeAt(0));

export const samen = (...delen: Uint8Array[]) => {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0));
  let i = 0;
  for (const d of delen) { uit.set(d, i); i += d.length; }
  return uit;
};

export const gelijk = (a: Uint8Array, b: Uint8Array) => {
  if (a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a[i] ^ b[i];
  return verschil === 0;
};

export const sha256 = async (data: Uint8Array) => new Uint8Array(await crypto.subtle.digest("SHA-256", data));

// --- CBOR (RFC 8949), alleen wat WebAuthn gebruikt ----------------------------------------------------------

type Cbor = number | bigint | boolean | null | string | Uint8Array | Cbor[] | Map<Cbor, Cbor>;

export function cbor(b: Uint8Array, start = 0): [Cbor, number] {
  let i = start;
  if (i >= b.length) throw new Error("cbor: te kort");
  const kop = b[i++];
  const soort = kop >> 5;
  const extra = kop & 31;
  let lengte: number;
  if (extra < 24) lengte = extra;
  else if (extra === 24) lengte = b[i++];
  else if (extra === 25) { lengte = (b[i] << 8) | b[i + 1]; i += 2; }
  else if (extra === 26) { lengte = ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; i += 4; }
  else throw new Error("cbor: niet ondersteund");
  if (i > b.length) throw new Error("cbor: te kort");
  switch (soort) {
    case 0: return [lengte, i];
    case 1: return [-1 - lengte, i];
    case 2:
      if (i + lengte > b.length) throw new Error("cbor: te kort");
      return [b.slice(i, i + lengte), i + lengte];
    case 3:
      if (i + lengte > b.length) throw new Error("cbor: te kort");
      return [new TextDecoder().decode(b.slice(i, i + lengte)), i + lengte];
    case 4: {
      const lijst: Cbor[] = [];
      for (let n = 0; n < lengte; n++) { const [w, j] = cbor(b, i); lijst.push(w); i = j; }
      return [lijst, i];
    }
    case 5: {
      const kaart = new Map<Cbor, Cbor>();
      for (let n = 0; n < lengte; n++) {
        const [k, j] = cbor(b, i);
        const [w, j2] = cbor(b, j);
        kaart.set(k, w); i = j2;
      }
      return [kaart, i];
    }
    case 7:
      if (extra === 20) return [false, i];
      if (extra === 21) return [true, i];
      if (extra === 22) return [null, i];
      throw new Error("cbor: niet ondersteund");
    default:
      throw new Error("cbor: niet ondersteund");
  }
}

// --- Authenticator data ---------------------------------------------------------------------------------------

export type AuthData = {
  rpIdHash: Uint8Array; aanwezig: boolean; geverifieerd: boolean; teller: number;
  credId?: Uint8Array; sleutel?: Map<Cbor, Cbor>;
};

export function authData(b: Uint8Array): AuthData {
  if (b.length < 37) throw new Error("authData te kort");
  const vlaggen = b[32];
  const uit: AuthData = {
    rpIdHash: b.slice(0, 32), aanwezig: !!(vlaggen & 1), geverifieerd: !!(vlaggen & 4),
    teller: ((b[33] << 24) >>> 0) + (b[34] << 16) + (b[35] << 8) + b[36],
  };
  if (vlaggen & 0x40) {
    // aaguid (16) + lengte (2) + credential id + COSE-sleutel
    const lengte = (b[53] << 8) | b[54];
    if (lengte > 1023 || 55 + lengte > b.length) throw new Error("credential id ongeldig");
    uit.credId = b.slice(55, 55 + lengte);
    const [sleutel] = cbor(b, 55 + lengte);
    if (!(sleutel instanceof Map)) throw new Error("geen sleutel");
    uit.sleutel = sleutel;
  }
  return uit;
}

export function coseNaarJwk(k: Map<Cbor, Cbor>): { alg: number; jwk: JsonWebKey } {
  const kty = k.get(1), alg = k.get(3);
  if (kty === 2 && alg === -7 && k.get(-1) === 1) {
    const x = k.get(-2), y = k.get(-3);
    if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
      throw new Error("EC-sleutel ongeldig");
    }
    return { alg: -7, jwk: { kty: "EC", crv: "P-256", x: b64url(x), y: b64url(y) } };
  }
  if (kty === 3 && alg === -257) {
    const n = k.get(-1), e = k.get(-2);
    if (!(n instanceof Uint8Array) || !(e instanceof Uint8Array) || n.length < 256) throw new Error("RSA-sleutel ongeldig");
    return { alg: -257, jwk: { kty: "RSA", n: b64url(n), e: b64url(e), alg: "RS256" } };
  }
  throw new Error("Dit soort sleutel wordt niet ondersteund.");
}

// ECDSA-handtekeningen komen als DER; WebCrypto wil r en s achter elkaar (elk 32 bytes).
export function derNaarRaw(der: Uint8Array): Uint8Array {
  if (der[0] !== 0x30) throw new Error("handtekening ongeldig");
  let i = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const deel = () => {
    if (der[i] !== 0x02) throw new Error("handtekening ongeldig");
    const lengte = der[i + 1];
    let getal = der.slice(i + 2, i + 2 + lengte);
    i += 2 + lengte;
    while (getal.length > 32 && getal[0] === 0) getal = getal.slice(1);
    if (getal.length > 32) throw new Error("handtekening ongeldig");
    return samen(new Uint8Array(32 - getal.length), getal);
  };
  const r = deel(), s = deel();
  return samen(r, s);
}

export async function handtekeningKlopt(alg: number, jwk: JsonWebKey, data: Uint8Array, handtekening: Uint8Array) {
  if (alg === -7) {
    const k = await crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, k, derNaarRaw(handtekening), data);
  }
  if (alg === -257) {
    const k = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    return crypto.subtle.verify("RSASSA-PKCS1-v1_5", k, handtekening, data);
  }
  return false;
}

// --- Uitdagingen: zonder opslag, ondertekend met een geheim dat alleen de server kent --------------------------

async function hmacHex(geheim: string, data: string) {
  const k = await crypto.subtle.importKey("raw", tekst.encode(geheim), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return [...new Uint8Array(await crypto.subtle.sign("HMAC", k, tekst.encode(data)))]
    .map((x) => x.toString(16).padStart(2, "0")).join("");
}

export async function uitdagingMaken(geheim: string, soort: string, gebruiker: number, seconden = 300) {
  const willekeurig = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const inhoud = `${soort}.${gebruiker}.${Math.floor(Date.now() / 1000) + seconden}.${willekeurig}`;
  return b64url(tekst.encode(`${inhoud}.${await hmacHex(geheim, inhoud)}`));
}

// Geeft de gebruiker (0 bij inloggen) als de uitdaging van ons is, de juiste soort heeft en niet verlopen is.
export async function uitdagingControleren(geheim: string, uitdaging: string, soort: string): Promise<number | null> {
  let s: string;
  try { s = new TextDecoder().decode(vanB64url(uitdaging)); } catch { return null; }
  const delen = s.split(".");
  if (delen.length !== 5) return null;
  const inhoud = delen.slice(0, 4).join(".");
  if (!gelijk(tekst.encode(await hmacHex(geheim, inhoud)), tekst.encode(delen[4]))) return null;
  if (delen[0] !== soort || Number(delen[2]) < Date.now() / 1000) return null;
  return Number(delen[1]);
}

// --- Het antwoord van de browser controleren ------------------------------------------------------------------

export type Verwacht = { origin: string; rpId: string; geheim: string };

async function clientData(b64: string, type: string, v: Verwacht, soort: string) {
  const ruw = vanB64url(b64);
  const c = JSON.parse(new TextDecoder().decode(ruw));
  if (c.type !== type) throw new Error("verkeerd type");
  if (c.origin !== v.origin) throw new Error("verkeerde herkomst");
  const gebruiker = await uitdagingControleren(v.geheim, c.challenge, soort);
  if (gebruiker === null) throw new Error("uitdaging ongeldig of verlopen");
  return { ruw, uitdaging: c.challenge as string, gebruiker };
}

export async function makenControleren(antwoord: { clientDataJSON: string; attestationObject: string },
                                      v: Verwacht, gebruiker: number) {
  const c = await clientData(antwoord.clientDataJSON, "webauthn.create", v, "maken");
  if (c.gebruiker !== gebruiker) throw new Error("uitdaging hoort bij iemand anders");
  const [att] = cbor(vanB64url(antwoord.attestationObject));
  if (!(att instanceof Map) || !(att.get("authData") instanceof Uint8Array)) throw new Error("attestatie ongeldig");
  const a = authData(att.get("authData") as Uint8Array);
  if (!gelijk(a.rpIdHash, await sha256(tekst.encode(v.rpId)))) throw new Error("verkeerde app");
  if (!a.aanwezig || !a.geverifieerd) throw new Error("niet bevestigd met Face ID of code");
  if (!a.credId || !a.sleutel) throw new Error("geen sleutel ontvangen");
  const { alg, jwk } = coseNaarJwk(a.sleutel);
  return { credId: b64url(a.credId), alg, jwk, teller: a.teller, uitdaging: c.uitdaging };
}

export async function inloggenControleren(
  antwoord: { clientDataJSON: string; authenticatorData: string; signature: string; userHandle?: string | null },
  v: Verwacht, sleutel: { alg: number; sleutel: JsonWebKey; handle: string },
) {
  const c = await clientData(antwoord.clientDataJSON, "webauthn.get", v, "inloggen");
  const ruweAuth = vanB64url(antwoord.authenticatorData);
  const a = authData(ruweAuth);
  if (!gelijk(a.rpIdHash, await sha256(tekst.encode(v.rpId)))) throw new Error("verkeerde app");
  if (!a.aanwezig || !a.geverifieerd) throw new Error("niet bevestigd met Face ID of code");
  if (antwoord.userHandle) {
    const verwacht = Uint8Array.from(sleutel.handle.match(/../g) ?? [], (h) => parseInt(h, 16));
    if (!gelijk(vanB64url(antwoord.userHandle), verwacht)) throw new Error("sleutel hoort bij iemand anders");
  }
  const data = samen(ruweAuth, await sha256(c.ruw));
  if (!await handtekeningKlopt(sleutel.alg, sleutel.sleutel, data, vanB64url(antwoord.signature))) {
    throw new Error("handtekening klopt niet");
  }
  return { teller: a.teller, uitdaging: c.uitdaging };
}
