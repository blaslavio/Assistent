# Beta readiness and quality gates

This branch is a preparation branch. It does not claim production readiness.

## Release gates
- No direct push to main; require reviewed pull requests and green CI.
- Compile/import all Python modules; run pytest and security/static checks.
- Verify critical end-to-end journeys: login, tenant isolation, create company, service, booking, order, AI request.
- Test mobile navigation, focus/scroll retention, accessible labels and no emoji in interface copy.
- Verify database RLS with two distinct test users and deny-by-default access.
- Keep all secrets server-side; audit AI tool permissions, payment webhook signatures and idempotency.
- Monitor errors, latency, costs; document backup and restore drills.

## API-later contract
- Use provider-independent interfaces for AI, payments, calendar and email.
- Mock adapters are the default until explicit beta configuration.
- Explicit capability flags distinguish 'unavailable', 'sandbox' and 'live'.
- Never mark an order paid based on client UI; only verified provider confirmation.
- Never represent a mock success as a completed external action.

## Migration
- Inventory existing modules, imports and shared Streamlit session state.
- Extract business logic behind typed services before migrating the frontend.
- Preserve existing behavior with characterization tests.
- Migrate in small, reversible PRs; keep Streamlit as the current shell until replacement is verified.

## Definition of done
Code merged + CI passed + staging e2e passed + live smoke test evidenced. 
