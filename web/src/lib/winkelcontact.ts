import { alsIk, rpc } from "../api";
export type WinkelContact = { chat: boolean; email: string; telefoon: string; whatsapp: string; website: string; betaalwijzen: string[] };
export const CONTACT_BETALINGEN = { contant: "Contant bij ophalen", overmaken: "Overmaken na overleg", tikkie: "Betaalverzoek na overleg" };
export const standaardContact = (): WinkelContact => ({ chat: true, email: "", telefoon: "", whatsapp: "", website: "", betaalwijzen: [] });
export function controleerContact(v: WinkelContact): WinkelContact {
  const c = { ...v, email: v.email.trim(), telefoon: v.telefoon.trim(), whatsapp: v.whatsapp.replace(/[\s()-]/g, ""), website: v.website.trim() };
  if (c.email && !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(c.email)) throw new Error("Controleer het contactmailadres.");
  if ([c.telefoon,c.whatsapp].some(t => t && !/^\+?[0-9 ()-]{6,25}$/.test(t))) throw new Error("Controleer het telefoonnummer, inclusief landcode voor WhatsApp.");
  if (c.whatsapp && !/^\+?[1-9]\d{6,14}$/.test(c.whatsapp)) throw new Error("Gebruik voor WhatsApp een landcode, bijvoorbeeld +31612345678.");
  if (c.website) { let u: URL; try { u = new URL(c.website); } catch { throw new Error("Gebruik een volledig https-adres voor je website."); }
    if (u.protocol !== "https:" || u.username || u.password) throw new Error("Gebruik een veilig https-adres zonder inloggegevens."); }
  if (c.email.length > 254 || c.website.length > 300 || !c.betaalwijzen.every(b => b in CONTACT_BETALINGEN)) throw new Error("Controleer de contactgegevens en betaalafspraken.");
  if (c.betaalwijzen.length && !c.chat && !c.email && !c.telefoon && !c.whatsapp && !c.website) throw new Error("Kies een contactmethode voor andere betaalafspraken.");
  return { ...c, betaalwijzen: [...new Set(c.betaalwijzen)] };
}
export async function mijnContact() {
  const r = await alsIk<{ contact?: WinkelContact; fout?: string }>("mijn_winkel_contact");
  if (r.fout) throw new Error(r.fout);
  return { ...standaardContact(), ...r.contact };
}
export async function contactBewaren(v: WinkelContact) {
  const c = controleerContact(v);
  const r = await alsIk<{ ok?: boolean; fout?: string }>("winkel_contact_bewaren", { p_contact: c });
  if (!r.ok) throw new Error(r.fout ?? "Contactvoorkeuren zijn niet opgeslagen.");
}
export const contactBekijken = (adres: string) => rpc<{ contact?: WinkelContact; gebruiker?: string }>("winkel_contact_bekijken", { p_adres: adres });
