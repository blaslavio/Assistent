// Social agents op alle kanalen. Publiceren/DM: alleen na jouw akkoord
// (of laag-risico als jij autonomie zo zet). OAuth-koppeling vereist jouw login per netwerk.

export type BotKanaal = "instagram" | "facebook" | "tiktok" | "x" | "linkedin" | "youtube";

export type BotRol = "interactie" | "reclame" | "feedback" | "retentie";

export type Autonomie = "alleen_voorstel" | "laag_risico_auto" | "batch";

export type Risico = "laag" | "middel" | "hoog";

/** Koppelstatus: tokens komen van jou (OAuth); wij bewaren alleen wat mag. */
export type KanaalStatus = "uit" | "wacht_op_koppeling" | "actief" | "fout";

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
  doel?: string;
};

export type KlantSignaal = {
  id: string;
  bron: BotKanaal | "assistent" | "community";
  tekst: string;
  aantal?: number;
  gemaakt: string;
  status: "nieuw" | "gezien" | "in_planning" | "afgerond";
  thema?: string;
};

export type BotBeleid = {
  kanaal: BotKanaal;
  aan: boolean;
  status: KanaalStatus;
  rollen: BotRol[];
  voorstellen: boolean;
  publicerenNaAkkoord: true;
  feedbackVerzamelen: boolean;
  autonomie: Autonomie;
  toegestaan?: string[];
  gevoelig?: string[];
};

export type BotDigest = {
  datum: string;
  wachtend: BotVoorstel[];
  signalen: KlantSignaal[];
  retentieTips: string[];
  samenvatting: string;
  perKanaal: Record<BotKanaal, { wachtend: number; actief: boolean }>;
};

/** Alle kanalen waarop de agent mag werken. */
export const ALLE_KANALEN: {
  id: BotKanaal;
  naam: string;
  maxTekens: number;
  stijl: string;
}[] = [
  { id: "instagram", naam: "Instagram", maxTekens: 2200, stijl: "visueel, warm, korte alinea’s" },
  { id: "facebook", naam: "Facebook", maxTekens: 5000, stijl: "toegankelijk, community" },
  { id: "tiktok", naam: "TikTok", maxTekens: 2200, stijl: "POV, snel, trendy" },
  { id: "x", naam: "X", maxTekens: 280, stijl: "één rake zin" },
  { id: "linkedin", naam: "LinkedIn", maxTekens: 3000, stijl: "zakelijk scherp, geen corporate-saus" },
  { id: "youtube", naam: "YouTube", maxTekens: 5000, stijl: "community-tab / short beschrijving" },
];

export const kanaalMeta = (id: BotKanaal) =>
  ALLE_KANALEN.find((k) => k.id === id) ?? ALLE_KANALEN[0];

export const standaardBeleid = (kanaal: BotKanaal): BotBeleid => ({
  kanaal,
  aan: true,
  status: "wacht_op_koppeling",
  rollen: ["interactie", "reclame", "feedback", "retentie"],
  voorstellen: true,
  publicerenNaAkkoord: true,
  feedbackVerzamelen: true,
  autonomie: "batch",
  toegestaan: ["platform", "assistent", "privacy", "hoe het werkt", "gratis kern", "community"],
  gevoelig: ["prijzen", "kortingen", "medische claims", "persoonsgegevens", "concurrenten belasteren"],
});

export function standaardBeleidAlles(): BotBeleid[] {
  return ALLE_KANALEN.map((k) => standaardBeleid(k.id));
}

export const wachtOpAkkoord = (lijst: BotVoorstel[]) =>
  lijst.filter((v) => v.status === "voorstel");

export const nieuweSignalen = (lijst: KlantSignaal[]) =>
  lijst.filter((s) => s.status === "nieuw");

export function filterKanaal(lijst: BotVoorstel[], kanaal: BotKanaal | "alle") {
  return kanaal === "alle" ? lijst : lijst.filter((v) => v.kanaal === kanaal);
}

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

/** Na akkoord: markeer als geplaatst (echte API volgt koppeling + backend). */
export function markeerGeplaatst(lijst: BotVoorstel[], ids: string[]): BotVoorstel[] {
  const set = new Set(ids);
  return lijst.map((v) =>
    set.has(v.id) && v.status === "goedgekeurd" ? { ...v, status: "geplaatst" as const } : v,
  );
}

export function schatRisico(v: Pick<BotVoorstel, "rol" | "inhoud" | "bronVraag">): Risico {
  const t = `${v.inhoud} ${v.bronVraag ?? ""}`.toLocaleLowerCase("nl");
  if (/klacht|jurid|avg|gdpr|aangifte|bedrog|scam|refund|terugbet/.test(t)) return "hoog";
  if (v.rol === "reclame" || /prijs|korting|%|gratis proef/.test(t)) return "middel";
  return "laag";
}

