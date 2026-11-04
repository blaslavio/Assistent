// De evenementenpagina: openbare evenementen, betaalde ticketsoorten en je eigen tickets.
import { ticketRpc } from "./tickets";
import { alsIk } from "../api";
import type { EventType } from "./studio";

export type Ticketsoort = { id: number; titel: string; prijs: number; vrij: number | null };
export type EventKaart = {
  id: number; titel: string; start: string; einde: string; plaats: string; event_type: EventType; omschrijving: string;
  gratis: boolean; open: boolean; vrij: number; organisator: string | null; soorten: Ticketsoort[];
};
export type MijnTicket = { id: string; code: string; status: "geldig" | "binnen"; evenement: number; titel: string; start: string; einde: string; plaats: string; betaald: boolean };
export type EigenSoort = Ticketsoort & { aan: boolean; verkocht: number };

const geldig = (id: number) => { if (!Number.isSafeInteger(id) || id < 1) throw new Error("Kies een geldig evenement."); return id; };
const soort = (s: Ticketsoort): Ticketsoort => ({ ...s, prijs: Number(s.prijs) });

export async function eventsLijst(zoek = "") {
  const r = await ticketRpc<{ events: EventKaart[] }>("events_lijst", { p_zoek: zoek.trim().slice(0, 100) });
  if (!Array.isArray(r.events)) throw new Error("De evenementen zijn niet bevestigd.");
  return r.events.map((e) => ({ ...e, soorten: (e.soorten ?? []).map(soort) }));
}
export async function eventBekijken(id: number) {
  const r = await ticketRpc<{ event: EventKaart; beheer: boolean; mijn_tickets: number }>("event_bekijken", { p_event: geldig(id) });
  return { ...r, event: { ...r.event, soorten: (r.event.soorten ?? []).map(soort) } };
}
export async function mijnTickets() {
  const r = await ticketRpc<{ tickets: MijnTicket[] }>("mijn_event_tickets", {});
  return Array.isArray(r.tickets) ? r.tickets : [];
}
export async function eigenSoorten(id: number) {
  const r = await ticketRpc<{ winkel: boolean; kan_betalen: boolean; omschrijving: string | null; soorten: (EigenSoort)[] }>("event_ticketsoorten", { p_event: geldig(id) });
  return { ...r, soorten: (r.soorten ?? []).map((s) => ({ ...s, prijs: Number(s.prijs) })) };
}
export function soortControle(titel: string, prijs: number, aantal: number) {
  if (!titel.trim() || titel.trim().length > 80) return "Geef het ticket een korte naam, bijvoorbeeld Staanplaats.";
  if (!Number.isFinite(prijs) || prijs < 1 || prijs > 5000) return "Kies een prijs van 1 tot 5000 euro.";
  if (!Number.isInteger(aantal) || aantal < 1 || aantal > 100000) return "Kies een aantal van 1 tot 100000.";
  return "";
}
export async function soortBewaren(event: number, s: { id?: number; titel: string; prijs: number; aantal: number; aan: boolean }) {
  const fout = soortControle(s.titel, s.prijs, s.aantal);
  if (fout) throw new Error(fout);
  const r = await ticketRpc<{ ok?: boolean; id?: number }>("event_ticketsoort_bewaren", {
    p_event: geldig(event), p_id: s.id ?? null, p_titel: s.titel.trim(), p_prijs: Math.round(s.prijs * 100) / 100, p_aantal: s.aantal, p_aan: s.aan,
  });
  if (r.ok !== true) throw new Error("Opslaan is niet bevestigd. Haal de actuele stand op.");
  return r.id;
}
export async function omschrijvingBewaren(event: number, tekst: string) {
  if (tekst.length > 2000) throw new Error("Hooguit 2000 tekens.");
  const r = await ticketRpc<{ ok?: boolean }>("event_omschrijving_bewaren", { p_event: geldig(event), p_tekst: tekst });
  if (r.ok !== true) throw new Error("Opslaan is niet bevestigd.");
}
/** Zet een bestelling klaar in de webshop van de organisator. Betalen doe je daarna zelf bij Bestellingen. */
export async function ticketsKopen(soortId: number, aantal: number) {
  if (!Number.isSafeInteger(soortId) || soortId < 1) throw new Error("Kies een ticketsoort.");
  if (!Number.isInteger(aantal) || aantal < 1 || aantal > 20) throw new Error("Kies 1 tot 20 tickets.");
  const r = await alsIk<{ ok?: boolean; id?: number; bedrag?: number; fout?: string }>("webshop_bestellen", {
    p_aanbod: soortId, p_aantal: aantal, p_levering: "ophalen", p_bericht: "", p_code: "",
  });
  if (!r?.ok || !r.id) throw new Error(r?.fout || "Bestellen lukte niet.");
  return { id: r.id, bedrag: Number(r.bedrag ?? 0) };
}

// Evenementen tonen we in Nederlandse tijd, ook op een telefoon die op een andere tijdzone staat.
const TZ = "Europe/Amsterdam";
const dag = new Intl.DateTimeFormat("nl-NL", { weekday: "short", day: "numeric", month: "long", timeZone: TZ });
const uur = new Intl.DateTimeFormat("nl-NL", { hour: "2-digit", minute: "2-digit", timeZone: TZ });
const uurGetal = (d: Date) => Number(new Intl.DateTimeFormat("nl-NL", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(d));
/** "za 28 februari · 19:00 tot 23:30", of over meerdere dagen "loopt tot zo 1 maart 02:00". */
export function wanneer(start: string, einde: string) {
  const s = new Date(start), e = new Date(einde);
  const zelfdeDag = dag.format(s) === dag.format(e) || (e.getTime() - s.getTime() < 12 * 36e5 && uurGetal(e) < 6);
  return zelfdeDag
    ? `${dag.format(s)} · ${uur.format(s)} tot ${uur.format(e)}`
    : `${dag.format(s)} ${uur.format(s)} · loopt tot ${dag.format(e)} ${uur.format(e)}`;
}
export const vanafPrijs = (e: EventKaart) => (e.soorten.length ? Math.min(...e.soorten.map((s) => s.prijs)) : null);
