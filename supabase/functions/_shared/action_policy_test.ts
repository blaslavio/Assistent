import { authorizeAction } from "./action_policy.ts";

Deno.test("AI action policy rejects cross-account access", () => {
  if (authorizeAction({ action: "agenda.read", actorId: "a", resourceOwnerId: "b" }).allowed) throw Error("cross-account access");
});
Deno.test("AI action policy permits same-account reads", () => {
  if (!authorizeAction({ action: "agenda.read", actorId: "a", resourceOwnerId: "a" }).allowed) throw Error("read rejected");
});
Deno.test("AI action policy requires confirmation", () => {
  if (authorizeAction({ action: "mail.send", actorId: "a", resourceOwnerId: "a" }).allowed) throw Error("missing confirmation");
});
Deno.test("AI action policy requires idempotency", () => {
  if (authorizeAction({ action: "mail.send", actorId: "a", resourceOwnerId: "a", confirmed: true }).allowed) throw Error("missing idempotency");
});
Deno.test("AI action policy permits confirmed mutation with key", () => {
  if (!authorizeAction({ action: "mail.send", actorId: "a", resourceOwnerId: "a", confirmed: true, idempotencyKey: "0123456789abcdef" }).allowed) throw Error("valid mutation rejected");
});
Deno.test("AI action policy always rejects financial operations", () => {
  if (authorizeAction({ action: "payment.refund", actorId: "a", resourceOwnerId: "a", confirmed: true, idempotencyKey: "0123456789abcdef" }).allowed) throw Error("financial operation allowed");
});
Deno.test("AI action policy rejects unknown operations", () => {
  if (authorizeAction({ action: "admin.delete", actorId: "a", resourceOwnerId: "a" }).allowed) throw Error("unknown operation allowed");
});
