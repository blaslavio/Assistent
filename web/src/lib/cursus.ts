// Cursussen in een community (zie sql/community_aanbod.sql). De eigenaar maakt cursussen met lessen; leden volgen ze
// in de app. Een cursus is gratis voor leden of eenmalig te koop; betalen gaat via Stripe naar de eigenaar.
import { SLEUTEL, SUPABASE, alsIk, huidigeSessie } from "../api";

export type Cursus = { id: number; community: number; titel: string; omschrijving: string; prijs_cent: number;
  voor_abonnees: boolean; gepubliceerd: boolean; toegang: boolean; gekocht: boolean; lessen: number; minuten: number;
  klaar: number; kopers: number | null };
export type Les = { id: number; titel: string; minuten: number; inhoud: string | null; video: string | null; klaar: boolean };
export type Aanbod = { id: number; naam: string; beheer: boolean; kan_ontvangen: boolean; cursussen: Cursus[] };

async function doe<T>(functie: string, parameters: Record<string, unknown>) {
  const r = await alsIk<T & { fout?: string }>(functie, parameters);
  if (r.fout) throw new Error(r.fout);
  return r;
}

export const aanbod = (community: number) => doe<Aanbod>("community_aanbod", { p_community: community });
export const lezen = (cursus: number) =>
  doe<Cursus & { les_lijst: Les[]; beheer: boolean; community_naam: string }>("cursus_lezen", { p_cursus: cursus });

export const opslaan = (community: number, cursus: number | null, c: { titel: string; omschrijving: string; prijs: number;
  gepubliceerd: boolean }) =>
  doe<{ id: number }>("cursus_opslaan", { p_community: community, p_cursus: cursus, p_titel: c.titel.trim(),
    p_omschrijving: c.omschrijving.trim(), p_prijs_cent: Math.round(Math.max(0, c.prijs) * 100), p_voor_abonnees: false,
    p_gepubliceerd: c.gepubliceerd });

export const weg = (cursus: number) => doe("cursus_weg", { p_cursus: cursus });

export const lesOpslaan = (cursus: number, les: number | null, l: { titel: string; inhoud: string; video: string; minuten: number }) =>
  doe<{ id: number }>("les_opslaan", { p_cursus: cursus, p_les: les, p_titel: l.titel.trim(), p_inhoud: l.inhoud,
    p_video: l.video.trim(), p_minuten: Math.max(0, Math.round(l.minuten || 0)) });

export const lesWijzigen = (les: number, actie: "weg" | "op" | "neer") => doe("les_wijzigen", { p_les: les, p_actie: actie });
export const lesKlaar = (les: number, klaar: boolean) => doe("les_klaar", { p_les: les, p_klaar: klaar });

async function stripe<T>(actie: string, velden: Record<string, unknown>): Promise<T> {
  const s = huidigeSessie();
  if (!s) throw new Error("Log opnieuw in.");
  const r = await fetch(`${SUPABASE}/functions/v1/betalen`, {
    method: "POST", headers: { "content-type": "application/json", apikey: SLEUTEL },
    body: JSON.stringify({ actie, naam: s.naam, wachtwoord: s.token, ...velden }),
  });
  const a = await r.json().catch(() => ({ fout: "De betaaldienst is even niet bereikbaar. Probeer het later opnieuw." }));
  if (a.fout) throw new Error(a.fout);
  return a as T;
}

/** Naar de betaalpagina. Alleen na akkoord dat je meteen begint (bij digitale inhoud geldt dan geen bedenktijd). */
export async function kopen(cursus: number) {
  const { url } = await stripe<{ url: string }>("cursus_afrekenen", { cursus, akkoord: true });
  (window.top ?? window).location.href = url;
}

export const gekochtControleren = (sessie: string) => stripe<{ betaald: boolean; cursus: number }>("cursus_controleren", { sessie });

export const prijsTekst = (cent: number) => (cent ? (cent / 100).toLocaleString("nl-NL", { style: "currency", currency: "EUR" }) : "Gratis");

/** Video in de app afspelen: YouTube (zonder cookies), Vimeo of een videobestand. Andere links openen apart. */
export function videoSpeler(url: string): { soort: "embed" | "bestand" | "link"; src: string } | null {
  const u = (url ?? "").trim();
  if (!u.startsWith("https://")) return null;
  const yt = u.match(/^https:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { soort: "embed", src: `https://www.youtube-nocookie.com/embed/${yt[1]}` };
  const vimeo = u.match(/^https:\/\/(?:www\.|player\.)?vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return { soort: "embed", src: `https://player.vimeo.com/video/${vimeo[1]}?dnt=1` };
  if (/\.(mp4|webm|mov)(\?|$)/i.test(u)) return { soort: "bestand", src: u };
  return { soort: "link", src: u };
}

// Terug van betalen voor een cursus (?cursus_betaald=sessie): de app controleert of het gelukt is.
let terug: string | null = null;
export function terugVanCursus(sessie: string | null) {
  terug = sessie && /^[\w-]{6,}$/.test(sessie) ? sessie : null;
  return terug !== null;
}
export function cursusTerug() {
  const t = terug;
  terug = null;
  return t;
}
