// Bellen en videobellen, rechtstreeks tussen twee toestellen (WebRTC). Het opzetten gaat via versleutelde
// chatberichten ({ t: "bel", fase: "aanbod" | "antwoord" | "einde" }), net als in de huidige app, zodat beide apps
// elkaar kunnen bellen. Beeld en geluid zelf gaan versleuteld (DTLS-SRTP) van toestel naar toestel, niet via ons.
import { gesprekken, gesprekNaam, mijnApparaat, stilLezen, versturen, type Bericht } from "./chat";
import { peilen, type Peiler } from "./peilen";

const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun.cloudflare.com:3478" }];
const GELDIG = 45000;

export type Oproep = { id: string; gesprek: number; naam: string; ander: number; video: boolean; uit: boolean;
  status: "klaar" | "gemist" | "geweigerd" | "geen" | "mislukt"; duur: number; tijd: string };

type Lopend = { id: string; gesprek: number; naam: string; ander: number; video: boolean; rol: "beller" | "gebelde";
  fase: "starten" | "bellen" | "verbinden" | "verbonden"; pc?: RTCPeerConnection; media?: MediaStream;
  ander_beeld?: MediaStream; begin?: number; wacht?: number; stil?: boolean; geenBeeld?: boolean };
type Binnen = { id: string; gesprek: number; naam: string; ander: number; sdp: string; video: boolean; van: number };

export type BelStaat = { bel: Lopend | null; binnen: Binnen | null; melding: string };

let staat: BelStaat = { bel: null, binnen: null, melding: "" };
const luisteraars = new Set<() => void>();
const zet = (deel: Partial<BelStaat>) => {
  staat = { ...staat, ...deel };
  luisteraars.forEach((f) => f());
};
const ververs = () => zet({});
export const belStaat = () => staat;
export function belVolgen(f: () => void) {
  luisteraars.add(f);
  return () => { luisteraars.delete(f); };
}
export const kan = () => typeof RTCPeerConnection !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

// --- Logboek op dit apparaat --------------------------------------------------------------------------------------

let ikId = 0;
const logSleutel = () => `assistent.oproepen.${ikId}`;
export function oproepen(): Oproep[] {
  try {
    return JSON.parse(localStorage.getItem(logSleutel()) ?? "[]");
  } catch {
    return [];
  }
}
export function oproepenWissen() {
  try { localStorage.removeItem(logSleutel()); } catch { /* niets te wissen */ }
  ververs();
}
function loggen(o: Oproep) {
  try {
    const lijst = [o, ...oproepen().filter((x) => x.id !== o.id)].slice(0, 100);
    localStorage.setItem(logSleutel(), JSON.stringify(lijst));
  } catch {
    /* geen opslag: dan zonder logboek */
  }
  ververs();
}

// --- Voorkeuren op dit apparaat ----------------------------------------------------------------------------------
// Hoe dit toestel overgaat hoort bij het toestel zelf (je laptop mag stil, je telefoon niet), dus niet in je account.

export type BelVoorkeur = { geluid: "aan" | "trillen" | "stil"; stilAan: boolean; stilVan: string; stilTot: string;
  micUit: boolean; cameraUit: boolean; favorieten: number[] };
const STANDAARD: BelVoorkeur = { geluid: "aan", stilAan: false, stilVan: "22:00", stilTot: "07:00", micUit: false,
  cameraUit: false, favorieten: [] };
const voorkeurSleutel = () => `assistent.bellen.voorkeur.${ikId}`;

export function belVoorkeur(): BelVoorkeur {
  try {
    return { ...STANDAARD, ...JSON.parse(localStorage.getItem(voorkeurSleutel()) ?? "{}") };
  } catch {
    return { ...STANDAARD };
  }
}
export function belVoorkeurZetten(deel: Partial<BelVoorkeur>) {
  try {
    localStorage.setItem(voorkeurSleutel(), JSON.stringify({ ...belVoorkeur(), ...deel }));
  } catch {
    /* geen opslag: dan blijft het zoals het was */
  }
  ververs();
}

