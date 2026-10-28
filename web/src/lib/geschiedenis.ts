// Eerdere gesprekken met de assistent. Alleen de tekst wordt bewaard, in je eigen beveiligde gegevens (niet op het
// apparaat). Bestanden, kaarten en knoppen blijven niet bewaard. Uit te zetten; dan wordt alles meteen gewist.
import type Anthropic from "@anthropic-ai/sdk";
import { bijwerken, type Gegevens } from "../api";

export type Regel = { wie: "jij" | "assistent"; tekst: string };
export type Opgeslagen = { id: string; titel: string; datum: string; beurten: Regel[] };

const SLEUTEL = "assistent_gesprekken";
const MAX_GESPREKKEN = 30;
const MAX_BEURTEN = 60;
const MAX_TEKST = 4000;

export const bewarenAan = (g: Gegevens) => g.instellingen?.gesprekken_bewaren !== false;

export function gesprekken(g: Gegevens): Opgeslagen[] {
  const lijst = g[SLEUTEL];
  return Array.isArray(lijst) ? (lijst as Opgeslagen[]).filter((x) => x && typeof x.id === "string" && Array.isArray(x.beurten)) : [];
}

export const nieuwId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Alleen tekst, ingekort, zonder foutmeldingen. */
export function schoon(beurten: { wie: "jij" | "assistent"; tekst: string; fout?: boolean }[]): Regel[] {
  return beurten.filter((b) => !b.fout && b.tekst.trim())
    .map((b) => ({ wie: b.wie, tekst: b.tekst.slice(0, MAX_TEKST) })).slice(-MAX_BEURTEN);
}

function titelVan(regels: Regel[]) {
  const eerste = regels.find((r) => r.wie === "jij")?.tekst.trim().replace(/\s+/g, " ") ?? "Gesprek";
  return eerste.length > 60 ? `${eerste.slice(0, 57)}…` : eerste;
}

/** Bewaart (of vervangt) één gesprek bovenaan de lijst. */
export async function bewaar(id: string, beurten: Regel[]): Promise<Gegevens | null> {
  if (!beurten.some((b) => b.wie === "assistent")) return null;
  return bijwerken((g) => {
    if (!bewarenAan(g)) return;
    const rest = gesprekken(g).filter((x) => x.id !== id);
    g[SLEUTEL] = [{ id, titel: titelVan(beurten), datum: new Date().toISOString(), beurten }, ...rest].slice(0, MAX_GESPREKKEN);
  });
}

export const wis = (id: string) => bijwerken((g) => { g[SLEUTEL] = gesprekken(g).filter((x) => x.id !== id); });

/** Zet bewaren aan of uit. Uitzetten wist meteen alle bewaarde gesprekken. */
export const bewarenZetten = (aan: boolean) => bijwerken((g) => {
  g.instellingen ??= {};
  g.instellingen.gesprekken_bewaren = aan;
  if (!aan) g[SLEUTEL] = [];
});

/** Maakt van de bewaarde tekst weer een geldig gesprek voor Claude: begint bij jou en wisselt steeds af. */
export function alsBerichten(regels: Regel[]): Anthropic.MessageParam[] {
  const uit: Anthropic.MessageParam[] = [];
  for (const r of regels) {
    const rol = r.wie === "jij" ? "user" : "assistant";
    if (!uit.length && rol === "assistant") continue;
    const vorig = uit[uit.length - 1];
    if (vorig?.role === rol) vorig.content = `${vorig.content as string}\n\n${r.tekst}`;
    else uit.push({ role: rol, content: r.tekst });
  }
  if (uit[uit.length - 1]?.role === "user") uit.pop();
  return uit;
}
