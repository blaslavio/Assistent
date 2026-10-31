# Phase 3 integration contract

The new assistant_items table is intentionally isolated. Do not pretend it is already synchronized with existing agenda/task screens. The UI must read it through the authenticated user JWT and RLS; any later consolidation must migrate existing records without overwriting them.

## Observability
Each assistant action should return an opaque request identifier and a stable machine-readable error code. Never log bearer tokens, task titles, message bodies, API keys or full request payloads. Capture latency, action name, status and a hashed user identifier only in approved server telemetry. Alert on repeated 401/403/502/503 and database RPC errors.

## Authentication
The older AI proxy uses a separate `abo.` credential scheme. Do not remove or silently substitute it: migrate via a compatibility adapter, verified Supabase Auth sessions and an explicit client cutover, then revoke legacy credentials. Financial operations remain on separate Stripe-authorized endpoints.

## Verification before merge or release
1. CI Deno typecheck and action policy/validation tests pass on the final head SHA.
2. SQL migration reviewed and tested with two authenticated users: owner can read/create, other user cannot access items, anon cannot call RPC.
3. Retry the same idempotency key and payload, verify one row and same ID; reuse the key with changed payload, verify rejection.
4. Confirm time zone, malformed dates, failed auth, missing config, network errors, and disabled flag behavior.
5. Verify deployment and production smoke test independently before setting `ASSISTANT_ACTIONS_ENABLED=true`.
6. Implement UI integration, diagnostics and integration monitoring in subsequent reviewed changes; they are not delivered by this PR.