/** Valt dit moment in je stille uren? Ook als die over middernacht lopen (22:00 tot 07:00). */
export function stilNu(v: BelVoorkeur = belVoorkeur(), nu = new Date()) {
  if (!v.stilAan) return false;
  const min = (t: string) => { const [u, m] = t.split(":").map(Number); return (u || 0) * 60 + (m || 0); };
  const n = nu.getHours() * 60 + nu.getMinutes();
  const van = min(v.stilVan), tot = min(v.stilTot);
  return van <= tot ? n >= van && n < tot : n >= van || n < tot;
}

// --- Signalen ----------------------------------------------------------------------------------------------------

const stuur = (gesprek: number, b: Bericht) => versturen(gesprek, b);

function iceKlaar(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise<void>((klaar) => {
    const k = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", k);
        klaar();
      }
    };
    pc.addEventListener("icegatheringstatechange", k);
    setTimeout(klaar, 2500);
  });
}

async function verbinding(video: boolean) {
  const media = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: video ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
  const pc = new RTCPeerConnection({ iceServers: ICE });
  media.getTracks().forEach((s) => pc.addTrack(s, media));
  pc.addEventListener("track", (e) => {
    if (staat.bel?.pc === pc && e.streams[0]) {
      staat.bel.ander_beeld = e.streams[0];
      ververs();
    }
  });
  pc.addEventListener("connectionstatechange", () => {
    const b = staat.bel;
    if (!b || b.pc !== pc) return;
    if (pc.connectionState === "connected" && b.fase !== "verbonden") {
      b.fase = "verbonden";
      b.begin = Date.now();
      ververs();
    }
    if (pc.connectionState === "failed") ophangen("mislukt");
  });
  return { pc, media };
}

const foutTekst = (e: unknown) => e instanceof DOMException && e.name === "NotAllowedError"
  ? "Geef de app toegang tot je microfoon (en camera) om te bellen." : "Bellen lukte niet.";

export async function bellen(gesprek: number, naam: string, ander: number, video: boolean) {
  if (staat.bel || staat.binnen) return;
  if (!kan()) return zet({ melding: "Bellen kan niet in deze browser." });
  const bel: Lopend = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), gesprek, naam, ander, video,
    rol: "beller", fase: "starten" };
  zet({ bel, melding: "" });
  try {
    const { pc, media } = await verbinding(video);
    if (belStaat().bel !== bel) {
      media.getTracks().forEach((s) => s.stop());
      pc.close();
      return;
    }
    Object.assign(bel, { pc, media });
    ververs();
    await pc.setLocalDescription(await pc.createOffer());
    await iceKlaar(pc);
    if (belStaat().bel !== bel) return;
    bel.fase = "bellen";
    ververs();
    await stuur(gesprek, { t: "bel", fase: "aanbod", id: bel.id, video, sdp: pc.localDescription!.sdp });
    bel.wacht = window.setTimeout(() => belStaat().bel === bel && bel.fase === "bellen" && ophangen("geen"), GELDIG);
    snel(gesprek);
  } catch (e) {
    opruimen(foutTekst(e));
  }
}

export async function opnemen() {
  const i = staat.binnen;
  if (!i) return;
  belgeluid(false);
  const bel: Lopend = { id: i.id, gesprek: i.gesprek, naam: i.naam, ander: i.ander, video: i.video, rol: "gebelde",
    fase: "verbinden" };
  zet({ binnen: null, bel });
  try {
    const { pc, media } = await verbinding(i.video);
    Object.assign(bel, { pc, media });
    ververs();
    await pc.setRemoteDescription({ type: "offer", sdp: i.sdp });
    await pc.setLocalDescription(await pc.createAnswer());
    await iceKlaar(pc);
    await stuur(i.gesprek, { t: "bel", fase: "antwoord", id: i.id, aan: i.van, sdp: pc.localDescription!.sdp });
    snel(i.gesprek);
    // Opnemen met microfoon of camera uit, als je dat zo hebt ingesteld.
    const v = belVoorkeur();
    if (v.micUit) dempen();
    if (v.cameraUit && i.video) beeldUit();
  } catch (e) {
    ophangen("mislukt");
    zet({ melding: foutTekst(e) });
  }
}

