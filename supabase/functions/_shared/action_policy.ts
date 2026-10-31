/** Pure authorization boundary for assistant-initiated actions. No side effects. */
export type ActionRequest = {
  action: string;
  actorId: string;
  resourceOwnerId: string;
  confirmed?: boolean;
  idempotencyKey?: string;
};
export type ActionDecision = { allowed: true } | { allowed: false; reason: string };
const READ_ONLY = new Set(["agenda.read", "tasks.read", "mail.read"]);
const MUTATIONS = new Set(["agenda.create", "tasks.create", "mail.send"]);
const FINANCIAL = new Set(["payment.create", "payment.refund", "subscription.cancel"]);
export function authorizeAction(request: ActionRequest): ActionDecision {
  if (!request.actorId || !request.resourceOwnerId || request.actorId !== request.resourceOwnerId) {
    return { allowed: false, reason: "actor_not_authorized" };
  }
  if (READ_ONLY.has(request.action)) return { allowed: true };
  if (FINANCIAL.has(request.action)) return { allowed: false, reason: "financial_action_requires_dedicated_server_authorization" };
  if (!MUTATIONS.has(request.action)) return { allowed: false, reason: "unknown_action" };
  if (request.confirmed !== true) return { allowed: false, reason: "confirmation_required" };
  if (!request.idempotencyKey || !/^[a-zA-Z0-9_-]{16,128}$/.test(request.idempotencyKey)) {
    return { allowed: false, reason: "idempotency_key_required" };
  }
  return { allowed: true };
}
