// Social agents 2030: wijsneus met taken, niet alleen concepten.
// Trends: agentic posting (MCP), approval-by-exception, retentie-loops, micro-community.
// Jij blijft baas: publiceren en gevoelige antwoorden alleen na akkoord (of expliciet laag-risico beleid).

export type BotKanaal = "instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "youtube";

export type BotRol =
  | "interactie" // comments/DM’s
  | "reclame" // platform zichtbaar
  | "feedback" // → KlantSignaal
  | "retentie"; // mensen terug de app in

/** Hoe ver de agent mag gaan zonder tik. */
export type Autonomie =
  | "alleen_voorstel" // alles wacht op akkoord
  | "laag_risico_auto" // FAQ/toon binnen beleid mag direct
  | "batch"; // jij keurt een dag-stapel in één keer

export type Risico = "laag" | "middel" | "hoog";

export type BotVoorstel = {
  id: string;
  kanaal: BotKanaal;
  rol: BotRol;
  titel: string;
  inhoud: string;
  bronVraag?: string;
  wanneer?: string;
  bijlagen?: { soort: string; label: string }[];
  status: "voorstel" | "goedgekeurd" | "afgewezen" | "geplaatst" | "mislukt";
  gemaakt: string;
  risico?: Risico;
  /** Waarom dit voorstel: engagement, app-in, signaal, … */
  doel?: string;
};

export type KlantSignaal = {
  id: string;
  bron: BotKanaal | "assistent" | "community";
  tekst: string;
  aantal?: number;
  gemaakt: string;
  status: "nieuw" | "gezien" | "in_planning" | "afgerond";
  /** Clustering voor productupdates. */
  thema?: string;
};

export type BotBeleid = {
  kanaal: BotKanaal;
  rollen: BotRol[];
  voorstellen: boolean;
  /** Altijd true in type: gevoelig/hoog blijft menselijk. */
  publicerenNaAkkoord: true;
  feedbackVerzamelen: boolean;
  autonomie: Autonomie;
  toegestaan?: string[];
  gevoelig?: string[];
};

/** Dagelijkse werkstapel: wat jij in 2 minuten afhandelt. */
export type BotDigest = {
  datum: string;
  wachtend: BotVoorstel[];
  signalen: KlantSignaal[];
  retentieTips: string[];
  samenvatting: string;
};

export const standaardBeleid = (kanaal: BotKanaal): BotBeleid => ({
  kanaal,
  rollen: ["interactie", "reclame", "feedback", "retentie"],
  voorstellen: true,
  publicerenNaAkkoord: true,
  feedbackVerzamelen: true,
  autonomie: "batch",
  toegestaan: ["platform", "assistent", "privacy", "hoe het werkt", "gratis kern", "community"],
  gevoelig: ["prijzen", "kortingen", "medische claims", "persoonsgegevens", "concurrenten belasteren"],
});

export const wachtOpAkkoord = (lijst: BotVoorstel[]) =>
  lijst.filter((v) => v.status === "voorstel");

export const nieuweSignalen = (lijst: KlantSignaal[]) =>
  lijst.filter((s) => s.status === "nieuw");

/** Batch: keur alle laag-risico voorstellen in één beweging (UI roept dit aan na jouw tik). */
export function keurLaagRisicoGoed(lijst: BotVoorstel[]): BotVoorstel[] {
  return lijst.map((v) =>
    v.status === "voorstel" && (v.risico ?? "middel") === "laag"
      ? { ...v, status: "goedgekeurd" as const }
      : v,
  );
}

export function keurSelectie(
  lijst: BotVoorstel[],
  ids: string[],
  status: "goedgekeurd" | "afgewezen",
): BotVoorstel[] {
  const set = new Set(ids);
  return lijst.map((v) => (set.has(v.id) && v.status === "voorstel" ? { ...v, status } : v));
}

/** Schat risico voor de wachtrij (heuristiek, geen modelclaim). */
export function schatRisico(v: Pick<BotVoorstel, "rol" | "inhoud" | "bronVraag">): Risico {
  const t = `${v.inhoud} ${v.bronVraag ?? ""}`.toLocaleLowerCase("nl");
  if (/klacht|jurid|avg|gdpr|aangifte|bedrog|scam|refund|terugbet/.test(t)) return "hoog";
  if (v.rol === "reclame" || /prijs|korting|%|gratis proef/.test(t)) return "middel";
  return "laag";
}

/** Bouw een dag-digest zodat jij niet hoeft te zoeken. */
export function bouwDigest(
  voorstellen: BotVoorstel[],
  signalen: KlantSignaal[],
  nu = new Date(),
): BotDigest {
  const wachtend = wachtOpAkkoord(voorstellen).map((v) => ({
    ...v,
    risico: v.risico ?? schatRisico(v),
  }));
  const nieuw = nieuweSignalen(signalen);
  const laag = wachtend.filter((v) => v.risico === "laag").length;
  const retentieTips = [
    "Deel één community-win in de feed (kort, menselijk).",
    "Beantwoord open DMs met app-pad: Assistent → zeg wat je wilt.",
    "Zet een KlantSignaal om in één productregel in planning.",
  ];
  if (nieuw.length)
    retentieTips.unshift(`Er liggen ${nieuw.length} nieuwe signalen — product dichter bij de klant.`);
  const samenvatting =
    wachtend.length === 0 && nieuw.length === 0
      ? "Stilte op de lijn. Agents wachten op conversatie — jij hoeft niets te doen."
      : `${wachtend.length} voorstellen (${laag} laag risico), ${nieuw.length} signalen. Batch-goedkeuren scheelt tikken.`;
  return {
    datum: nu.toISOString().slice(0, 10),
    wachtend,
    signalen: nieuw,
    retentieTips,
    samenvatting,
  };
}