export function weigeren() {
  const i = staat.binnen;
  if (!i) return;
  belgeluid(false);
  zet({ binnen: null });
  stuur(i.gesprek, { t: "bel", fase: "einde", id: i.id, reden: "weiger", video: i.video }).catch(() => {});
  loggen({ id: i.id, gesprek: i.gesprek, naam: i.naam, ander: i.ander, video: i.video, uit: false, status: "geweigerd",
    duur: 0, tijd: new Date().toISOString() });
}

export function ophangen(reden: "klaar" | "geen" | "mislukt" = "klaar") {
  const b = staat.bel;
  if (!b) return;
  const duur = b.begin ? Math.round((Date.now() - b.begin) / 1000) : 0;
  if (b.fase !== "starten") stuur(b.gesprek, { t: "bel", fase: "einde", id: b.id, reden, duur, video: b.video }).catch(() => {});
  loggen({ id: b.id, gesprek: b.gesprek, naam: b.naam, ander: b.ander, video: b.video, uit: b.rol === "beller",
    status: reden === "klaar" ? (duur ? "klaar" : "geen") : reden, duur, tijd: new Date().toISOString() });
  opruimen(reden === "geen" ? "Niet opgenomen" : reden === "mislukt" ? "Verbinding mislukt" : "");
}

function opruimen(melding = "") {
  const b = staat.bel;
  if (b) {
    clearTimeout(b.wacht);
    b.media?.getTracks().forEach((s) => s.stop());
    b.pc?.close();
  }
  zet({ bel: null, melding });
}

export function dempen() {
  const b = staat.bel;
  if (!b?.media) return;
  b.stil = !b.stil;
  b.media.getAudioTracks().forEach((s) => { s.enabled = !b.stil; });
  ververs();
}

export function beeldUit() {
  const b = staat.bel;
  if (!b?.media) return;
  b.geenBeeld = !b.geenBeeld;
  b.media.getVideoTracks().forEach((s) => { s.enabled = !b.geenBeeld; });
  ververs();
}

export const meldingWeg = () => zet({ melding: "" });

// --- Luisteren -----------------------------------------------------------------------------------------------------

const gezien = new Map<number, number>();
const verwerkt = new Set<string>();
let klok: Peiler | null = null;
let snelKlok = 0;
let bezig = false;
let namen = new Map<number, { naam: string; ander: number }>();

function signaal(gesprek: number, r: { id: number; afzender: number; apparaat: number; tijd: string; bericht: Bericht }) {
  const m = r.bericht;
  if (m.t !== "bel" || r.apparaat === mijnApparaat() || typeof m.id !== "string") return;
  const sleutel = `${m.id}:${m.fase}:${r.apparaat}`;
  if (verwerkt.has(sleutel)) return;
  verwerkt.add(sleutel);
  const vers = Date.now() - new Date(r.tijd).getTime() < GELDIG;
  const wie = namen.get(gesprek) ?? { naam: "", ander: r.afzender };
  if (m.fase === "aanbod" && r.afzender !== ikId && vers && !staat.bel && !staat.binnen && typeof m.sdp === "string") {
    zet({ binnen: { id: m.id, gesprek, sdp: m.sdp, video: !!m.video, van: r.apparaat, naam: wie.naam, ander: wie.ander } });
    belgeluid(true);
    snel(gesprek);
    return;
  }
  const b = staat.bel;
  if (m.fase === "antwoord" && b?.id === m.id && b.rol === "beller" && m.aan === mijnApparaat() && b.fase === "bellen"
      && typeof m.sdp === "string") {
    clearTimeout(b.wacht);
    b.fase = "verbinden";
    ververs();
    b.pc?.setRemoteDescription({ type: "answer", sdp: m.sdp }).catch(() => ophangen("mislukt"));
    return;
  }
  const i = staat.binnen;
  if (m.fase === "antwoord" && i?.id === m.id && r.afzender === ikId) {
    belgeluid(false);
    zet({ binnen: null }); // op je andere toestel opgenomen
    return;
  }
  if (m.fase === "einde") {
    if (i?.id === m.id) {
      belgeluid(false);
      zet({ binnen: null });
      loggen({ id: i.id, gesprek, naam: i.naam, ander: i.ander, video: i.video, uit: false, status: "gemist", duur: 0,
        tijd: new Date().toISOString() });
    }
    if (b?.id === m.id) {
      loggen({ id: b.id, gesprek, naam: b.naam, ander: b.ander, video: b.video, uit: b.rol === "beller",
        status: m.reden === "weiger" ? "geweigerd" : b.begin ? "klaar" : "geen",
        duur: b.begin ? Math.round((Date.now() - b.begin) / 1000) : 0, tijd: new Date().toISOString() });
      opruimen(m.reden === "weiger" ? "Geweigerd" : "Opgehangen");
    }
  }
}

