// Je openbare profielpagina (?profiel=adres): een visitekaartje met je naam, een zin, je links en wat je toch al
// openbaar aanbiedt. Standaard uit. Je gebruikersnaam staat er niet op; het adres kies je los.
import { adresWaarde, alsIk, rpc } from "../api";
import type { Soort } from "./cursus";

export type Link = { label: string; url: string };
export type MijnPagina = { adres: string; aan: boolean; kop: string; links: Link[] };
export type ProfielPagina = {
  adres: string; naam: string; kop: string; over: string; links: Link[]; foto: string | null;
  winkel: { adres: string; naam: string; omschrijving: string; kleur?: string } | null;
  boek: { adres: string; titel: string; intro: string } | null;
  communities: { id: number; naam: string; omschrijving: string; leden: number }[];
  aanbod: { id: number; titel: string; soort: Soort; prijs_cent: number }[];
  posts: { id: number; tekst: string; aangemaakt: string; community_naam: string }[];
  spullen: { id: number; titel: string; prijs: number | null }[];
};

export const ADRES = /^[a-z0-9][a-z0-9-]{2,29}$/;

/** Een adres van je naam: "Sanne de Vries" wordt "sanne-de-vries". */
export const adresVan = (naam: string) =>
  naam.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);

export async function mijnPagina(): Promise<MijnPagina | null> {
  return (await alsIk<{ pagina: MijnPagina | null }>("mijn_profielpagina", {})).pagina;
}

export async function paginaBewaren(p: MijnPagina) {
  const r = await alsIk<{ ok?: boolean; adres?: string; fout?: string }>("profielpagina_instellen",
    { p_adres: p.adres, p_aan: p.aan, p_kop: p.kop, p_links: p.links });
  if (r.fout) throw new Error(r.fout);
  return r.adres ?? p.adres;
}

export async function profielBekijken(adres: string): Promise<ProfielPagina> {
  const r = await rpc<ProfielPagina & { fout?: string }>("profiel_bekijken", { p_adres: adres });
  if (r.fout) throw new Error(r.fout);
  return r;
}

/** De link om te delen. Op Streamlit is dat het adres van het venster eromheen. */
export function profielLink(adres: string) {
  let basis = location.origin + location.pathname;
  try {
    basis = window.top!.location.origin + "/";
  } catch {
    /* ander adres */
  }
  return `${basis}?profiel=${adres}`;
}

export function profielAdres() {
  const v = adresWaarde("profiel");
  return v && ADRES.test(v) ? v : null;
}