/**
 * Agent-doelen 2026–2031: niet alleen posten, maar platform levend houden.
 * - Interactie triaget comments
 * - Reclame brengt mensen de app in (niet hard sell)
 * - Feedback voedt KlantSignaal → updates
 * - Retentie activeert slapende gebruikers via social + in-app
 */
export const AGENT_DOELEN = {
  interactie: "Reageer scherp en kort; escalate gevoelig naar mens.",
  reclame: "Maak nieuwsgierig naar de app; geen valse beloftes.",
  feedback: "Vang wensen en frustraties als KlantSignaal, geclusterd.",
  retentie: "Nodig uit tot één concrete actie in de app binnen 24u.",
} as const;

export const BOT_STEM = {
  karakter: ["wijsneus", "eerlijk", "kort", "speels", "uitnodigend"] as const,
  wel: [
    "Reageer in hun register — dan een tik scherper.",
    "Zelfspot over de assistent mag; nooit over iemands lichaam, afkomst of leed.",
    "Verwachtingen: gratis kern, jij geeft akkoord, geen stiekeme auto-publicatie.",
    "Eindig met een app-pad (Assistent → …), geen ‘stuur een mail’.",
    "Threads: korte comebacks. TikTok/Reels: POV. X: één rake zin.",
  ],
  niet: [
    "Geen corporate ‘Bedankt voor uw bericht’.",
    "Geen publieke vernedering.",
    "Geen beloftes over prijzen of features die niet kloppen.",
    "Geen publiceren zonder akkoord (tenzij jij laag-risico auto aanzet én risico=laag).",
    "Geen hard sell.",
  ],
  voorbeelden: {
    klacht_te_ingewikkeld:
      "Klopt, instellingen kunnen een doolhof zijn. In de app: Assistent → zeg wat je wilt. Wij vragen eerst ja.",
    vraag_is_het_gratis:
      "De kern is gratis. Geld alleen als jij iets koopt of extra’s wilt — geen verrassingsabonnement.",
    compliment: "Zie je wel dat die paperclip ergens goed voor is. Kom gerust vaker lastigvallen in de app.",
    meme_chaos: "POV: drie apps voor één afspraak. Of Assistent. Keuze is aan jou.",
    retentie_stil:
      "We misten je in de feed. Één tik in de app en je bent weer bij — of negeer dit stoer.",
  },
} as const;

export const BOT_DOEL =
  "Social agents: interactie, zichtbaarheid, app-in, feedback-lus — jij geeft akkoord, wij doen de rest.";

export function stemPrompt(): string {
  return [
    "Je bent de social-wijsneus van Assistent: scherp als Ryanair, speels als Bol.com.",
    "Kort, eerlijk, eventueel één woordgrap. Geen corporate webcare.",
    "Nooit kwetsend over personen. Stuur naar de app voor echte hulp.",
    "Publiceren/DM pas na akkoord van de beheerder, tenzij beleid laag-risico auto toelaat.",
    `Doelen: ${Object.values(AGENT_DOELEN).join(" / ")}`,
    `Missie: ${BOT_DOEL}`,
  ].join(" ");
}

/** Demo-voorstellen zodat de UI meteen bruikbaar voelt (lokaal, geen netwerk). */
export function demoVoorstellen(nu = new Date()): BotVoorstel[] {
  const iso = nu.toISOString();
  return [
    {
      id: "demo-1",
      kanaal: "instagram",
      rol: "interactie",
      titel: "Reactie op ‘werkt dit echt gratis?’",
      inhoud: BOT_STEM.voorbeelden.vraag_is_het_gratis,
      bronVraag: "Is dit weer zo’n app die na een week betaald is?",
      status: "voorstel",
      gemaakt: iso,
      risico: "laag",
      doel: "Vertrouwen + app-uitleg",
    },
    {
      id: "demo-2",
      kanaal: "x",
      rol: "reclame",
      titel: "Korte X-post chaos vs assistent",
      inhoud: BOT_STEM.voorbeelden.meme_chaos,
      status: "voorstel",
      gemaakt: iso,
      risico: "laag",
      doel: "App-in vanuit social",
    },
    {
      id: "demo-3",
      kanaal: "linkedin",
      rol: "feedback",
      titel: "Signaal: te veel stappen bij bestellen",
      inhoud: "We horen dat checkout te lang voelt. Noteren we als KlantSignaal.",
      bronVraag: "Waarom 4 schermen om iets af te rekenen?",
      status: "voorstel",
      gemaakt: iso,
      risico: "middel",
      doel: "Productfeedback",
    },
  ];
}

export function demoSignalen(nu = new Date()): KlantSignaal[] {
  return [
    {
      id: "sig-1",
      bron: "instagram",
      tekst: "Checkout in minder stappen",
      aantal: 4,
      gemaakt: nu.toISOString(),
      status: "nieuw",
      thema: "bestellen",
    },
    {
      id: "sig-2",
      bron: "community",
      tekst: "Meer lokale evenementen in de buurtfeed",
      aantal: 2,
      gemaakt: nu.toISOString(),
      status: "nieuw",
      thema: "ontdekken",
    },
  ];
}
