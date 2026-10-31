# Phase 3: tasks and calendar actions

The new endpoint is **disabled by default**. It validates Supabase Auth bearer tokens and uses the caller's JWT for an RLS-protected, invoker-rights RPC. It only supports tasks.create and agenda.create with explicit confirmation and a caller-provided idempotency key. All other actions remain blocked.

Before enabling: review and apply the assistant_items migration, validate policies with two real test accounts, run Deno tests and CI, verify production deployment and HTTPS endpoint, and only then set ASSISTANT_ACTIONS_ENABLED=true in the Edge Function environment. Never use a service-role key for this action. This stores items in a new isolated table, not existing task/calendar UI data; frontend integration remains separate.

Production release evidence currently says livepublicatie_bevestigd=false. A merged PR is not a verified deployment.
