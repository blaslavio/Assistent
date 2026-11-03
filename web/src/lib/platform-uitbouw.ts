/**
 * Uitbouw boven platform-kern (punten 1–12).
 * Tokens en geheimen horen op de server (Edge Function), nooit in de client-repo.
 */
import {
  type OAuthProvider,
  OAUTH_PLAN,
  leesOAuthStatus,
  zetOAuthStatus,
  track,
  magMelden,
  type KernEvent,
} from "./platform-kern";

export type OAuthStartResult =
  | { ok: true; provider: OAuthProvider; url: string; state: string }
  | { ok: false; reden: string };

export function oauthStartUrl(provider: OAuthProvider, returnPath = "/studio"): OAuthStartResult {
  const plan = OAUTH_PLAN.find((p) => p.id === provider);
  if (!plan) return { ok: false, reden: "Onbekend kanaal" };
  if (plan.fase > 1) {
    return { ok: false, reden: `${provider} zit in fase 2 — eerst X en Instagram live.` };
  }
  const state = `oauth_${provider}_${Date.now().toString(36)}`;
  try {
    sessionStorage.setItem(`assistent.oauth.state.${provider}`, state);
  } catch {
    /* */
  }
  zetOAuthStatus(provider, "bezig");
  track("oauth_start", provider);
  const base = (import.meta as { env?: { VITE_SUPABASE_URL?: string } }).env?.VITE_SUPABASE_URL;
  if (!base) {
    return {
      ok: false,
      reden: "Supabase-URL ontbreekt. Zet VITE_SUPABASE_URL en deploy functie oauth-social.",
    };
  }
  const url =
    `${base.replace(/\/$/, "")}/functions/v1/oauth-social?provider=${encodeURIComponent(provider)}` +
    `&state=${encodeURIComponent(state)}&return=${encodeURIComponent(returnPath)}`;
  return { ok: true, provider, url, state };
}

export function oauthCallbackVerwerk(provider: OAuthProvider, ok: boolean) {
  zetOAuthStatus(provider, ok ? "actief" : "verlopen");
  track(ok ? "oauth_ok" : "oauth_fout", provider);
  if (ok) auditLog("oauth_gekoppeld", { provider });
}

export type LusStap = "voorstel" | "akkoord" | "geplaatst" | "mislukt";

export function trackSocialLus(stap: LusStap, meta?: string) {
  const map: Record<LusStap, KernEvent | string> = {
    voorstel: "social_voorstel_goed",
    akkoord: "social_voorstel_goed",
    geplaatst: "social_geplaatst",
    mislukt: "social_mislukt",
  };
  track(map[stap] as KernEvent, meta);
  auditLog(`social_${stap}`, { meta });
}

export function socialLusSamenvatting(dagen = 7) {
  try {
    const raw = localStorage.getItem("assistent.kernmetrics.v1");
    const events = raw ? (JSON.parse(raw) as { t: number; e: string }[]) : [];
    const grens = Date.now() - dagen * 864e5;
    const inVenster = events.filter((x) => x.t >= grens);
    const tel = (e: string) => inVenster.filter((x) => x.e === e).length;
    const akkoord = tel("social_voorstel_goed");
    const geplaatst = tel("social_geplaatst");
    return {
      akkoord,
      geplaatst,
      conversie: akkoord ? Math.round((geplaatst / akkoord) * 100) : 0,
    };
  } catch {
    return { akkoord: 0, geplaatst: 0, conversie: 0 };
  }
}

export type WachtrijItem = {
  id: string;
  soort: "bestelling" | "ticket_scan" | "social_plaats" | "rapport";
  payload: Record<string, unknown>;
  gemaakt: string;
  pogingen: number;
};

const WACHTRIJ_KEY = "assistent.offline.wachtrij.v1";

export function wachtrijLees(): WachtrijItem[] {
  try {
    return JSON.parse(localStorage.getItem(WACHTRIJ_KEY) || "[]") as WachtrijItem[];
  } catch {
    return [];
  }
}

