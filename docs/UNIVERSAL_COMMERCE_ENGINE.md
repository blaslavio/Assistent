# Universal Commerce Engine

The engine provides shared, typed cart rules for physical products, digital products, services, event tickets and subscriptions. It is **not** a live checkout.

## Required server integration
- Resolve active business workspace and seller identity from verified authentication, not a browser-supplied workspace ID.
- Query trusted catalog prices server-side. Never accept browser quote totals as payment amounts.
- Atomically reserve inventory or capacity with transaction isolation and idempotency.
- Create Stripe Checkout sessions server-side and reconcile signed webhooks; never fulfill on redirect alone.
- Separate service availability, event ticket capacity and subscription renewal state machines.
- Enforce workspace-specific RLS, privacy controls, taxes, refunds, shipping and downloadable entitlement.
- Audit checkout failures, retry safely, and prohibit cross-workspace order reads.

## Release
Run unit tests, end-to-end checkout and webhook replay tests, multi-tenant RLS tests and deployment smoke tests before activation.
