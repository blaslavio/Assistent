// Je eigen winkel in de app: inrichten, producten erin zetten met voorraad, openen en delen. Dezelfde
// databasefuncties als de vorige app (sql/webshop.sql); betalen loopt altijd via de app (Stripe).
import { alsIk } from "../api";

export type EigenProduct = { id: number; titel: string; prijs: number; actief: boolean; geblokkeerd: boolean;
  in_winkel: boolean; voorraad: number | null; betaalwijzen: string[]; levering: string[] };
export type EigenWinkel = { adres: string; naam: string; omschrijving: string; kleur: string; verzendkosten: number;
  gratis_vanaf: number | null; retour: string; open: boolean; volgers: number; actie: string };
export type MijnWinkel = { winkel: EigenWinkel | null; niveau: string; kan_betalen: boolean; commissie_procent: number;
  commissie_min: number; producten: EigenProduct[]; verkopen: { aantal: number; omzet: number; commissie: number } };

/** Kleuren voor je winkel: dezelfde als de stijlkeuzes van de app, zodat alles bij elkaar past. */
export const WINKELKLEUREN: [string, string][] = [["#4f46e5", "Indigo"], ["#0f766e", "Zeegroen"], ["#c2410c", "Oranje"],
  ["#27272a", "Grafiet"], ["#be185d", "Framboos"], ["#1d4ed8", "Blauw"]];

const getal = (x: unknown) => Number(x ?? 0) || 0;

export async function mijnWinkel(): Promise<MijnWinkel> {
  const r = await alsIk<Partial<MijnWinkel> & { fout?: string }>("mijn_winkel");
  if (r.fout) throw new Error(r.fout);
  const w = r.winkel;
  return {
    winkel: w ? { ...w, verzendkosten: getal(w.verzendkosten), gratis_vanaf: w.gratis_vanaf == null ? null : getal(w.gratis_vanaf),
      omschrijving: w.omschrijving ?? "", retour: w.retour ?? "", actie: w.actie ?? "", volgers: getal(w.volgers) } : null,
    niveau: r.niveau ?? "particulier", kan_betalen: !!r.kan_betalen,
    commissie_procent: getal(r.commissie_procent ?? 5), commissie_min: getal(r.commissie_min ?? 0.35),
    producten: (r.producten ?? []).map((p) => ({ ...p, prijs: getal(p.prijs), betaalwijzen: p.betaalwijzen ?? [],
      levering: p.levering ?? [] })),
    verkopen: { aantal: getal(r.verkopen?.aantal), omzet: getal(r.verkopen?.omzet), commissie: getal(r.verkopen?.commissie) },
  };
}

/** Een webadres uit de naam: "Bakkerij De Zon" wordt "bakkerij-de-zon". */
export const webadres = (naam: string) => naam.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30).replace(/-+$/, "");

async function doe(functie: string, parameters: Record<string, unknown>) {
  const r = await alsIk<{ ok?: boolean; fout?: string }>(functie, parameters);
  if (r.fout) throw new Error(r.fout);
  return r;
}

export function winkelBewaren(w: Pick<EigenWinkel, "adres" | "naam" | "omschrijving" | "kleur" | "verzendkosten"
  | "gratis_vanaf" | "retour" | "open">) {
  return doe("winkel_instellen", { p_adres: w.adres, p_winkelnaam: w.naam, p_omschrijving: w.omschrijving,
    p_kleur: w.kleur, p_verzendkosten: w.verzendkosten, p_gratis_vanaf: w.gratis_vanaf, p_retour: w.retour, p_open: w.open });
}

export const productInWinkel = (id: number, inWinkel: boolean, voorraad: number | null) =>
  doe("winkel_product", { p_aanbod: id, p_in_winkel: inWinkel, p_voorraad: voorraad });

/** Een webshop kan met accounttype Verkoper; wie nog Particulier is, wordt dat als hij een winkel begint. */
export const verkoperWorden = () => doe("niveau_instellen", { p_niveau: "verkoper", p_bedrijf: {} });

/** De link om te delen. Op Streamlit is dat het adres van het venster eromheen. */
export function winkelLink(adres: string) {
  let basis = location.origin + location.pathname;
  try {
    basis = window.top!.location.origin + "/";
  } catch {
    /* ander adres */
  }
  return `${basis}?winkel=${adres}`;
}

// Een gedeelde winkellink (?winkel=adres) opent die winkel in de app, ook na het inloggen.
let gevraagd: string | null = null;
export function winkelVragen(adres: string) {
  const a = adres.toLowerCase().trim();
  gevraagd = /^[a-z0-9][a-z0-9-]{2,29}$/.test(a) ? a : null;
  return gevraagd !== null;
}
export function winkelGevraagd() {
  const a = gevraagd;
  gevraagd = null;
  return a;
}
export const isWinkelGevraagd = () => gevraagd !== null;
