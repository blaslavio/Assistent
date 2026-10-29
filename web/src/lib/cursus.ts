// Cursussen en trainingen in een community (zie sql/community_aanbod.sql en sql/abonnementen_pakketten.sql). De
// eigenaar maakt ze met lessen; leden volgen ze in de app. Een cursus is gratis voor leden, eenmalig te koop, zit in
// een pakket (een paar samen voor één prijs) of hoort bij een abonnement per maand of per jaar. Betalen gaat via
// Stripe naar de eigenaar.
import { SLEUTEL, SUPABASE, alsIk, huidigeSessie } from "../api";

export type Soort = "cursus" | "training";
export type Periode = "maand" | "jaar";
export type Cursus = { id: number; community: number; titel: string; omschrijving: string; soort: Soort; prijs_cent: number;
  voor_abonnees: boolean; gepubliceerd: boolean; toegang: boolean; gekocht: boolean; lessen: number; minuten: number;
  klaar: number; kopers: number | null };
export type Les = { id: number; titel: string; minuten: number; inhoud: string | null; video: string | null; klaar: boolean };
export type Plan = { id: number; naam: string; prijs_cent: number; periode: Periode; voordelen: string; actief: boolean;
  abonnees: number | null };
export type Pakket = { id: number; titel: string; omschrijving: string; prijs_cent: number; gepubliceerd: boolean;
  cursussen: { id: number; titel: string; soort: Soort; prijs_cent: number; toegang: boolean }[]; gekocht: boolean;
  kopers: number | null };
export type Abonnement = { plan: number; naam: string; periode: Periode; status: string; tot: string | null; opzeggen: boolean };
export type Aanbod = { id: number; naam: string; beheer: boolean; kan_ontvangen: boolean; cursussen: Cursus[];
  plannen: Plan[]; pakketten: Pakket[]; abonnement: Abonnement | null };

async function doe<T>(functie: string, parameters: Record<string, unknown>) {
  const r = await alsIk<T & { fout?: string }>(functie, parameters);
  if (r.fout) throw new Error(r.fout);
  return r;
}

export const aanbod = async (community: number): Promise<Aanbod> => {
  const a = await doe<Aanbod>("community_aanbod", { p_community: community });
  return { ...a, plannen: a.plannen ?? [], pakketten: a.pakketten ?? [], abonnement: a.abonnement ?? null,
    cursussen: (a.cursussen ?? []).map((c) => ({ ...c, soort: c.soort ?? "cursus" })) };
};
export const lezen = (cursus: number) =>
  doe<Cursus & { les_lijst: Les[]; beheer: boolean; community_naam: string }>("cursus_lezen", { p_cursus: cursus });

export const opslaan = (community: number, cursus: number | null, c: { titel: string; omschrijving: string; prijs: number;
  gepubliceerd: boolean; soort?: Soort; voorAbonnees?: boolean }) =>
  doe<{ id: number }>("cursus_opslaan", { p_community: community, p_cursus: cursus, p_titel: c.titel.trim(),
    p_omschrijving: c.omschrijving.trim(), p_prijs_cent: c.voorAbonnees ? 0 : Math.round(Math.max(0, c.prijs) * 100),
    p_voor_abonnees: !!c.voorAbonnees, p_gepubliceerd: c.gepubliceerd, p_soort: c.soort ?? "cursus" });

/** Een abonnement per maand of per jaar; cursussen met "Bij abonnement" zijn dan inbegrepen. */
export const planOpslaan = (community: number, plan: number | null, p: { naam: string; prijs: number; periode: Periode;
  voordelen: string; actief: boolean }) =>
  doe<{ id: number }>("plan_opslaan", { p_community: community, p_plan: plan, p_titel: p.naam.trim(),
    p_prijs_cent: Math.round(Math.max(0, p.prijs) * 100), p_voordelen: p.voordelen.trim(), p_actief: p.actief,
    p_periode: p.periode });

/** Een pakket: minstens twee cursussen of trainingen samen, voor één prijs. */
export const pakketOpslaan = (community: number, pakket: number | null, p: { titel: string; omschrijving: string;
  prijs: number; cursussen: number[]; gepubliceerd: boolean }) =>
  doe<{ id: number }>("pakket_opslaan", { p_community: community, p_pakket: pakket, p_titel: p.titel.trim(),
    p_omschrijving: p.omschrijving.trim(), p_prijs_cent: Math.round(Math.max(0, p.prijs) * 100), p_cursussen: p.cursussen,
    p_gepubliceerd: p.gepubliceerd });
export const pakketWeg = (pakket: number) => doe("pakket_weg", { p_pakket: pakket });

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

export async function pakketKopen(pakket: number) {
  const { url } = await stripe<{ url: string }>("pakket_afrekenen", { pakket, akkoord: true });
  (window.top ?? window).location.href = url;
}

export async function abonneren(plan: number) {
  const { url } = await stripe<{ url: string }>("community_abonneren", { plan });
  (window.top ?? window).location.href = url;
}

/** Opzeggen loopt tot het eind van de betaalde maand of het betaalde jaar; terug = toch doorgaan. */
export const opzeggen = (plan: number, terug = false) => stripe<{ ok: boolean }>("community_opzeggen", { plan, terug });

export const perPeriode = (cent: number, periode: Periode) => `${prijsTekst(cent)} per ${periode}`;

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

// Terug van betalen (?cursus_betaald=, ?pakket_betaald= of ?community_abonnement= met de betaalsessie): de app
// controleert of het gelukt is.
type Terug = { soort: "cursus" | "pakket" | "abonnement"; sessie: string };
let terug: Terug | null = null;
const geldig = (s: string | null | undefined) => (s && /^[\w-]{6,}$/.test(s) ? s : null);
export function terugVanCursus(cursus: string | null, pakket: string | null = null, abonnement: string | null = null) {
  const [soort, sessie] = geldig(cursus) ? ["cursus", cursus] : geldig(pakket) ? ["pakket", pakket]
    : geldig(abonnement) ? ["abonnement", abonnement] : [null, null];
  terug = soort ? { soort: soort as Terug["soort"], sessie: sessie! } : null;
  return terug !== null;
}
export function cursusTerug() {
  const t = terug;
  terug = null;
  return t;
}

/** Wat de mascotte zegt na het betalen. */
export async function terugControleren(t: Terug): Promise<string> {
  if (t.soort === "abonnement") {
    const r = await stripe<{ actief: boolean }>("community_controleren", { sessie: t.sessie });
    return r.actief ? "Gelukt! Je abonnement loopt. Alles wat erbij hoort, staat klaar in de community."
      : "Je abonnement is nog niet actief. Kijk zo nog eens.";
  }
  const r = t.soort === "pakket"
    ? await stripe<{ betaald: boolean }>("pakket_controleren", { sessie: t.sessie })
    : await gekochtControleren(t.sessie);
  if (!r.betaald) return "De betaling is nog niet binnen. Kijk zo nog eens.";
  return t.soort === "pakket" ? "Gelukt! Alles uit je pakket staat klaar in de community."
    : "Gelukt! Je cursus staat klaar in de community.";
}
