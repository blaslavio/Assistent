// De onderdelen van Chat: gesprekken, netwerk, handel en bellen.
import { Ballon, Mensen, Projectmap, Tas, Telefoon } from "../iconen";

export type Deel = "chats" | "communitys" | "projecten" | "winkel" | "oproepen";

/** Labels en iconen in vaste volgorde: netwerken en handelen zitten naast chats. */
export const DELEN: [Deel, string, typeof Ballon][] = [
  ["chats", "Chats", Ballon],
  ["communitys", "Netwerk", Mensen],
  ["winkel", "Handel", Tas],
  ["projecten", "Projecten", Projectmap],
  ["oproepen", "Bellen", Telefoon],
];

/** Standaard zichtbaar: chats, netwerk, handel. Bellen blijft via knop bereikbaar. */
export const CHAT_STANDAARD: Deel[] = ["chats", "communitys", "winkel", "oproepen"];

/** Welke onderdelen in de rij bovenin Chat staan. Chats staat er altijd in. */
export function chatDelenVan(gekozen: unknown): Deel[] {
  const lijst = Array.isArray(gekozen)
    ? gekozen.filter((d): d is Deel => DELEN.some(([k]) => k === d))
    : CHAT_STANDAARD;
  return DELEN.map(([k]) => k).filter((k) => k === "chats" || lijst.includes(k));
}
