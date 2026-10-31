/** Deterministic input validation; no side effects or user data access. */
export function validateAssistantPayload(payload: Record<string, unknown>, action: string):
  | { ok: true; title: string; startsAt: string | null; endsAt: string | null }
  | { ok: false; error: string } {
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  if (!title || title.length > 180) return { ok: false, error: "invalid_title" };
  if (action === "tasks.create") return { ok: true, title, startsAt: null, endsAt: null };
  if (action !== "agenda.create") return { ok: false, error: "unsupported_action" };
  const start = payload.startsAt, end = payload.endsAt;
  if (typeof start !== "string" || typeof end !== "string") return { ok: false, error: "invalid_schedule" };
  // Require explicit timezone offsets: never silently interpret local times as UTC.
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
  if (!iso.test(start) || !iso.test(end)) return { ok: false, error: "timezone_required" };
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || b - a > 86400000) {
    return { ok: false, error: "invalid_schedule" };
  }
  return { ok: true, title, startsAt: start, endsAt: end };
}