/** Pas tekst aan op kanaallimiet en stijl. */
export function pasAanOpKanaal(tekst: string, kanaal: BotKanaal): string {
  const max = kanaalMeta(kanaal).maxTekens;
  let t = tekst.trim();
  if (kanaal === "x" && t.length > 280) {
    t = t.slice(0, 277).replace(/\s+\S*$/, "") + "…";
  } else if (t.length > max) {
    t = t.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
  }
  return t;
}

export function bouwDigest(
  voorstellen: BotVoorstel[],
  signalen: KlantSignaal[],
  beleid: BotBeleid[] = standaardBeleidAlles(),
  nu = new Date(),
): BotDigest {
  const wachtend = wachtOpAkkoord(voorstellen).map((v) => ({
    ...v,
    risico: v.risico ?? schatRisico(v),
  }));
  const nieuw = nieuweSignalen(signalen);
  const laag = wachtend.filter((v) => v.risico === "laag").length;
  const perKanaal = {} as BotDigest["perKanaal"];
  for (const k of ALLE_KANALEN) {
    const b = beleid.find((x) => x.kanaal === k.id) ?? standaardBeleid(k.id);
    perKanaal[k.id] = {
      wachtend: wachtend.filter((v) => v.kanaal === k.id).length,
      actief: b.aan && b.status === "actief",
    };
  }
  const retentieTips = [
    "Zet minstens één kanaal op actief (koppeling) zodat de wachtrij kan leeglopen.",
    "Deel één community-win in de feed.",
    "Zet een KlantSignaal om in productplanning.",
  ];
  if (nieuw.length)
    retentieTips.unshift(`Er liggen ${nieuw.length} nieuwe signalen over kanalen heen.`);
  const kanalenMetWerk = ALLE_KANALEN.filter((k) => perKanaal[k.id].wachtend > 0)
    .map((k) => k.naam)
    .join(", ");
  const samenvatting =
    wachtend.length === 0 && nieuw.length === 0
      ? "Stil op alle kanalen. Agents staan klaar zodra er conversatie is."
      : `${wachtend.length} voorstellen (${laag} laag risico)${kanalenMetWerk ? ` op ${kanalenMetWerk}` : ""}, ${nieuw.length} signalen.`;
  return {
    datum: nu.toISOString().slice(0, 10),
    wachtend,
    signalen: nieuw,
    retentieTips,
    samenvatting,
    perKanaal,
  };
}

export const AGENT_DOELEN = {
  interactie: "Reageer scherp en kort; escalate gevoelig naar mens.",
  reclame: "Maak nieuwsgierig naar de app; geen valse beloftes.",
  feedback: "Vang wensen als KlantSignaal, geclusterd per thema.",
  retentie: "Nodig uit tot één concrete actie in de app.",
} as const;

export const BOT_STEM = {
  karakter: ["wijsneus", "eerlijk", "kort", "speels", "uitnodigend"] as const,
  wel: [
    "Reageer in hun register — dan een tik scherper.",
    "Zelfspot over de assistent mag; nooit over lichaam, afkomst of leed.",
    "Verwachtingen: gratis kern, jij geeft akkoord.",
    "Eindig met app-pad (Assistent → …).",
    "Per kanaal: X kort, TikTok POV, LinkedIn zakelijk scherp, IG/FB warm.",
  ],
  niet: [
    "Geen corporate webcare-taal.",
    "Geen publieke vernedering.",
    "Geen valse beloftes.",
    "Geen publiceren zonder akkoord (tenzij laag-risico auto én risico=laag).",
    "Geen hard sell.",
  ],
  voorbeelden: {
    klacht_te_ingewikkeld:
      "Klopt, instellingen kunnen een doolhof zijn. In de app: Assistent → zeg wat je wilt. Wij vragen eerst ja.",
    vraag_is_het_gratis:
      "De kern is gratis. Geld alleen als jij iets koopt of extra’s wilt — geen verrassingsabonnement.",
    compliment: "Dankjewel! Kom gerust vaker langs in de app.",
    meme_chaos: "POV: drie apps voor één afspraak. Of Assistent. Keuze is aan jou.",
    retentie_stil:
      "We misten je. Één tik in de app en je bent bij — of negeer dit stoer.",
  },
} as const;

