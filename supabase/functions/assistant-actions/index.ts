import { authorizeAction } from "../_shared/action_policy.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

export async function handleAssistantAction(request: Request): Promise<Response> {
  if (request.method !== "POST") return Response.json({ error: "method_not_allowed" }, { status: 405 });
  const authorization = request.headers.get("authorization") ?? "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return Response.json({ error: "authentication_required" }, { status: 401 });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return Response.json({ error: "server_not_configured" }, { status: 503 });
  }
  let payload: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 16384) return Response.json({ error: "payload_too_large" }, { status: 413 });
    payload = JSON.parse(raw);
    if (!payload || Array.isArray(payload) || typeof payload !== "object") throw Error("invalid");
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  // Supabase Auth validates the bearer token. Never trust a user id supplied by the client.
  let userId: string;
  try {
    const response = await fetch(new URL("/auth/v1/user", SUPABASE_URL), {
      headers: { authorization, apikey: SUPABASE_ANON_KEY },
    });
    if (!response.ok) return Response.json({ error: "authentication_required" }, { status: 401 });
    const user = await response.json();
    if (typeof user.id !== "string" || !user.id) throw Error("missing user");
    userId = user.id;
  } catch {
    return Response.json({ error: "authentication_unavailable" }, { status: 503 });
  }
  const action = typeof payload.action === "string" ? payload.action : "";
  const owner = typeof payload.resourceOwnerId === "string" ? payload.resourceOwnerId : "";
  const decision = authorizeAction({
    action, actorId: userId, resourceOwnerId: owner,
    confirmed: payload.confirmed === true,
    idempotencyKey: typeof payload.idempotencyKey === "string" ? payload.idempotencyKey : undefined,
  });
  if (!decision.allowed) return Response.json({ error: decision.reason }, { status: 403 });
  // Phase 1: validation only. No database writes, external messages, or payments.
  // A later PR must provide atomic replay protection and action-specific permissions.
  return Response.json({ status: "validated_not_executed", action, executed: false }, { status: 202 });
}

if (import.meta.main) Deno.serve(handleAssistantAction);
