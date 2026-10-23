// Toegangssleutels (Face ID / Touch ID): opties maken en antwoorden van de browser controleren.
// Zie sql/toegangssleutels.sql. Alleen deze functie mag (met de service-role) zeggen dat een handtekening klopt.
//
// Stappen (POST, JSON):
//   maken_start   {naam, wachtwoord}                       → opties voor navigator.credentials.create
//   maken_klaar   {naam, wachtwoord, antwoord, apparaat}   → sleutel bewaard
//   inloggen_start {}                                       → opties voor navigator.credentials.get
//   inloggen_klaar {antwoord, apparaat}                     → {token, naam}

import {
  b64url, inloggenControleren, makenControleren, uitdagingMaken, type Verwacht,
} from "./webauthn.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

async function rpc(functie: string, parameters: Record<string, unknown> = {}) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${functie}`, {
    method: "POST",
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(parameters),
  });
  if (!r.ok) throw new Error(`database ${functie}: ${r.status} ${await r.text()}`);
  return r.json();
}

let instellingen: { geheim: string; app_adres: string } | null = null;

async function verwacht(): Promise<Verwacht | null> {
  if (!instellingen?.app_adres) instellingen = await rpc("sleutel_instellingen");
  if (!instellingen?.app_adres) return null;
  const origin = new URL(instellingen.app_adres).origin;
  return { origin, rpId: new URL(origin).hostname, geheim: instellingen.geheim };
}

const antwoord = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const tekst = (s: unknown, max: number) => typeof s === "string" ? s.slice(0, max) : "";

Deno.serve(async (req) => {
  if (req.method !== "POST") return antwoord({ fout: "Alleen POST." }, 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return antwoord({ fout: "Ongeldig verzoek." }, 400); }
  try {
    const v = await verwacht();
    if (!v) return antwoord({ fout: "Inloggen met Face ID is nog niet beschikbaar." });
    const stap = body.stap;

    if (stap === "maken_start" || stap === "maken_klaar") {
      const g = await rpc("sleutel_gebruiker", { p_naam: tekst(body.naam, 200), p_wachtwoord: tekst(body.wachtwoord, 300) });
      if (g.geen_toegang) return antwoord({ geen_toegang: true });
      if (stap === "maken_start") {
        return antwoord({
          opties: {
            challenge: await uitdagingMaken(v.geheim, "maken", g.id),
            rp: { id: v.rpId, name: "Mijn assistent" },
            user: { id: b64url(Uint8Array.from(g.handle.match(/../g), (h: string) => parseInt(h, 16))),
                    name: g.naam, displayName: g.weergavenaam },
            pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
            authenticatorSelection: { residentKey: "required", requireResidentKey: true, userVerification: "required" },
            attestation: "none",
            excludeCredentials: (g.bestaand as string[]).map((id) => ({ type: "public-key", id })),
            timeout: 120000,
          },
        });
      }
      const a = body.antwoord as { clientDataJSON: string; attestationObject: string };
      let s;
      try {
        s = await makenControleren(a, v, g.id);
      } catch (e) {
        console.warn("maken geweigerd:", (e as Error).message);
        return antwoord({ fout: "Dit lukte niet. Probeer het opnieuw." });
      }
      return antwoord(await rpc("sleutel_opslaan", {
        p_gebruiker: g.id, p_cred_id: s.credId, p_alg: s.alg, p_sleutel: s.jwk, p_teller: s.teller,
        p_naam: tekst(body.apparaat, 80), p_uitdaging: s.uitdaging,
      }));
    }

    if (stap === "inloggen_start") {
      return antwoord({
        opties: { challenge: await uitdagingMaken(v.geheim, "inloggen", 0, 600), rpId: v.rpId,
                  userVerification: "required", timeout: 120000 },
      });
    }

    if (stap === "inloggen_klaar") {
      const a = body.antwoord as { id: string; clientDataJSON: string; authenticatorData: string; signature: string;
                                   userHandle?: string | null };
      const fout = { fout: "Deze toegangssleutel werkt niet (meer). Log in met je wachtwoord." };
      if (!a?.id || a.id.length > 1400) return antwoord(fout);
      const sleutel = await rpc("sleutel_zoeken", { p_cred_id: a.id });
      if (!sleutel.id) return antwoord(fout);
      let s;
      try {
        s = await inloggenControleren(a, v, sleutel);
      } catch (e) {
        console.warn("inloggen geweigerd:", (e as Error).message);
        return antwoord(fout);
      }
      return antwoord(await rpc("sleutel_inloggen", {
        p_id: sleutel.id, p_teller: s.teller, p_uitdaging: s.uitdaging, p_apparaat: tekst(body.apparaat, 80),
      }));
    }
    return antwoord({ fout: "Onbekende stap." }, 400);
  } catch (e) {
    console.error(e);
    return antwoord({ fout: "Even niet gelukt. Probeer het zo opnieuw." }, 500);
  }
});