export function wachtrijPush(
  soort: WachtrijItem["soort"],
  payload: Record<string, unknown>,
): WachtrijItem {
  const item: WachtrijItem = {
    id: `w-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    soort,
    payload,
    gemaakt: new Date().toISOString(),
    pogingen: 0,
  };
  try {
    localStorage.setItem(WACHTRIJ_KEY, JSON.stringify([item, ...wachtrijLees()].slice(0, 100)));
  } catch {
    /* */
  }
  track("offline_enqueue", soort);
  return item;
}

export function wachtrijVerwijder(id: string) {
  try {
    localStorage.setItem(WACHTRIJ_KEY, JSON.stringify(wachtrijLees().filter((x) => x.id !== id)));
  } catch {
    /* */
  }
}

export async function wachtrijFlush(
  verstuur: (item: WachtrijItem) => Promise<boolean>,
): Promise<{ ok: number; mis: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, mis: 0 };
  let ok = 0;
  let mis = 0;
  for (const item of wachtrijLees()) {
    try {
      if (await verstuur(item)) {
        wachtrijVerwijder(item.id);
        ok++;
      } else mis++;
    } catch {
      mis++;
    }
  }
  return { ok, mis };
}

export type MeldSoort = "akkoordWachtrij" | "eigenEvents" | "communityMention" | "marketing";

export function toonMeldingAlsMag(soort: MeldSoort, toon: () => void): boolean {
  if (!magMelden(soort)) return false;
  toon();
  return true;
}

export type StudioRol = "eigenaar" | "medewerker" | "scanner";

const ROL_KEY = "assistent.studio.rol.v1";
const AUDIT_KEY = "assistent.studio.audit.v1";

export function leesStudioRol(): StudioRol {
  try {
    const r = localStorage.getItem(ROL_KEY) as StudioRol | null;
    if (r === "eigenaar" || r === "medewerker" || r === "scanner") return r;
  } catch {
    /* */
  }
  return "eigenaar";
}

export function zetStudioRol(rol: StudioRol) {
  try {
    localStorage.setItem(ROL_KEY, rol);
  } catch {
    /* */
  }
  auditLog("rol_gezet", { rol });
}

export function magStudioActie(
  actie: "keuren" | "plaatsen" | "scannen" | "instellingen" | "uitbetalen",
  rol = leesStudioRol(),
): boolean {
  if (rol === "eigenaar") return true;
  if (rol === "medewerker") return actie !== "uitbetalen" && actie !== "instellingen";
  if (rol === "scanner") return actie === "scannen";
  return false;
}

export type AuditRij = { id: string; actie: string; meta?: Record<string, unknown>; t: string };

export function auditLog(actie: string, meta?: Record<string, unknown>) {
  const rij: AuditRij = { id: `a-${Date.now()}`, actie, meta, t: new Date().toISOString() };
  try {
    const lijst = JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]") as AuditRij[];
    localStorage.setItem(AUDIT_KEY, JSON.stringify([rij, ...lijst].slice(0, 100)));
  } catch {
    /* */
  }
}

export function auditLees(max = 20): AuditRij[] {
  try {
    return (JSON.parse(localStorage.getItem(AUDIT_KEY) || "[]") as AuditRij[]).slice(0, max);
  } catch {
    return [];
  }
}

export type MonetisatieModel = {
  appGratis: true;
  commissieHandelPct: number;
  commissieTicketsPct: number;
  studioPro: boolean;
  studioProPrijsMaandCent: number;
};

const MON_KEY = "assistent.monetisatie.v1";

export function standaardMonetisatie(): MonetisatieModel {
  return {
    appGratis: true,
    commissieHandelPct: 3,
    commissieTicketsPct: 5,
    studioPro: false,
    studioProPrijsMaandCent: 1900,
  };
}

export function leesMonetisatie(): MonetisatieModel {
  try {
    return { ...standaardMonetisatie(), ...JSON.parse(localStorage.getItem(MON_KEY) || "{}") };
  } catch {
    return standaardMonetisatie();
  }
}

export function commissieCenten(bedragCent: number, soort: "handel" | "ticket"): number {
  const m = leesMonetisatie();
  const pct = soort === "handel" ? m.commissieHandelPct : m.commissieTicketsPct;
  return Math.round((bedragCent * pct) / 100);
}

export const A11Y = {
  minTouch: 44,
  livePolite: { "aria-live": "polite" as const, role: "status" as const },
  liveAssertive: { "aria-live": "assertive" as const, role: "alert" as const },
};

export function isBuitenV1Focus(feature: string): boolean {
  return ["dating", "crypto_trading", "random_mini_apps", "paywall_kern"].includes(feature);
}

export function oauthFase1Providers(): OAuthProvider[] {
  return OAUTH_PLAN.filter((p) => p.fase === 1).map((p) => p.id);
}

export function kanalenStatusOverzicht() {
  const st = leesOAuthStatus();
  return oauthFase1Providers().map((id) => ({ id, status: st[id] }));
}
