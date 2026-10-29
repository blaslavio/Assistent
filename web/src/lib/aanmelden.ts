// Een account maken, je wachtwoord terugkrijgen met een code per mail, en je mailadres bevestigen.
// Zie sql/alleen_mensen.sql (accounts alleen voor mensen), sql/toegangssleutels.sql (herstel per mail) en
// sql/mail_bevestigen.sql. Mails gaan alleen als de eigenaar mail versturen heeft aangezet (Brevo).
import { alsIk, rpc, sessieStarten } from "../api";

// --- SHA-256 voor de rekenpuzzel bij het aanmelden --------------------------------------------------------------
// Eigen, kleine uitvoering: duizenden keren per seconde, zonder te wachten op crypto.subtle bij elke poging.

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);
const W = new Uint32Array(64);

/** De SHA-256 van een tekst (UTF-8), als 8 woorden van 32 bits. */
export function sha256(tekst: string): Uint32Array {
  const b = new TextEncoder().encode(tekst);
  const blokken = Math.ceil((b.length + 9) / 64);
  const m = new Uint8Array(blokken * 64);
  m.set(b);
  m[b.length] = 0x80;
  const bits = b.length * 8;
  const d = new DataView(m.buffer);
  d.setUint32(m.length - 8, Math.floor(bits / 2 ** 32));
  d.setUint32(m.length - 4, bits >>> 0);
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  for (let blok = 0; blok < blokken; blok++) {
    for (let i = 0; i < 16; i++) W[i] = d.getUint32(blok * 64 + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = W[i - 15], c = W[i - 2];
      const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3);
      const s1 = ((c >>> 17) | (c << 15)) ^ ((c >>> 19) | (c << 13)) ^ (c >>> 10);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0;
    }
    let [a, bb, c, dd, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = ((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7));
      const t1 = (hh + S1 + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0;
      const S0 = ((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10));
      const t2 = (S0 + ((a & bb) ^ (a & c) ^ (bb & c))) | 0;
      hh = g; g = f; f = e; e = (dd + t1) | 0; dd = c; c = bb; bb = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += bb; h[2] += c; h[3] += dd; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  return h;
}

/** Zoekt een getal waarvoor de hash van zout + getal met `moeilijkheid` nul-bits begint. Geeft de browser af en toe lucht. */
export async function puzzelOplossen(zout: string, moeilijkheid: number): Promise<string> {
  for (let n = 0; ; n++) {
    if ((sha256(zout + n)[0] >>> (32 - moeilijkheid)) === 0) return String(n);
    if (n % 20000 === 19999) await new Promise((r) => setTimeout(r, 0));
  }
}

type Uitdaging = { id: number; zout: string; moeilijkheid: number; fout?: string };

/** Haalt een uitdaging op en lost hem alvast op, terwijl iemand het formulier invult. */
export async function voorbereiden(): Promise<{ id: number; oplossing: string }> {
  const u = await rpc<Uitdaging>("aanmelden_uitdaging");
  if (u.fout) throw new Error(u.fout);
  return { id: u.id, oplossing: await puzzelOplossen(u.zout, u.moeilijkheid) };
}

export type NieuwAccount = { naam: string; weergavenaam: string; email: string; wachtwoord: string; akkoord: boolean };

/** Maakt het account en logt meteen in. Bij `opnieuw` is een nieuwe uitdaging nodig. */
export async function accountMaken(a: NieuwAccount, puzzel: { id: number; oplossing: string }) {
  const r = await rpc<{ ok?: boolean; fout?: string; opnieuw?: boolean }>("account_maken", {
    p_naam: a.naam.trim().toLowerCase().replace(/^@/, ""), p_weergavenaam: a.weergavenaam.trim(), p_email: a.email.trim(),
    p_wachtwoord: a.wachtwoord, p_akkoord: a.akkoord, p_uitdaging: puzzel.id, p_oplossing: puzzel.oplossing,
  });
  if (r.fout) throw Object.assign(new Error(r.fout), { opnieuw: !!r.opnieuw });
}

/** Of de app mails kan versturen (herstelcodes en bevestigen). */
export const mailIngesteld = () => rpc<boolean>("mail_ingesteld").catch(() => false);

/** Vraagt een herstelcode aan. Het antwoord is altijd hetzelfde, of er nu een account bij dit adres is of niet. */
export async function herstelAanvragen(email: string, apparaat: string) {
  const r = await rpc<{ ok?: boolean; fout?: string }>("herstel_aanvragen", { p_email: email.trim(), p_apparaat: apparaat });
  if (r.fout) throw new Error(r.fout);
}

/** Nieuw wachtwoord met de code uit de mail. Met tweestapsverificatie is ook de code uit je app nodig. */
export async function herstelAfronden(email: string, code: string, nieuw: string, tweeStap: string, apparaat: string) {
  const r = await rpc<{ token?: string; naam?: string; code_nodig?: boolean; fout?: string }>("herstel_afronden", {
    p_email: email.trim(), p_code: code, p_nieuw_wachtwoord: nieuw, p_twee_stap: tweeStap, p_apparaat: apparaat,
  });
  if (r.token) await sessieStarten(r.naam || email.trim(), r.token);
  return r;
}

async function doe(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await alsIk<{ ok?: boolean; fout?: string; bevestigd?: boolean }>(functie, parameters);
  if (r.fout) throw new Error(r.fout);
  return r;
}

/** Stuurt een code naar je mailadres. */
export const codeSturen = () => doe("email_code_sturen");
/** Bevestigt je mailadres met de code. */
export const mailBevestigen = (code: string) => doe("email_bevestigen", { p_code: code });
