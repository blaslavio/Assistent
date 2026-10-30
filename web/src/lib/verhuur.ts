import { alsIk } from "../api";
export const VOORZIENINGEN = ["wifi", "keuken", "wasmachine", "werkplek", "huisdieren", "kindvriendelijk", "rolstoeltoegankelijk", "parkeren", "rustig", "laadpunt"] as const;
export type Verblijf = { id: string; versie: number; titel: string; plaats: string; land: string; beschrijving: string;
  adres?: string; regels: string; prijs: number; schoonmaak: number; personen: number; van: string; tot: string;
  voorzieningen: string[]; open: boolean; weg?: boolean };
export type Reservering = { id: string; verblijf: string; titel: string; plaats: string; van: string; tot: string; personen: number;
  totaal: number; voorwaarden: string; status: "aangevraagd" | "bevestigd" | "afgewezen" | "geannuleerd"; verhuurder: boolean; contact: string; adres: string | null };
export type Blokkade = { id: string; verblijf: string; van: string; tot: string };
export const blokkeren = (b: Blokkade, verwijderen = false) => ik("vakantie_blokkade_bewaren", {p_id:b.id,p_verblijf:b.verblijf,p_van:b.van,p_tot:b.tot,p_verwijderen:verwijderen});
export type MijnVerhuur = { blokkades?: Blokkade[]; verblijven: Verblijf[]; reserveringen: Reservering[] };
async function ik<T>(functie: string, p: Record<string, unknown> = {}) {
  const a = await alsIk<T & { fout?: string }>(functie, p);
  if (a?.fout) throw new Error(a.fout);
  return a as T;
}
export const mijnVerhuur = () => ik<MijnVerhuur>("mijn_vakantie_verhuur");
export const zoeken = (van: string, tot: string, personen: number, plek: string) => ik<{ verblijven: Verblijf[] }>("vakantie_verblijven_zoeken", { p_van: van, p_tot: tot, p_personen: personen, p_plek: plek });
export const bewaren = (v: Verblijf, gerechtigd: boolean) => ik<{ verblijf: Verblijf }>("vakantie_verblijf_bewaren", { p_id: v.id, p_versie: v.versie, p_data: { ...v, gerechtigd } });
export type Aanvraag = { id: string; verblijf: Verblijf; van: string; tot: string; personen: number };
export const aanvragen = (a: Aanvraag) => ik<{ id: string; status: Reservering["status"]; totaal: number }>("vakantie_aanvragen", { p_id: a.id, p_verblijf: a.verblijf.id, p_versie: a.verblijf.versie, p_van: a.van, p_tot: a.tot, p_personen: a.personen });
export const actie = (id: string, actie: "bevestigen" | "afwijzen" | "annuleren") => ik<{ status: Reservering["status"] }>("vakantie_reservering_actie", { p_id: id, p_actie: actie });
export const verwijderen = (v: Verblijf) => ik("vakantie_verblijf_verwijderen", { p_id: v.id, p_versie: v.versie });
