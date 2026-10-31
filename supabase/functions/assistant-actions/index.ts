import { authorizeAction } from "../_shared/action_policy.ts";
import { validateAssistantPayload } from "../_shared/action_validation.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const ACTIONS_ENABLED = Deno.env.get("ASSISTANT_ACTIONS_ENABLED") === "true";

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
  if (!ACTIONS_ENABLED) return Response.json({ error: "execution_disabled", executed: false }, { status: 503 });
  if (action !== "tasks.create" && action !== "agenda.create") {
    return Response.json({ error: "execution_not_supported" }, { status: 403 });
  }
  const validated = validateAssistantPayload(payload, action);
  if (!validated.ok) return Response.json({ error: validated.error }, { status: 400 });
  const { title, startsAt, endsAt } = validated;
  // The RPC uses auth.uid() and an atomic unique (owner_id, idempotency_key)
  // constraint. Never pass a service-role key to this endpoint.
  const endpoint = new URL("/rest/v1/rpc/assistant_create_item", SUPABASE_URL);
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { authorization, apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
      body: JSON.stringify({
        p_action: action, p_title: title, p_idempotency_key: payload.idempotencyKey,
        p_starts_at: action === "agenda.create" ? startsAt : null,
        p_ends_at: action === "agenda.create" ? endsAt : null,
      }),
    });
  } catch {
    return Response.json({ error: "database_unavailable" }, { status: 503 });
  }
  if (!response.ok) return Response.json({ error: "action_failed", executed: false }, { status: 502 });
  return Response.json({ status: "completed", action, result: await response.json(), executed: true });

}

if (import.meta.main) Deno.serve(handleAssistantAction);
