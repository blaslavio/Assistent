// Web Push, zelf geschreven met alleen WebCrypto: versleuteling volgens RFC 8291 (aes128gcm) en afzender-
// bewijs volgens RFC 8292 (VAPID). De pushdienst (Apple, Google, Mozilla) ziet alleen versleutelde bytes;
// alleen het toestel met de bijbehorende sleutel kan de melding lezen.

const tekst = new TextEncoder();

export const b64url = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const vanB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)),
    (c) => c.charCodeAt(0));

const samen = (...delen: Uint8Array[]) => {
  const uit = new Uint8Array(delen.reduce((n, d) => n + d.length, 0));
  let i = 0;
  for (const d of delen) { uit.set(d, i); i += d.length; }
  return uit;
};

async function hmac(sleutel: Uint8Array, data: Uint8Array) {
  const k = await crypto.subtle.importKey("raw", sleutel, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data));
}

// HKDF met één blok uitvoer (genoeg voor 12, 16 of 32 bytes).
async function hkdf(zout: Uint8Array, ikm: Uint8Array, info: Uint8Array, lengte: number) {
  const prk = await hmac(zout, ikm);
  return (await hmac(prk, samen(info, new Uint8Array([1])))).slice(0, lengte);
}

export type Vapid = { publiek: string; prive: string }; // beide base64url: 65 bytes publiek, 32 bytes d

export async function vapidMaken(): Promise<Vapid> {
  const paar = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const publiek = new Uint8Array(await crypto.subtle.exportKey("raw", paar.publicKey));
  const jwk = await crypto.subtle.exportKey("jwk", paar.privateKey);
  return { publiek: b64url(publiek), prive: jwk.d! };
}

async function vapidSleutel(v: Vapid) {
  const p = vanB64url(v.publiek);
  return crypto.subtle.importKey("jwk", {
    kty: "EC", crv: "P-256", d: v.prive, x: b64url(p.slice(1, 33)), y: b64url(p.slice(33, 65)), ext: true,
  }, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}

export async function vapidKop(endpoint: string, v: Vapid, contact: string) {
  const aud = new URL(endpoint).origin;
  const kop = b64url(tekst.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const inhoud = b64url(tekst.encode(JSON.stringify({
    aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: contact,
  })));
  const handtekening = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" },
    await vapidSleutel(v), tekst.encode(`${kop}.${inhoud}`)));
  return `vapid t=${kop}.${inhoud}.${b64url(handtekening)}, k=${v.publiek}`;
}

// Versleutelt één bericht voor één toestel (p256dh + auth uit het abonnement van de browser).
export async function versleutelen(bericht: Uint8Array, p256dh: string, auth: string) {
  const uaPubliek = vanB64url(p256dh);
  const geheim = vanB64url(auth);
  const eenmalig = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const asPubliek = new Uint8Array(await crypto.subtle.exportKey("raw", eenmalig.publicKey));
  const ua = await crypto.subtle.importKey("raw", uaPubliek, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const gedeeld = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: ua }, eenmalig.privateKey, 256));
  const ikm = await hkdf(geheim, gedeeld, samen(tekst.encode("WebPush: info\0"), uaPubliek, asPubliek), 32);
  const zout = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(zout, ikm, tekst.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(zout, ikm, tekst.encode("Content-Encoding: nonce\0"), 12);
  const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const versleuteld = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, k,
    samen(bericht, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]); // recordgrootte 4096
  return samen(zout, rs, new Uint8Array([asPubliek.length]), asPubliek, versleuteld);
}

export async function versturen(toestel: { endpoint: string; p256dh: string; auth: string }, inhoud: unknown,
                                v: Vapid, contact: string, dringend: boolean) {
  const lichaam = await versleutelen(tekst.encode(JSON.stringify(inhoud)), toestel.p256dh, toestel.auth);
  return fetch(toestel.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidKop(toestel.endpoint, v, contact),
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream",
      TTL: "3600", Urgency: dringend ? "high" : "normal",
    },
    body: lichaam,
  });
}
