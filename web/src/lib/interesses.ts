// Waar iemand de app vooral voor gebruikt. Alles blijft altijd beschikbaar; dit bepaalt alleen wat je als eerste ziet.
export type Interesse = "dag" | "geld" | "verkopen" | "community" | "werk" | "leren";
export const INTERESSES: { id: Interesse; naam: string; uitleg: string }[] = [
  { id: "dag", naam: "Mijn dag", uitleg: "Agenda en taken" },
  { id: "geld", naam: "Geld", uitleg: "Budget en rekeningen" },
  { id: "verkopen", naam: "Verkopen", uitleg: "Winkel en bestellingen" },
  { id: "community", naam: "Community of club", uitleg: "Leden en groepen" },
  { id: "werk", naam: "Werk en projecten", uitleg: "Samenwerken en klanten" },
  { id: "leren", naam: "Leren", uitleg: "Oefenen en studeren" },
];
const GELDIG = new Set<string>(INTERESSES.map((i) => i.id));

export function leesInteresses(inst: unknown): Interesse[] {
  const lijst = (inst as { interesses?: unknown } | undefined)?.interesses;
  return Array.isArray(lijst) ? (lijst.filter((x) => typeof x === "string" && GELDIG.has(x)) as Interesse[]) : [];
}