async function kijken(gesprek: number) {
  const na = gezien.get(gesprek) ?? 0;
  const lijst = await stilLezen(gesprek, na);
  for (const r of lijst) {
    gezien.set(gesprek, Math.max(gezien.get(gesprek) ?? 0, r.id));
    signaal(gesprek, r);
  }
}

/** Zolang er een oproep loopt elke seconde in dat ene gesprek kijken. */
function snel(gesprek: number) {
  clearTimeout(snelKlok);
  if (!staat.bel && !staat.binnen) return;
  if (staat.bel?.fase === "verbonden") return;
  snelKlok = window.setTimeout(async () => {
    await kijken(gesprek).catch(() => {});
    snel(gesprek);
  }, 1000);
}

async function ronde() {
  if (bezig || document.visibilityState !== "visible") return false;
  bezig = true;
  let nieuw = false;
  try {
    const lijst = await gesprekken();
    namen = new Map(lijst.filter((g) => g.soort === "twee").map((g) =>
      [g.id, { naam: gesprekNaam(g, ikId), ander: g.leden.find((l) => l.id !== ikId)?.id ?? 0 }]));
    for (const g of lijst) {
      if (g.soort !== "twee" || g.status !== "lid" || !g.laatste_id) continue;
      if (!gezien.has(g.id)) {
        gezien.set(g.id, Math.max(0, g.laatste_id - 3)); // de laatste paar: een oproep die net binnenkwam
      }
      if (g.laatste_id > (gezien.get(g.id) ?? 0)) { nieuw = true; await kijken(g.id).catch(() => {}); }
    }
  } catch {
    /* volgende ronde */
  } finally {
    bezig = false;
  }
  return nieuw;
}

/** Begint met luisteren naar oproepen (één keer per sessie). */
export function luisteren(mijnId: number) {
  if (klok && ikId === mijnId) return;
  ikId = mijnId;
  klok?.stop();
  ronde();
  // Snel als er net iets binnenkwam of je de app gebruikt; is het stil, dan rustiger (een oproep gaat lang genoeg over).
  klok = peilen(ronde, 3000, 10_000);
}

export const naamVan = (gesprek: number) => namen.get(gesprek);

// --- Belgeluid ----------------------------------------------------------------------------------------------------

let geluid = 0;
let audio: AudioContext | null = null;
function belgeluid(aan: boolean) {
  clearInterval(geluid);
  if (!aan) return;
  const v = belVoorkeur();
  if (v.geluid === "stil" || stilNu(v)) return; // de oproep staat wel in beeld, alleen zonder geluid
  const toon = () => {
    try {
      navigator.vibrate?.([300, 200, 300]);
      if (v.geluid === "trillen") return;
      audio ??= new AudioContext();
      for (const [start, hz] of [[0, 660], [0.25, 880]] as const) {
        const o = audio.createOscillator();
        const v = audio.createGain();
        o.frequency.value = hz;
        v.gain.setValueAtTime(0.0001, audio.currentTime + start);
        v.gain.exponentialRampToValueAtTime(0.12, audio.currentTime + start + 0.03);
        v.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + 0.22);
        o.connect(v).connect(audio.destination);
        o.start(audio.currentTime + start);
        o.stop(audio.currentTime + start + 0.25);
      }
    } catch {
      /* geen geluid mogelijk */
    }
  };
  toon();
  geluid = window.setInterval(toon, 2000);
}
