// Platform-kern om het product naar ~8 te tillen: focus, metrics, meldingen, moderatie, OAuth-plan.
// Privacy-first: metrics blijven op dit apparaat tenzij jij later expliciet deelt.

export const V1_FOCUS = {
  diamant: [
    "Assistent (akkoord-first)",
    "Één commerce-flow (bestellen of tickets)",
    "Community-feed met privacy",
    "Social agents op 2 kanalen (X + Instagram)",
  ],
  later: ["Overige kanalen", "Volledige Studio-diepte", "Server-side audit"],
} as const;

/** Lokale events — geen server, geen tracking-pixel. */
export type KernEvent =
  | "app_open"
  | "eerste_minuut_klaar"
  | "assistent_vraag"
  | "akkoord_gegeven"
  | "social_voorstel_goed"
  | "social_geplaatst"
  | "social_mislukt"
  | "signaal_in_planning"
  | "rapport_community"
  | "zoek_gebruikt"
  | "oauth_start"
  | "oauth_ok"
  | "oauth_fout"
  | "offline_enqueue"
  | "moderatie_blok";

type EventRij = { t: number; e: KernEvent; meta?: string };

const METRICS_KEY = "assistent.kernmetrics.v1";
const MAX = 200;

function leesEvents(): EventRij[] {
  try {
    const raw = localStorage.getItem(METRICS_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as EventRij[];
    return Array.isArray(p) ? p.slice(-MAX) : [];
  } catch {
    return [];
  }
}

export function track(e: KernEvent, meta?: string) {
  try {
    const rij: EventRij = { t: Date.now(), e, ...(meta ? { meta: meta.slice(0, 80) } : {}) };
    const all = [...leesEvents(), rij].slice(-MAX);
    localStorage.setItem(METRICS_KEY, JSON.stringify(all));
  } catch {
    /* privé / vol */
  }
}

export function metricsSamenvatting(dagen = 7) {
  const vanaf = Date.now() - dagen * 864e5;
  const events = leesEvents().filter((x) => x.t >= vanaf);
  const tel = (e: KernEvent) => events.filter((x) => x.e === e).length;
  return {
    dagen,
    app_open: tel("app_open"),
    akkoord: tel("akkoord_gegeven"),
    social_goed: tel("social_voorstel_goed"),
    social_geplaatst: tel("social_geplaatst"),
    signalen: tel("signaal_in_planning"),
    rapporten: tel("rapport_community"),
    zoek: tel("zoek_gebruikt"),
    oauth_ok: tel("oauth_ok"),
    offline: tel("offline_enqueue"),
  };
}

/** Meldingen: jij kiest, standaard rustig. */
export type MeldBeleid = {
  akkoordWachtrij: boolean;
  eigenEvents: boolean;
  communityMention: boolean;
  marketing: boolean;
  stilNaUur: number | null;
};

const MELD_KEY = "assistent.meldbeleid.v1";

export const standaardMeldBeleid = (): MeldBeleid => ({
  akkoordWachtrij: true,
  eigenEvents: true,
  communityMention: true,
  marketing: false,
  stilNaUur: 22,
});

export function leesMeldBeleid(): MeldBeleid {
  try {
    const raw = localStorage.getItem(MELD_KEY);
    if (!raw) return standaardMeldBeleid();
    return { ...standaardMeldBeleid(), ...JSON.parse(raw) };
  } catch {
    return standaardMeldBeleid();
  }
}

export function bewaarMeldBeleid(b: Partial<MeldBeleid>) {
  const next = { ...leesMeldBeleid(), ...b };
  try {
    localStorage.setItem(MELD_KEY, JSON.stringify(next));
  } catch {
    /* */
  }
  return next;
}

export function magMelden(soort: keyof Omit<MeldBeleid, "stilNaUur">, nu = new Date()): boolean {
  const b = leesMeldBeleid();
  if (!b[soort]) return false;
  if (b.stilNaUur != null && nu.getHours() >= b.stilNaUur) return false;
  return true;
}

export type RapportReden = "spam" | "misleiding" | "haat" | "privacy" | "anders";

export type Rapport = {
  id: string;
  doelId: string;
  soort: "bericht" | "profiel" | "winkel";
  reden: RapportReden;
  toelichting?: string;
  gemaakt: string;
};

const RAPPORT_KEY = "assistent.rapporten.v1";
const BLOK_KEY = "assistent.blokkeer.v1";

export function rapporteer(r: Omit<Rapport, "id" | "gemaakt">): Rapport {
  const volledig: Rapport = {
    ...r,
    id: `r-${Date.now()}`,
    gemaakt: new Date().toISOString(),
  };
  try {
    const lijst = JSON.parse(localStorage.getItem(RAPPORT_KEY) || "[]") as Rapport[];
    localStorage.setItem(RAPPORT_KEY, JSON.stringify([volledig, ...lijst].slice(0, 50)));
  } catch {
    /* */
  }
  track("rapport_community", r.reden);
  return volledig;
}

export function blokkeerGebruiker(id: string) {
  try {
    const s = new Set<string>(JSON.parse(localStorage.getItem(BLOK_KEY) || "[]"));
    s.add(id);
    localStorage.setItem(BLOK_KEY, JSON.stringify([...s]));
    track("moderatie_blok", id.slice(0, 40));
  } catch {
    /* */
  }
}

export function isGeblokkeerd(id: string): boolean {
  try {
    const s = new Set<string>(JSON.parse(localStorage.getItem(BLOK_KEY) || "[]"));
    return s.has(id);
  } catch {
    return false;
  }
}

export type OAuthProvider = "x" | "instagram" | "facebook" | "tiktok" | "linkedin" | "youtube";

export const OAUTH_PLAN: {
  id: OAuthProvider;
  fase: 1 | 2;
  scopes: string[];
  notitie: string;
}[] = [
  {
    id: "x",
    fase: 1,
    scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
    notitie: "Official API; post + reply na akkoord",
  },
  {
    id: "instagram",
    fase: 1,
    scopes: ["instagram_basic", "instagram_manage_comments", "pages_show_list"],
    notitie: "Via Meta; comments/DM triage",
  },
  {
    id: "linkedin",
    fase: 2,
    scopes: ["w_member_social"],
    notitie: "Zakelijke posts",
  },
  {
    id: "tiktok",
    fase: 2,
    scopes: ["video.publish", "user.info.basic"],
    notitie: "Na app-review",
  },
  {
    id: "facebook",
    fase: 2,
    scopes: ["pages_manage_posts", "pages_messaging"],
    notitie: "Pages",
  },
  {
    id: "youtube",
    fase: 2,
    scopes: ["youtube.force-ssl"],
    notitie: "Community tab / shorts beschrijving",
  },
];

const OAUTH_STATUS_KEY = "assistent.oauth.status.v1";

export type OAuthStatus = "niet" | "bezig" | "actief" | "verlopen";

export function leesOAuthStatus(): Record<OAuthProvider, OAuthStatus> {
  const basis = Object.fromEntries(OAUTH_PLAN.map((p) => [p.id, "niet"])) as Record<
    OAuthProvider,
    OAuthStatus
  >;
  try {
    return { ...basis, ...JSON.parse(localStorage.getItem(OAUTH_STATUS_KEY) || "{}") };
  } catch {
    return basis;
  }
}

export function zetOAuthStatus(id: OAuthProvider, status: OAuthStatus) {
  const cur = leesOAuthStatus();
  cur[id] = status;
  try {
    localStorage.setItem(OAUTH_STATUS_KEY, JSON.stringify(cur));
  } catch {
    /* */
  }
  return cur;
}

const EERSTE_KEY = "assistent.eerste_minuut.v1";

export function eersteMinuutKlaar(): boolean {
  try {
    return localStorage.getItem(EERSTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function markeerEersteMinuutKlaar() {
  try {
    localStorage.setItem(EERSTE_KEY, "1");
  } catch {
    /* */
  }
  track("eerste_minuut_klaar");
}

export type ZoekDoel =
  | { soort: "tab"; tab: "vandaag" | "chat" | "projecten" | "assistent" | "instellingen" }
  | { soort: "studio"; tool: string }
  | { soort: "tekst"; uitleg: string };

export const ZOEK_INDEX: { trefwoorden: string; label: string; doel: ZoekDoel }[] = [
  { trefwoorden: "assistent ai vraag hulp", label: "Assistent", doel: { soort: "tab", tab: "assistent" } },
  { trefwoorden: "chat community netwerk handel", label: "Chat en community", doel: { soort: "tab", tab: "chat" } },
  { trefwoorden: "studio winkel evenement tickets agents social", label: "Studio", doel: { soort: "tab", tab: "projecten" } },
  { trefwoorden: "social bot agent instagram x tiktok oauth koppel", label: "Social agents", doel: { soort: "studio", tool: "social_bots" } },
  { trefwoorden: "privacy beveiliging account status meldingen", label: "Privacy en status", doel: { soort: "tab", tab: "instellingen" } },
  { trefwoorden: "bestelling betalen stripe", label: "Bestellingen / betalen", doel: { soort: "tekst", uitleg: "Studio → Bestellingen of Instellingen → Betalingen" } },
];

export function globaalZoeken(q: string) {
  const term = q.trim().toLocaleLowerCase("nl");
  if (!term) return [];
  track("zoek_gebruikt", term);
  return ZOEK_INDEX.filter((x) => `${x.trefwoorden} ${x.label}`.includes(term)).slice(0, 8);
}
