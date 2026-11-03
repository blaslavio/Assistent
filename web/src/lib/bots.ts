// Socialmediabots: beheren kanalen, reageren, reclame voor het platform.
// Zij assisteren de assistent en verzamelen gebruikersvragen zodat updates dichter
// bij wensen van klanten blijven. Publiceren en antwoorden: alleen na jouw akkoord.

/** Alleen socialmedia-kanalen — geen webshop of interne chat. */
export type BotKanaal = "instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "youtube";

/** Wat de bot doet op dat kanaal. */
export type BotRol =
  | "interactie" // reageren op comments/DM’s, gesprek open houden
  | "reclame" // zichtbaarheid en uitleg over het platform
  | "feedback"; // vragen en wensen van gebruikers verzamelen

/** Concept dat de bot klaarzet — nog niet live. */
export type BotVoorstel = {
  id: string;
  kanaal: BotKanaal;
  rol: BotRol;
  /** Korte titel in de goedkeuringslijst. */
  titel: string;
  /** Tekst of samenvatting die jij leest vóór akkoord. */
  inhoud: string;
  /** Bij interactie: de oorspronkelijke vraag of comment van de gebruiker. */
  bronVraag?: string;
  /** Gepland moment (ISO), of meteen na akkoord. */
  wanneer?: string;
  bijlagen?: { soort: string; label: string }[];
  status: "voorstel" | "goedgekeurd" | "afgewezen" | "geplaatst" | "mislukt";
  gemaakt: string;
};

/**
 * Gesignaleerde gebruikersvraag of wens (uit social of assistent).
 * Geen automatische feature — input voor jullie productkeuzes.
 */
export type KlantSignaal = {
  id: string;
  /** Waar het vandaan komt. */
  bron: BotKanaal | "assistent";
  /** Samenvatting van de vraag of wens. */
  tekst: string;
  /** Optioneel: hoe vaak soortgelijke signalen binnenkwamen. */
  aantal?: number;
  gemaakt: string;
  /** Nog niet bekeken / meegenomen in planning. */
  status: "nieuw" | "gezien" | "in_planning" | "afgerond";
};

/** Beleid per kanaal: AI mag voorstellen, nooit zelf publiceren. */
export type BotBeleid = {
  kanaal: BotKanaal;
  rollen: BotRol[];
  /** Mag conceptposts en conceptantwoorden klaarzetten. */
  voorstellen: boolean;
  /** Publiceren of versturen alleen na expliciet akkoord. */
  publicerenNaAkkoord: true;
  /** Mag gebruikersvragen als KlantSignaal doorgeven aan het team. */
  feedbackVerzamelen: boolean;
  /** Toegestane thema’s (platform, assistent, privacy, …). */
  toegestaan?: string[];
  /** Altijd extra check (prijzen, claims, kortingen, persoonsgegevens). */
  gevoelig?: string[];
};

/** Standaard: interactie + reclame + feedback; publiceren alleen na akkoord. */
export const standaardBeleid = (kanaal: BotKanaal): BotBeleid => ({
  kanaal,
  rollen: ["interactie", "reclame", "feedback"],
  voorstellen: true,
  publicerenNaAkkoord: true,
  feedbackVerzamelen: true,
  toegestaan: ["platform", "assistent", "privacy", "hoe het werkt"],
  gevoelig: ["prijzen", "kortingen", "medische claims", "persoonsgegevens"],
});

/** Voorstellen die op jouw akkoord wachten. */
export const wachtOpAkkoord = (lijst: BotVoorstel[]) =>
  lijst.filter((v) => v.status === "voorstel");

/** Nieuwe klantsignalen voor product/updates. */
export const nieuweSignalen = (lijst: KlantSignaal[]) =>
  lijst.filter((s) => s.status === "nieuw");

/**
 * Hoe bots de assistent helpen (geen aparte “winkelbot”):
 * - Interactie op social → veelgestelde vragen kunnen als tip naar de assistent.
 * - Feedback → KlantSignaal, zodat jullie updates dichter bij de klant houden.
 * - Reclame → alleen uitleg over het platform, nooit zelfstandig aanbod verkopen.
 */
export const BOT_DOEL =
  "Social media beheren, het platform bekendmaken, de assistent ondersteunen " +
  "en gebruikersvragen verzamelen — jij geeft overal akkoord.";
