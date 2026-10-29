/** Lokale gegevensminimalisatie. Geen netwerk, opslag of nieuwe cryptografie. */
import { huidigeSessie } from "../api";
const pauzes = new WeakMap<object, Set<number>>();
export function aiGepauzeerd(gesprek: number) {
  const sessie = huidigeSessie();
  return !sessie || !!pauzes.get(sessie)?.has(gesprek);
}
export function pauzeerProjectAi(gesprek: number, aan: boolean) {
  const sessie = huidigeSessie(); if (!sessie) return;
  const keuzes = pauzes.get(sessie) ?? new Set<number>();
  if (aan) keuzes.add(gesprek); else keuzes.delete(gesprek);
  pauzes.set(sessie, keuzes);
}
export function controleerProjectAi(gesprek: number) {
  if (aiGepauzeerd(gesprek)) throw new Error("Project-AI is op dit apparaat gepauzeerd. Hervat bewust via Privacy.");
}
export function privacyVoorbeeld(tekst: string) {
  const sleutel=/-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----|\b(?:sk-ant-|sk-proj-|sk-svcacct-|sk_live_|sk_test_|sb_secret_|ghp_|gho_|ghs_|github_pat_)[A-Za-z0-9_-]{12,}|\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/;
  const bearer=/(?:authorization\s*:\s*bearer|(?:access|refresh)[_-]?token\s*[:=])\s*["']?[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/i;
  if (sleutel.test(tekst)||bearer.test(tekst))
    throw new Error("Mogelijke geheime sleutel gevonden. Verwijder die uit de geselecteerde bron voordat je AI gebruikt.");
  const vervangen = new Map<string, string>();
  const masker = (soort: string) => (waarde: string) => {
    const sleutel = `${soort}:${waarde}`;
    if (!vervangen.has(sleutel)) vervangen.set(sleutel, `[${soort} ${vervangen.size + 1}]`);
    return vervangen.get(sleutel)!;
  };
  const inhoud = tekst
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, masker("e-mailadres"))
    .replace(/\b(?:NL\d{2}(?:[ -]?[A-Z]){4}(?:[ -]?\d){10}|BE\d{2}(?:[ -]?\d){12}|DE\d{2}(?:[ -]?\d){18}|GB\d{2}(?:[ -]?[A-Z]){4}(?:[ -]?\d){14}|ES\d{2}(?:[ -]?\d){20})\b/gi, masker("rekeningnummer"))
    .replace(/(?<![\w\d])(?:\+31[ -]?(?:\(0\)[ -]?)?|0)6(?:[ -]?\d){8}(?!\d)/g, masker("telefoonnummer"));
  if (inhoud.length > 16_000) throw new Error("De afgeschermde context is te groot. Kies minder projecttekst.");
  return { inhoud, aantal: vervangen.size };
}
