// De onderdelen van Chat en welke de gebruiker bovenin wil zien.
import { Ballon, Mensen, Projectmap, Tas, Telefoon } from "../iconen";

export type Deel = "chats" | "communitys" | "projecten" | "winkel" | "oproepen";
export const DELEN: [Deel, string, typeof Ballon][] = [["chats", "Chats", Ballon], ["communitys", "Community's", Mensen],
  ["projecten", "Projecten", Projectmap], ["winkel", "Winkel", Tas], ["oproepen", "Bellen", Telefoon]];
// Standaard een korte rij; Bellen zit ook altijd als knop rechtsboven bij Chats. De rest zet je aan in Instellingen › Weergave.
export const CHAT_STANDAARD: Deel[] = ["chats", "communitys", "winkel"];

/** Welke onderdelen in de rij bovenin Chat staan. Chats staat er altijd in, de volgorde is vast. */
export function chatDelenVan(gekozen: unknown): Deel[] {
  const lijst = Array.isArray(gekozen) ? gekozen.filter((d): d is Deel => DELEN.some(([k]) => k === d)) : CHAT_STANDAARD;
  return DELEN.map(([k]) => k).filter((k) => k === "chats" || lijst.includes(k));
}
