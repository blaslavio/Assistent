# Payment architecture and release gates — 2026-10-28

## Source of truth
- `supabase/functions/betalen/index.ts`: server-side Stripe Connect integration.
- `sql/stripe.sql`: existing payment schema and RPC contract.
- UI: only initiates authorized requests and renders verified server state.
- `escrow_safety.py` in draft PR #108: proposal validation only; **not** a second ledger or Stripe integration.

## Immediate audit observations
1. The current Stripe Edge Function reads secrets from environment OR database configuration. Prefer environment-only secrets and plan rotation away from database-stored secrets.
2. `centen = Math.round(Number(euro) * 100)` accepts values without explicit finite/range/precision checks. Validate on server against authoritative stored order amounts and integer minor units.
3. `ontvangen` calls `stripe_vrijgeven` before the external transfer. A Stripe failure can leave state out of sync; define retryable, idempotent state transitions and reconciliation.
4. `geschilBesluiten` requires administrator authorization, but refund and transfer outcomes require reconciliation against Stripe webhook events.
5. Password/name parameters passed to RPC need independent security review; migrate to verified auth identity where feasible.

## Architecture invariants
- One authoritative payment order per transaction, bound to authenticated buyer and seller.
- No client-provided balance is trusted. Never claim that a displayed balance represents settled funds.
- All amounts stored as integer minor units; server-side fee calculation, currency and range checks.
- Stripe webhooks: verify signature on raw body, reject stale signatures, persist event ID uniquely, acknowledge duplicates.
- Idempotent external calls and atomic internal state transitions; failed calls are recoverable via retry/reconciliation.
- Database RLS and restricted service-role usage; service credentials never in frontend.
- Disputes are reviewed by authorized humans; AI can assist but cannot independently release/refund funds.
- Never log credentials, personal data or full payment payloads.

## Release sequence
1. Add characterization tests for existing payment RPC/Edge Function behavior, without changing live behavior.
2. Add money validation and idempotency coverage.
3. Add transaction state machine and reconciliation paths.
4. Verify authentication, authorization, RLS and secrets handling.
5. Test Stripe in test mode: success, cancellation, duplicate webhook, timeout, refund, dispute, transfer failure, concurrent requests.
6. Check booking, agenda, mail, mobile UX and accessibility.
7. Independent review including Claude conflict check; merge only after CI and approval.

## Acceptance criteria
- All automated tests green on candidate merge commit.
- No high/critical security findings.
- End-to-end test-mode transactions and webhook retries pass.
- Live feature smoke tests recorded with environment and evidence.
- Rollback, observability, incident owner documented.

## Not verified
No live payment, authentication, booking, email, mobile or Rive checks were performed in this audit. No Claude review performed. Do not claim a 9/10 score or production readiness yet.
