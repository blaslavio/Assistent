# Production and universal AI action phase

## Why
The repository currently has web test evidence but no independently verified production release. A broad AI assistant must not silently gain permission to send mail, alter bookings or move money.

## Phase gates
1. Confirm GitHub Pages/Streamlit deployment workflow and production URL; add independent HTTP smoke and authenticated end-to-end tests.
2. Verify Supabase migrations, RLS policies, provider configuration, and Stripe webhook replay/idempotency.
3. Integrate the shared action policy at the **server execution boundary**, deriving actorId from verified server-side auth (never client-supplied).
4. Require explicit user confirmation for mutations and persist idempotency keys server-side; the pure policy only checks syntax, not replay.
5. Route financial actions through dedicated verified payment endpoints, not the general assistant.
6. Monitor error rates, latency, provider outages and rollback. Only deploy after CI and review.

## Scope of this PR
Introduces a pure, fail-closed action decision helper and tests. It is **not yet wired into live request handling**. No existing AI or payment behavior changes until integration and security review.
