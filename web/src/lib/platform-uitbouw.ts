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

// ——— 1. OAuth-flow (fase 1: X + Instagram) ———

export type OAuthStartResult =
  | { ok: true; provider: OAuthProvider; url: string; state: string }
  | { ok: false; reden: string };

/** Bouw authorize-URL via Edge Function (of duidelijke fout als nog niet geconfigureerd). */
export function oauthStartUrl(provider: OAuthProvider, returnPath = "/studio"): OAuthStartResult {
  const plan = OAUTH_PLAN.find((p) => p.id === provider);
  if (!plan) return { ok: false, reden: "Onbekend kanaal" };
  if (plan.fase > 1) {
    return {
      ok: false,
      reden: `${provider} zit in fase 2 — eerst X en Instagram live.`,
    };
  }
  const state = `oauth_${provider}_${Date.now().toString(36)}`;
  try {
    sessionStorage.setItem(`assistent.oauth.state.${provider}`, state);
  } catch {
    /* */
  }
  zetOAuthStatus(provider, "bezig");
  track("oauth_start" as KernEvent, provider);
  // Edge Function pad; deploy zet echte client_id/redirect.
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
  track(ok ? ("oauth_ok" as KernEvent) : ("oauth_fout" as KernEvent), provider);
  if (ok) auditLog("oauth_gekoppeld", { provider });
}

// ——— 2. Akkoord → post → meten ———

export type LusStap = "voorstel" | "akkoord" | "geplaatst" | "mislukt";

export function trackSocialLus(stap: LusStap, meta?: string) {
  const map: Record<LusStap, string> = {
    voorstel: "social_voorstel",
    akkoord: "social_voorstel_goed",
    geplaatst: "social_geplaatst",
    mislukt: "social_mislukt",
  };
  track(map[stap] as KernEvent, meta);
  auditLog(`social_${stap}`, { meta });
}

export function socialLusSamenvatting(dagen = 7) {
  // Hergebruik metrics uit kern via localStorage events-sleutel
  try {
    const raw = localStorage.getItem("assistent.metrics.v1");
    const events = raw ? (JSON.parse(raw) as { t: number; e: string }[]) : [];
    const grens = Date.now() - dagen * 864e5;
    const inVenster = events.filter((x) => x.t >= grens);
    const tel = (e: string) => inVenster.filter((x) => x.e === e).length;
    const akkoord = tel("social_voorstel_goed") + tel("akkoord");
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

// ——— 5. Offline-wachtrij (IndexedDB-achtig via localStorage v1) ———

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
  const lijst = [item, ...wachtrijLees()].slice(0, 100);
  try {
    localStorage.setItem(WACHTRIJ_KEY, JSON.stringify(lijst));
  } catch {
    /* */
  }
  track("offline_enqueue" as KernEvent, soort);
  return item;
}

export function wachtrijVerwijder(id: string) {
  try {
    localStorage.setItem(
      WACHTRIJ_KEY,
      JSON.stringify(wachtrijLees().filter((x) => x.id !== id)),
    );
  } catch {
    /* */
  }
}

/** Probeer items te flushen wanneer online; `verstuur` retourneert true bij succes. */
export async function wachtrijFlush(
  verstuur: (item: WachtrijItem) => Promise<boolean>,
): Promise<{ ok: number; mis: number }> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return { ok: 0, mis: 0 };
  let ok = 0;
  let mis = 0;
  for (const item of wachtrijLees()) {
    try {
      const gelukt = await verstuur(item);
      if (gelukt) {
        wachtrijVerwijder(item.id);
        ok++;
      } else {
        mis++;
        item.pogingen += 1;
      }
    } catch {
      mis++;
    }
  }
  return { ok, mis };
}

// ——— 6. Meldingen afdwingen ———

export type MeldSoort = "akkoordWachtrij" | "eigenEvents" | "communityMention" | "marketing";

/** Toon alleen als beleid het toelaat; anders stil. */
export function toonMeldingAlsMag(
  soort: MeldSoort,
  toon: () => void,
): boolean {
  if (!magMelden(soort)) return false;
  toon();
  return true;
}

// ——— 7. Studio-rollen + audit ———

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

export type AuditRij = {
  id: string;
  actie: string;
  meta?: Record<string, unknown>;
  t: string;
};

export function auditLog(actie: string, meta?: Record<string, unknown>) {
  const rij: AuditRij = {
    id: `a-${Date.now()}`,
    actie,
    meta,
    t: new Date().toISOString(),
  };
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

// ——— 9. Monetisatie (zonder kern te blokkeren) ———

export type MonetisatieModel = {
  /** App blijft gratis; verdienmodel naast de kern. */
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

// ——— 10. A11y helpers ———

export const A11Y = {
  /** Minimale touch target (px). */
  minTouch: 44,
  livePolite: { "aria-live": "polite" as const, role: "status" as const },
  liveAssertive: { "aria-live": "assertive" as const, role: "alert" as const },
};

// ——— 12. Scope: v1-guard ———

export function isBuitenV1Focus(feature: string): boolean {
  const later = ["dating", "crypto_trading", "random_mini_apps", "paywall_kern"];
  return later.includes(feature);
}

export function oauthFase1Providers(): OAuthProvider[] {
  return OAUTH_PLAN.filter((p) => p.fase === 1).map((p) => p.id);
}

export function kanalenStatusOverzicht() {
  const st = leesOAuthStatus();
  return oauthFase1Providers().map((id) => ({ id, status: st[id] }));
}
