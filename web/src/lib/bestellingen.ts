// Je bestellingen als koper en als verkoper. Betalen via de app loopt via Stripe: het geld staat vast tot de koper
// bevestigt dat alles goed is ontvangen. Bij een probleem meld je een geschil en kijkt de beheerder ernaar.
import { SLEUTEL, SUPABASE, alsIk, huidigeSessie } from "../api";

export type Bestelling = {
  id: number; titel: string; bedrag: number; betaalwijze: string; levering: string; status: string;
  rol: "koper" | "verkoper"; ander: string; kosten?: number | null; aantal?: number; verzendkosten?: number | null;
  commissie?: number | null; webshop?: boolean; vervoerder?: string | null; track_code?: string | null;
  bijgewerkt: string; uitbetaald?: boolean;
};

export type Stap = { actie: string; naam: string; hoofd?: boolean; toelichting?: boolean };

export async function lijst(): Promise<Bestelling[]> {
  const a = await alsIk<{ bestellingen?: Bestelling[] }>("mijn_bestellingen");
  return (a.bestellingen ?? []).map((b) => ({ ...b, bedrag: Number(b.bedrag) }));
}

/** Wat jij nu met een bestelling kunt doen, afhankelijk van je rol en de status. */
export function stappen(b: Bestelling): Stap[] {
  const app = b.betaalwijze === "app";
  if (b.rol === "koper") {
    if (b.status === "aangevraagd") return [{ actie: "annuleren", naam: "Annuleren" }];
    if (b.status === "geaccepteerd") return [...(app ? [{ actie: "betalen", naam: "Betalen", hoofd: true }] : []),
      { actie: "annuleren", naam: "Annuleren" }];
    if (b.status === "betaald" || b.status === "geleverd") return [{ actie: "ontvangen", naam: "Alles goed ontvangen", hoofd: true },
      { actie: "probleem", naam: "Probleem melden", toelichting: true }];
    return [];
  }
  if (b.status === "aangevraagd") return [{ actie: "accepteren", naam: "Accepteren", hoofd: true }, { actie: "weigeren", naam: "Weigeren" }];
  if (b.status === "geaccepteerd") return [
    ...(!app ? [{ actie: "betaling_ontvangen", naam: "Betaling ontvangen", hoofd: true }] : []),
    ...(b.betaalwijze === "contant" ? [{ actie: "geleverd", naam: "Geleverd" }] : []),
    { actie: "weigeren", naam: "Annuleren" }];
  if (b.status === "betaald") return [{ actie: "geleverd", naam: "Geleverd", hoofd: true }];
  return [];
}

/** Een korte zin over waar het staat, en waar je geld is. */
export function stand(b: Bestelling): string {
  const app = b.betaalwijze === "app";
  const koper = b.rol === "koper";
  switch (b.status) {
    case "aangevraagd": return koper ? `Wacht op ${b.ander}` : "Wacht op jou";
    case "geaccepteerd": return koper ? (app ? "Geaccepteerd, je kunt betalen" : "Geaccepteerd, betaal zoals afgesproken")
      : app ? "Wacht op betaling" : "Wacht op betaling, meld als je hem hebt";
    case "betaald": return app ? (koper ? "Betaald. Je geld staat vast tot jij bevestigt" : "Betaald. Het geld staat vast tot de koper bevestigt")
      : "Betaald";
    case "geleverd": return koper ? "Geleverd. Bevestig als alles goed is" : "Geleverd, wacht op de koper";
    case "afgerond": return app && !koper ? (b.uitbetaald ? "Afgerond en uitbetaald" : "Afgerond, uitbetaling onderweg") : "Afgerond";
    case "geschil": return "Probleem gemeld. De beheerder kijkt ernaar en het geld blijft vast";
    case "terugbetaald": return "Terugbetaald";
    case "geannuleerd": return "Geannuleerd";
    default: return b.status;
  }
}

export const wachtOpMij = (b: Bestelling) => stappen(b).some((s) => s.hoofd);
export const klaar = (b: Bestelling) => ["afgerond", "geannuleerd", "terugbetaald"].includes(b.status);

async function stripe(actie: string, bestelling?: number): Promise<{ url?: string; klaar?: boolean }> {
  const s = huidigeSessie();
  if (!s) throw new Error("Log opnieuw in.");
  const r = await fetch(`${SUPABASE}/functions/v1/betalen`, {
    method: "POST", headers: { "content-type": "application/json", apikey: SLEUTEL },
    body: JSON.stringify({ actie, naam: s.naam, wachtwoord: s.token, bestelling }),
  });
  const a = await r.json().catch(() => ({ fout: "De betaaldienst is even niet bereikbaar. Probeer het later opnieuw." }));
  if (a.fout) throw new Error(a.fout);
  return a;
}

/** Voert een stap uit. Bij Betalen geeft hij het adres van de betaalpagina van Stripe terug. */
export async function uitvoeren(b: Bestelling, actie: string, toelichting = ""): Promise<string | null> {
  if (actie === "betalen") {
    const { url } = await stripe("afrekenen", b.id);
    if (!url) throw new Error("Betalen lukte niet.");
    return url;
  }
  if (actie === "ontvangen" && b.betaalwijze === "app") {
    await stripe("ontvangen", b.id);
    return null;
  }
  const a = await alsIk<{ fout?: string }>("bestelling_bijwerken", { p_id: b.id, p_actie: actie, p_toelichting: toelichting });
  if (a.fout) throw new Error(a.fout);
  return null;
}

// Naar Bestellingen vanaf een andere plek (de assistent, of terug van betalen).
let vraag: { melding?: string } | null = null;
export function openVragen(melding?: string) {
  vraag = { melding };
}
export const isGevraagd = () => vraag !== null;
export function openGevraagd() {
  const v = vraag;
  vraag = null;
  return v;
}

export type BetaalStatus = { aan: boolean; testmodus: boolean; sleutel_ingesteld: boolean; webhook_ingesteld: boolean;
  app_adres: string; ik_kan_ontvangen: boolean; ik_ben_aangemeld: boolean };

export const betaalStatus = () => alsIk<BetaalStatus>("betalen_status");

/** Link naar Stripe om je als verkoper aan te melden (identiteit en rekeningnummer). */
export async function verkoperAanmelden() {
  const { url } = await stripe("verkoper_aanmelden");
  if (!url) throw new Error("Aanmelden lukte niet.");
  return url;
}

/** Het adres waar Stripe na betalen naar terugstuurt: de app zelf, ook als hij in de Streamlit-pagina draait. */
export function appAdres() {
  try {
    return window.top!.location.origin + "/";
  } catch {
    return location.origin + "/";
  }
}

/** Alleen de eigenaar: de Stripe-sleutels. Lege velden laten wat er al staat. */
export async function platformInstellen(sleutel: string, webhook: string) {
  const a = await alsIk<{ fout?: string; geen_toegang?: boolean }>("platform_instellen",
    { p_stripe_sleutel: sleutel.trim(), p_webhook_geheim: webhook.trim(), p_app_adres: appAdres() });
  if (a.fout) throw new Error(a.fout);
}
