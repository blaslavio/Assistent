/** Waarom → hoe: afhankelijkheden, uitvoerbare stappen, resultaatcriteria en blokkades. */
import type { Feit } from "./projectregie";
export type Stap = { id: string; titel: string; klaarAls: string; minuten: number; eigenaar?: number; alternatief: string; afhankelijkVan: string[] };
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const tekst = (s: unknown, max: number, leeg = false): s is string => typeof s === "string" && s.length <= max && (leeg || !!s.trim()) && !/[\p{Cs}\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/u.test(s);
export function valideerStappen(waarde: unknown): Stap[] {
  if (!Array.isArray(waarde) || !waarde.length || waarde.length > 12) throw new Error("Een aanpak heeft 1 tot 12 stappen.");
  const stappen: Stap[] = waarde.map(s => {
    if (!s || typeof s !== "object" || Object.keys(s).some(k => !["id","titel","klaarAls","minuten","eigenaar","alternatief","afhankelijkVan"].includes(k))
      || typeof s.id !== "string" || !ID.test(s.id) || !tekst(s.titel,160) || !tekst(s.klaarAls,300)
      || !Number.isSafeInteger(s.minuten) || s.minuten < 5 || s.minuten > 480 || !tekst(s.alternatief,300,true)
      || !Array.isArray(s.afhankelijkVan) || s.afhankelijkVan.some((id: unknown) => typeof id !== "string" || !ID.test(id))
      || (s.eigenaar !== undefined && (!Number.isSafeInteger(s.eigenaar) || s.eigenaar < 1))) throw new Error("Geef elke stap een titel, resultaatcriterium, geldige duur en afhankelijkheden.");
    return { ...s, afhankelijkVan: [...new Set(s.afhankelijkVan)] };
  });
  const ids = new Set(stappen.map(s => s.id));
  if (ids.size !== stappen.length || stappen.some(s => s.afhankelijkVan.some(id => !ids.has(id) || id === s.id))) throw new Error("Stapverwijzingen zijn ongeldig.");
  const klaar = new Set<string>();
  while (klaar.size < stappen.length) {
    const vrij = stappen.filter(s => !klaar.has(s.id) && s.afhankelijkVan.every(id => klaar.has(id)));
    if (!vrij.length) throw new Error("De stappen verwijzen in een cirkel naar elkaar.");
    vrij.forEach(s => klaar.add(s.id));
  }
  return stappen;
}
export function aanpakkenVoor(doel: string, feiten: Feit[]) { return feiten.filter(f => f.actie.soort === "aanpak" && f.actie.doel === doel); }
export function actueleAanpakken(doel: string, feiten: Feit[]) {
  const alle = aanpakkenVoor(doel, feiten);
  const vervangen = new Set(alle.map(f => f.actie.vervangt).filter(Boolean));
  return alle.filter(f => !vervangen.has(f.actie.sleutel));
}
export function planFamilie(plan: Feit, feiten: Feit[]) {
  const uit: Feit[] = [plan]; const gezien = new Set([plan.actie.sleutel]);
  while (uit.at(-1)?.actie.vervangt) {
    const ouder = feiten.find(f => f.actie.soort === "aanpak" && f.actie.sleutel === uit.at(-1)!.actie.vervangt);
    if (!ouder || gezien.has(ouder.actie.sleutel) || ouder.actie.doel !== plan.actie.doel) break;
    uit.push(ouder); gezien.add(ouder.actie.sleutel);
  }
  return uit;
}
export function zelfdeResultaat(a: Stap, b: Stap) { return a.id === b.id && a.titel === b.titel && a.klaarAls === b.klaarAls && a.eigenaar === b.eigenaar; }
export function stapFamilie(plan: Feit, stap: Stap, feiten: Feit[]) {
  const familie: Feit[] = [];
  for (const p of planFamilie(plan, feiten)) { if (!p.actie.stappen?.some(s => zelfdeResultaat(s, stap))) break; familie.push(p); }
  return familie;
}
export function stapStand(plan: Feit, stap: Stap, feiten: Feit[]) {
  const familie = stapFamilie(plan, stap, feiten);
  const ids = new Set(familie.map(p => p.actie.sleutel));
  return feiten.filter(f => f.actie.soort === "stapstatus" && ids.has(f.actie.doel ?? "") && f.actie.stap === stap.id
    && familie.some(p => p.actie.sleutel === f.actie.doel && (f.afzender === p.afzender || f.afzender === stap.eigenaar)))
    .sort((a,b) => b.bericht - a.bericht)[0];
}
export function volgendeStappen(plan: Feit, feiten: Feit[]) {
  return (plan.actie.stappen ?? []).map(stap => {
    const status = stapStand(plan, stap, feiten)?.actie.keuze ?? "te_doen";
    const wachtOp = stap.afhankelijkVan.filter(id => {
      const voor = plan.actie.stappen?.find(s => s.id === id);
      return !voor || stapStand(plan, voor, feiten)?.actie.keuze !== "klaar";
    });
    return { stap, status, wachtOp, uitvoerbaar: status !== "klaar" && status !== "vast" && !wachtOp.length };
  });
}