export const BOT_DOEL =
  "Social agents op Instagram, Facebook, TikTok, X, LinkedIn en YouTube: interactie, zichtbaarheid, app-in, feedback — jij geeft akkoord.";

export function stemPrompt(kanaal?: BotKanaal): string {
  const meta = kanaal ? kanaalMeta(kanaal) : null;
  return [
    "Je bent de social-wijsneus van Assistent: scherp als Ryanair, speels als Bol.com.",
    "Kort, eerlijk, eventueel één woordgrap. Geen corporate webcare.",
    meta ? `Kanaal: ${meta.naam}. Stijl: ${meta.stijl}. Max ~${meta.maxTekens} tekens.` : "Alle kanalen.",
    "Nooit kwetsend over personen. Stuur naar de app.",
    "Publiceren/DM pas na akkoord, tenzij beleid laag-risico auto toelaat.",
    `Missie: ${BOT_DOEL}`,
  ].join(" ");
}

/** Demo-voorstellen over alle kanalen. */
export function demoVoorstellen(nu = new Date()): BotVoorstel[] {
  const iso = nu.toISOString();
  const basis: Omit<BotVoorstel, "id" | "kanaal" | "inhoud">[] = [
    {
      rol: "interactie",
      titel: "Reactie: is het gratis?",
      bronVraag: "Is dit weer zo’n app die na een week betaald is?",
      status: "voorstel",
      gemaakt: iso,
      risico: "laag",
      doel: "Vertrouwen",
    },
    {
      rol: "reclame",
      titel: "Chaos vs assistent",
      status: "voorstel",
      gemaakt: iso,
      risico: "laag",
      doel: "App-in",
    },
    {
      rol: "feedback",
      titel: "Signaal checkout",
      bronVraag: "Waarom zo veel stappen om af te rekenen?",
      status: "voorstel",
      gemaakt: iso,
      risico: "middel",
      doel: "Productfeedback",
    },
    {
      rol: "retentie",
      titel: "Terug in de app",
      status: "voorstel",
      gemaakt: iso,
      risico: "laag",
      doel: "Retentie",
    },
  ];
  const teksten = [
    BOT_STEM.voorbeelden.vraag_is_het_gratis,
    BOT_STEM.voorbeelden.meme_chaos,
    "We horen dat checkout te lang voelt. Noteren we — updates volgen in de app.",
    BOT_STEM.voorbeelden.retentie_stil,
  ];
  const out: BotVoorstel[] = [];
  let n = 0;
  for (const k of ALLE_KANALEN) {
    const i = n % basis.length;
    const b = basis[i];
    out.push({
      ...b,
      id: `demo-${k.id}-${i}`,
      kanaal: k.id,
      inhoud: pasAanOpKanaal(teksten[i], k.id),
      titel: `${b.titel} · ${k.naam}`,
    });
    n++;
  }
  // Extra X + IG interactie
  out.push({
    id: "demo-x-extra",
    kanaal: "x",
    rol: "interactie",
    titel: "X: compliment",
    inhoud: pasAanOpKanaal(BOT_STEM.voorbeelden.compliment, "x"),
    status: "voorstel",
    gemaakt: iso,
    risico: "laag",
    doel: "Relatie",
  });
  return out;
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
      bron: "tiktok",
      tekst: "Meer lokale evenementen",
      aantal: 2,
      gemaakt: nu.toISOString(),
      status: "nieuw",
      thema: "ontdekken",
    },
    {
      id: "sig-3",
      bron: "linkedin",
      tekst: "Team-accounts voor Studio",
      aantal: 3,
      gemaakt: nu.toISOString(),
      status: "nieuw",
      thema: "studio",
    },
  ];
}

/** Waar je een goedgekeurd bericht zelf plaatst. Waar het netwerk het toestaat staat de tekst al klaar;
 *  anders kopieer je hem eerst. Zo plaatst de app nooit iets zonder dat jij zelf op Plaatsen tikt. */
export function plaatsLink(kanaal: BotKanaal, tekst: string): { url: string; tekstMee: boolean } {
  const t = encodeURIComponent(tekst);
  switch (kanaal) {
    case "x": return { url: `https://x.com/intent/post?text=${t}`, tekstMee: true };
    case "linkedin": return { url: `https://www.linkedin.com/feed/?shareActive=true&text=${t}`, tekstMee: true };
    case "facebook": return { url: "https://www.facebook.com/", tekstMee: false };
    case "instagram": return { url: "https://www.instagram.com/", tekstMee: false };
    case "tiktok": return { url: "https://www.tiktok.com/upload", tekstMee: false };
    case "youtube": return { url: "https://studio.youtube.com/", tekstMee: false };
  }
}
