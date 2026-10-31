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
