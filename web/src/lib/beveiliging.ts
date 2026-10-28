// Privacy en beveiliging: tweestapsverificatie, waar je bent ingelogd, recente inlogpogingen en je account.
// Alles loopt via dezelfde databasefuncties als de huidige app; die controleren zelf wie je bent.
import { alsIk, gegevensLaden } from "../api";

export type Sessie = { apparaat: string | null; aangemaakt: string; laatst: string; deze: boolean };
export type Inlog = { tijd: string; apparaat: string | null; gelukt: boolean; reden: string | null };
export type Beveiliging = { twee_stap: boolean; herstelcodes_over: number; sessies: Sessie[]; inlogs: Inlog[];
  mislukt_recent: number };
export type Apparaat = { id: number; naam: string | null; laatst: string };

async function rpc<T>(functie: string, parameters: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, parameters);
  if (a && typeof a === "object" && "fout" in a && a.fout) throw new Error(a.fout);
  return a as T;
}

export const beveiliging = () => rpc<Beveiliging>("beveiliging");
export const apparaten = async () => (await rpc<{ apparaten?: Apparaat[] }>("mijn_apparaten")).apparaten ?? [];
export const apparaatVergeten = (id: number) => rpc("apparaat_intrekken", { p_id: id });
export const overalUitloggen = () => rpc("overal_uitloggen");
export const tweeStapStarten = () => rpc<{ geheim: string }>("twee_stap_starten");
export const tweeStapBevestigen = (code: string) => rpc<{ herstelcodes: string[] }>("twee_stap_bevestigen", { p_code: code });
export const tweeStapUitzetten = (wachtwoord: string, code: string) =>
  rpc("twee_stap_uitzetten", { p_huidig_wachtwoord: wachtwoord, p_code: code });
export const mailadresInstellen = (email: string) => rpc("email_instellen", { p_email: email });
export const profielBijwerken = (p: { gebruikersnaam?: string; wachtwoord?: string }) =>
  rpc("profiel_bijwerken", { p_nieuwe_naam: p.gebruikersnaam ?? null, p_weergavenaam: null,
    p_nieuw_wachtwoord: p.wachtwoord ?? null });
export const accountVerwijderen = () => rpc("account_verwijderen");

/** Het geheim (hex) als sleutel voor een app met verificatiecodes (base32, RFC 4648). */
export function base32(hex: string) {
  const bytes = hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? [];
  const abc = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, waarde = 0, uit = "";
  for (const b of bytes) {
    waarde = (waarde << 8) | b;
    bits += 8;
    while (bits >= 5) {
      uit += abc[(waarde >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) uit += abc[(waarde << (5 - bits)) & 31];
  return uit;
}

export function otpauth(hex: string, account: string) {
  return `otpauth://totp/Mijn%20assistent:${encodeURIComponent(account)}?secret=${base32(hex)}&issuer=Mijn%20assistent`;
}

// Velden met sleutels of wachtwoorden gaan nooit mee in de download, net als in de huidige app.
const GEHEIM = ["anthropic_sleutel", "agenda_feed_token", "strava_client_secret", "strava_tokens", "ticketmaster_sleutel",
  "elevenlabs_sleutel", "openai_sleutel", "gemini_sleutel"];

/** Al je eigen gegevens als JSON, zonder wachtwoorden en sleutels. */
export async function gegevensDownloaden() {
  const { data } = await gegevensLaden();
  const inst = { ...(data.instellingen ?? {}) } as Record<string, unknown>;
  for (const k of GEHEIM) delete inst[k];
  if (inst.mail && typeof inst.mail === "object") {
    const { wachtwoord: _ww, ...mail } = inst.mail as Record<string, unknown>;
    inst.mail = mail;
  }
  if (Array.isArray(inst.agendas)) {
    inst.agendas = inst.agendas.map((a: Record<string, unknown>) => {
      const { wachtwoord: _ww, url: _url, ...rest } = a;
      return rest;
    });
  }
  const blob = new Blob([JSON.stringify({ ...data, instellingen: inst }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mijn-gegevens.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Have I Been Pwned met k-anonimiteit: alleen de eerste 5 tekens van de SHA-1-hash gaan naar buiten. */
export async function wachtwoordGelekt(wachtwoord: string): Promise<number> {
  const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(wachtwoord));
  const h = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
  const r = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
  if (!r.ok) throw new Error("De controle lukt nu niet. Probeer het later opnieuw.");
  for (const regel of (await r.text()).split("\n")) {
    const [rest, n] = regel.trim().split(":");
    if (rest === h.slice(5)) return parseInt(n, 10) || 0;
  }
  return 0;
}

export const TECHNIEK: [string, string][] = [
  ["Wachtwoord", "bcrypt (kosten 10, uniek zout); alleen de hash wordt bewaard"],
  ["Sessie", "willekeurige sleutel van 256 bits; de server bewaart alleen de SHA-256. Verloopt 12 uur na het laatste gebruik, hooguit na 30 dagen"],
  ["Tweestapsverificatie", "TOTP (RFC 6238): 6 cijfers, 30 seconden, elke code één keer; 8 herstelcodes"],
  ["Chat", "end-to-end: ECDH P-256, HKDF-SHA-256, AES-256-GCM, ondertekend met ECDSA P-256"],
  ["Verbinding", "altijd HTTPS (TLS)"],
  ["Database", "PostgreSQL met Row Level Security op elke tabel; alleen bereikbaar via gecontroleerde functies"],
  ["Opslaglocatie", "Europese Unie (Ierland)"],
];
