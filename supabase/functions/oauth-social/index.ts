/**
 * OAuth start/callback voor social agents (fase 1: X + Instagram).
 * Secrets: X_CLIENT_ID, X_CLIENT_SECRET, META_APP_ID, META_APP_SECRET, OAUTH_REDIRECT_URL
 * Tokens opslaan in beveiligde tabel / vault — nooit terug naar de client-log.
 */
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Provider = "x" | "instagram";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider") as Provider | null;
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  const ret = url.searchParams.get("return") ?? "/studio";

  if (!provider || !["x", "instagram"].includes(provider)) {
    return json({ error: "provider moet x of instagram zijn (fase 1)" }, 400);
  }

  // Callback met code → token exchange (placeholder tot secrets gezet zijn)
  if (code) {
    const configured = secretsOk(provider);
    if (!configured) {
      return json({
        ok: false,
        error: "OAuth secrets ontbreken in de omgeving",
        provider,
      }, 503);
    }
    // TODO: exchange code, encrypt refresh token, koppel aan auth.uid()
    return json({
      ok: true,
      provider,
      message: "Token-exchange placeholder — implementeer met platform-secrets",
      return: ret,
    });
  }

  // Start authorize redirect
  const authorize = authorizeUrl(provider, state);
  if (!authorize) {
    return json({
      ok: false,
      error: "Configureer client_id / redirect voor " + provider,
      provider,
    }, 503);
  }

  return new Response(null, {
    status: 302,
    headers: { ...cors, Location: authorize },
  });
});

function secretsOk(provider: Provider): boolean {
  if (provider === "x") {
    return !!(Deno.env.get("X_CLIENT_ID") && Deno.env.get("X_CLIENT_SECRET"));
  }
  return !!(Deno.env.get("META_APP_ID") && Deno.env.get("META_APP_SECRET"));
}

function authorizeUrl(provider: Provider, state: string): string | null {
  const redirect = Deno.env.get("OAUTH_REDIRECT_URL");
  if (!redirect) return null;
  if (provider === "x") {
    const id = Deno.env.get("X_CLIENT_ID");
    if (!id) return null;
    const q = new URLSearchParams({
      response_type: "code",
      client_id: id,
      redirect_uri: redirect,
      scope: "tweet.read tweet.write users.read offline.access",
      state: `x.${state}`,
      code_challenge: "challenge",
      code_challenge_method: "plain",
    });
    return `https://twitter.com/i/oauth2/authorize?${q}`;
  }
  const id = Deno.env.get("META_APP_ID");
  if (!id) return null;
  const q = new URLSearchParams({
    client_id: id,
    redirect_uri: redirect,
    state: `instagram.${state}`,
    scope: "instagram_basic,instagram_manage_comments,pages_show_list",
    response_type: "code",
  });
  return `https://www.facebook.com/v18.0/dialog/oauth?${q}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
