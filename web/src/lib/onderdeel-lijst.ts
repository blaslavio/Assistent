// De namen en iconen van de onderdelen, los van de schermen zelf, zodat een menu ze kan tonen zonder alles te laden.
import { Bestand, Bewerk, Boek, Grafiek, Hart, Hartslag, Huis, Lijstje, Tas, Winkelpand } from "../iconen";

export type OnderdeelNaam = "studio" | "boodschappen" | "kooplijst" | "wenslijst" | "notities" | "documenten" | "budget" | "beleggen" | "leren" | "sport" | "zakelijk" | "huishouden";

export const ONDERDELEN: [OnderdeelNaam, string, typeof Tas][] = [
  ["huishouden", "Huishouden", Huis],
  ["boodschappen", "Boodschappen", Tas],
  ["kooplijst", "Kooplijst", Lijstje],
  ["wenslijst", "Wenslijst", Hart],
  ["notities", "Notities", Bewerk],
  ["documenten", "Documenten", Bestand],
  ["budget", "Budget", Lijstje],
  ["beleggen", "Beleggen", Grafiek],
  ["leren", "Leren", Boek],
  ["sport", "Sport en gezondheid", Hartslag],
  ["studio", "Studio · Winkel en evenementen", Winkelpand],
  ["zakelijk", "Zakelijk", Winkelpand],
];

/** Eén korte regel per onderdeel: wat je er doet. Ook gebruikt bij zoeken. */
export const UITLEG: Record<OnderdeelNaam, string> = {
  notities: "Snel iets vastleggen",
  documenten: "Lezen, schrijven en bewaren",
  huishouden: "Samen thuis organiseren",
  leren: "Oefenen en ontwikkelen",
  boodschappen: "Wat je nog wilt halen",
  kooplijst: "Je aankopen voorbereiden",
  wenslijst: "Je ideeën bewaren",
  budget: "Je inkomsten en uitgaven",
  beleggen: "Je portefeuille en volglijst",
  sport: "Bewegen en je gezondheid",
  zakelijk: "Klanten, rooster en administratie",
  studio: "Winkel, evenementen en tickets",
};

/** Onderdelen waarvan naam of uitleg bij de zoekterm past. */
export function onderdelenZoeken(q: string) {
  const term = q.trim().toLocaleLowerCase("nl");
  if (!term) return [];
  return ONDERDELEN.filter(([id, naam]) => `${naam} ${UITLEG[id]}`.toLocaleLowerCase("nl").includes(term));
}
