/** Universal People's OS: read-only composition across existing models.
 * Never creates duplicate tasks, grants access or persists state.
 * Mutations remain in the dedicated, authenticated task/project pipelines.
 */
import type { Taak } from "../api";
import type { Feit } from "./projectregie";
import { isAfgerond } from "./projectregie";
import { actueleAanpakken, volgendeStappen } from "./projectplan";
import { checklistOverzicht } from "./projectchecklist";

export type MasterContext = Readonly<{ actor: number; taakEigenaar: number; projectleden: readonly number[] }>;
export type MasterItem = Readonly<{
  sleutel: string; soort: "taak" | "projectstap"; titel: string; waarom: string;
  voortgang: "te_doen" | "bezig" | "vast" | "klaar";
  verantwoordelijke?: number; deadline?: string; projectDoel?: string;
}>;
const geldig = (id: number) => Number.isSafeInteger(id) && id > 0;

/** Projectgegevens worden uitsluitend getoond wanneer de caller al projecttoegang heeft.
 * Deze check vervangt nooit de server-side toegang tot de bronberichten. */
export function masterOverzicht(taken: readonly Taak[], feiten: readonly Feit[], context: MasterContext): MasterItem[] {
  if (!geldig(context.actor)) throw new Error("Ongeldige actor.");
  const items: MasterItem[] = [];
  if (context.actor === context.taakEigenaar) {
    for (const taak of taken) {
      if (!geldig(taak.id)) continue;
      items.push({sleutel:`taak:${taak.id}`,soort:"taak",titel:taak.titel,waarom:"Persoonlijke taak",
        voortgang:taak.klaar?"klaar":"te_doen",verantwoordelijke:context.actor,
        ...(taak.deadline?{deadline:taak.deadline}:{})});
    }
  }
  if (!context.projectleden.includes(context.actor)) return items;
  const doelen = feiten.filter(f=>["actie","besluit","vraag"].includes(f.actie.soort) && !isAfgerond(f,[...feiten]));
  for (const doel of doelen) {
    const plannen=actueleAanpakken(doel.actie.sleutel,[...feiten]);
    // Multiple concurrent plans must be resolved explicitly, never silently combined.
    if (plannen.length!==1) continue;
    const plan=plannen[0];
    for (const {stap,status} of volgendeStappen(plan,[...feiten])) {
      items.push({sleutel:`project:${plan.actie.sleutel}:${stap.id}`,soort:"projectstap",titel:stap.titel,
        waarom:doel.actie.tekst,voortgang:status,verantwoordelijke:stap.eigenaar,
        projectDoel:doel.actie.sleutel,
        ...(plan.actie.uiterlijk?{deadline:plan.actie.uiterlijk}:{})});
    }
  }
  return items;
}
/** One canonical representation of checklist progress and approval state. */
export function masterChecklist(plan: Feit, feiten: Feit[], context: MasterContext) {
  if (!geldig(context.actor) || !context.projectleden.includes(context.actor)) throw new Error("Geen toegang tot dit project.");
  return checklistOverzicht(plan, feiten, [...context.projectleden]);
}
