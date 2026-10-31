import { validateAssistantPayload } from "../_shared/action_validation.ts";

Deno.test("task titles are trimmed and limited", () => {
  const valid = validateAssistantPayload({ title: "  Finish report  " }, "tasks.create");
  if (!valid.ok || valid.title !== "Finish report") throw Error("task normalization failed");
  if (validateAssistantPayload({ title: " " }, "tasks.create").ok) throw Error("empty title accepted");
  if (validateAssistantPayload({ title: "a".repeat(181) }, "tasks.create").ok) throw Error("long title accepted");
});
Deno.test("calendar requires timezone and increasing valid timestamps", () => {
  const base = { title: "Appointment", startsAt: "2026-11-01T10:00:00+01:00", endsAt: "2026-11-01T11:00:00+01:00" };
  if (!validateAssistantPayload(base, "agenda.create").ok) throw Error("valid calendar rejected");
  if (validateAssistantPayload({ ...base, startsAt: "2026-11-01T10:00:00" }, "agenda.create").ok) throw Error("timezone-less date accepted");
  if (validateAssistantPayload({ ...base, endsAt: base.startsAt }, "agenda.create").ok) throw Error("zero duration accepted");
  if (validateAssistantPayload({ ...base, endsAt: "2026-11-03T11:00:00+01:00" }, "agenda.create").ok) throw Error("excessive duration accepted");
});
Deno.test("unknown actions fail validation", () => {
  if (validateAssistantPayload({ title: "X" }, "payment.create").ok) throw Error("unknown action accepted");
});
