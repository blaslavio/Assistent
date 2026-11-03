// Social- en winkelbots: de AI bereidt voor, jij geeft alleen akkoord.
// Niets gaat live zonder expliciete bevestiging — zelfde patroon als BetaalBevestiging.

export type BotKanaal = "instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "webshop" | "chat";

/** Wat de bot wil doen — nog niet uitgevoerd. */
export type BotVoorstel = {
  id: string;
  kanaal: BotKanaal;
  /** Korte titel voor in de lijst. */
  titel: string;
  /** Concepttekst of samenvatting die jij leest vóór akkoord. */
  inhoud: string;
  /** Gepland moment (ISO), of meteen na akkoord. */
  wanneer?: string;
  /** Bijv. product-id, post-media, link. */
  bijlagen?: { soort: string; label: string }[];
  status: "voorstel" | "goedgekeurd" | "afgewezen" | "geplaatst" | "mislukt";
  gemaakt: string;
};

/** Instellingen per bot: wat mag autonoom, wat nooit zonder jou. */
export type BotBeleid = {
  kanaal: BotKanaal;
  /** Mag concepten klaarzetten. */
  voorstellen: boolean;
  /** Mag nooit zelf publiceren — altijd akkoord. */
  publicerenNaAkkoord: true;
  /** Onderwerpen of merknamen die altijd mogen. */
  toegestaan?: string[];
  /** Nooit zonder extra check (prijzen, claims, kortingen). */
  gevoelig?: string[];
};

/** Standaard: AI mag voorstellen, publiceren alleen na jouw tik. */
export const standaardBeleid = (kanaal: BotKanaal): BotBeleid => ({
  kanaal,
  voorstellen: true,
  publicerenNaAkkoord: true,
});

/**
 * Filtert voorstellen die op akkoord wachten.
 * De UI toont deze als kaarten: lezen → Goedkeuren / Afwijzen.
 */
export const wachtOpAkkoord = (lijst: BotVoorstel[]) =>
  lijst.filter((v) => v.status === "voorstel");
