import { authorizeAction } from "../_shared/action_policy.ts";

Deno.test("tasks require confirmation and idempotency", () => {
  const base = { action: "tasks.create", actorId: "owner", resourceOwnerId: "owner" };
  if (authorizeAction(base).allowed) throw new Error("unconfirmed task permitted");
  if (authorizeAction({ ...base, confirmed: true }).allowed) throw new Error("missing idempotency permitted");
  if (!authorizeAction({ ...base, confirmed: true, idempotencyKey: "0123456789abcdef" }).allowed) throw new Error("valid task denied");
});
Deno.test("calendar cannot be created for another owner", () => {
  if (authorizeAction({ action: "agenda.create", actorId: "alice", resourceOwnerId: "bob", confirmed: true, idempotencyKey: "0123456789abcdef" }).allowed) throw new Error("cross-owner calendar action permitted");
});
Deno.test("payments never execute through assistant actions", () => {
  if (authorizeAction({ action: "payment.create", actorId: "alice", resourceOwnerId: "alice", confirmed: true, idempotencyKey: "0123456789abcdef" }).allowed) throw new Error("payment permitted");
});
