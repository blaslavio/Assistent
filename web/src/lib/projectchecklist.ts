/** Een checklist is een projectaanpak, geen tweede opslagmodel.
 * Alle acties blijven als projectactie in de bestaande versleutelde projectchat bewaard. */
import { actueleAanpakken, volgendeStappen } from "./projectplan";
import { nieuwFeit, type Feit, type ProjectActie } from "./projectregie";
import { stapStatusVoorstel } from "./projectwerk";

export const AKKOORD = "Checklist goedgekeurd";
export const AFWIJZEN = "Checklist afgewezen";

export function checklistGoedkeuring(plan: Feit, feiten: Feit[], deelnemers: number[]) {
  const leden = [...new Set(deelnemers)].filter(id => Number.isSafeInteger(id) && id > 0);
  const stemmen = new Map<number, boolean>();
  for (const f of [...feiten].sort((a,b) => a.bericht - b.bericht)) {
    if (f.actie.soort !== "besluit" || f.actie.doel !== plan.actie.sleutel || f.bericht <= plan.bericht || !leden.includes(f.afzender)) continue;
    if (f.actie.tekst === AKKOORD) stemmen.set(f.afzender, true);
    if (f.actie.tekst === AFWIJZEN) stemmen.set(f.afzender, false);
  }
  const afgewezen = leden.some(id => stemmen.get(id) === false);
  const wachtOp = leden.filter(id => !stemmen.has(id));
  return { totaal: leden.length, akkoord: leden.filter(id => stemmen.get(id) === true).length,
    wachtOp, afgewezen, goedgekeurd: leden.length > 0 && !afgewezen && wachtOp.length === 0 };
}
export function checklistStem(plan: Feit, feiten: Feit[], ik: number, deelnemers: number[], akkoord: boolean): ProjectActie {
  if (!deelnemers.includes(ik) || !Number.isSafeInteger(ik) || ik < 1) throw new Error("Alleen een actief projectlid kan stemmen.");
  if (plan.actie.soort !== "aanpak" || !actueleAanpakken(plan.actie.doel ?? "", feiten).some(f => f.actie.sleutel === plan.actie.sleutel))
    throw new Error("Stem uitsluitend op een actuele aanpak.");
  return nieuwFeit("besluit", akkoord ? AKKOORD : AFWIJZEN, {soort:"eigen"}, {doel:plan.actie.sleutel});
}
export function checklistOverzicht(plan: Feit, feiten: Feit[], leden: number[]) {
  const status = checklistGoedkeuring(plan, feiten, leden);
  const stappen = volgendeStappen(plan, feiten);
  const klaar = stappen.filter(s => s.status === "klaar").length;
  return { ...status, stappen, klaar, voortgang: stappen.length ? Math.round(klaar / stappen.length * 100) : 0 };
}
export function checklistStap(plan: Feit, stapId: string, feiten: Feit[], ik: number, leden: number[],
  status: "te_doen"|"bezig"|"vast"|"klaar", uitleg = "") {
  if (!checklistGoedkeuring(plan, feiten, leden).goedgekeurd) throw new Error("Eerst moet ieder actief projectlid de checklist goedkeuren.");
  return stapStatusVoorstel(plan, stapId, feiten, ik, status, uitleg);
}
