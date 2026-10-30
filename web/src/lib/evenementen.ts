import { adresWaarde, alsIk } from "../api";
import type { Activiteit } from "./club";
export function evenementVerwijzing(): { groep: number; id: number } | null {
  const groep = adresWaarde("groep"), id = adresWaarde("evenement");
  if (!groep || !id || !/^[1-9]\d*$/.test(groep) || !/^[1-9]\d*$/.test(id)) return null;
  const g = Number(groep), i = Number(id);
  return Number.isSafeInteger(g) && Number.isSafeInteger(i) ? { groep: g, id: i } : null;
}
export async function evenementBekijken(groep: number, id: number): Promise<Activiteit> {
  const r = await alsIk<{ activiteit?: Activiteit; fout?: string }>("community_evenement_bekijken", { p_community: groep, p_id: id });
  if (!r.activiteit || r.fout) throw new Error("Dit evenement is niet beschikbaar. Het kan verwijderd zijn of je hebt geen toegang.");
  return r.activiteit;
}
export function evenementLink(groep: number, id: number) {
  if (![groep,id].every(n => Number.isSafeInteger(n) && n > 0)) throw new Error("Ongeldig evenement.");
  let url: URL;
  try { url = new URL(window.parent.location.href); } catch { url = new URL(location.href); }
  if (!["http:","https:"].includes(url.protocol)) url = new URL(location.href);
  url.search = ""; url.hash = "";
  url.searchParams.set("evenement", String(id)); url.searchParams.set("groep", String(groep));
  return url.toString();
}
