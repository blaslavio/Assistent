# PR 57 verification and release boundary

Reviewed against base `8891a436fec4c6f15b9a97b4958fbda56d1ca5e4` and original head `be251f97a5fc6d69c08837a1788ca2bf024a3b23`. The base is an ancestor of the head; no base merge is needed for this snapshot. PR 57 remains stacked on PR 56; this does not establish compatibility with a later main branch.

## Changes

- Intake UI accepts no input and cannot persist data. The core persistence entry point always refuses, with no runtime feature flag. Re-enabling requires a reviewed code change.
- Existing pure draft validation remains available for synthetic unit tests. No diagnosis, recommendation, calendar action or ticket is added.
- Account/profile tests exercise the real multistream store and opslag cache using a synthetic authenticated RPC substitute: cross-account list/delete, cross-profile list/delete, cache switching and invalid credentials.
- Regression tests cover the disabled UI path, disabled storage in online/local modes, exact input limits, invalid types and control characters.
- PKCE method corrected to case-sensitive `S256`, matching the existing provider test.
- Dedicated PR workflow runs on every target branch, including the stacked base, on Python 3.11 and 3.12. It compiles all source, runs the intake/provider/boundary tests explicitly and then the full pytest suite. It needs no secrets and uses no live client records.

## Evidence and limits

Local Python 3.12: 29 targeted tests passed; compileall and git diff --check passed. The original head had two successful workflow runs, but those used unittest discovery and did not establish that the new pytest functions ran. New-head CI must be checked after push.

These are offline contract tests, NOT deployed database, RLS, tenant isolation or end-to-end authentication evidence. The RPC substitute defines the authorization contract; it cannot prove the deployed RPC obeys it. Local opslag uses one file and is not an account-isolated store. Sensitive intake therefore stays disabled in both modes.

Before any later enablement, independently test two authenticated accounts (and distinct tenants where applicable) against deployed storage with synthetic markers: read, write, delete, account switching, token expiry/revocation, missing/wrong credentials and concurrent sessions. Verify actual server-derived account identity, deployed RPC permissions/policies and absence of bypass keys. Verify real Microsoft login/logout separately. No deployed configuration is changed by this PR.

Merge gate: require the new workflow for the exact final head and its PR merge ref, review any full-suite failures, recheck the base SHA, and retain the intake block. No merge or deployment is performed here.

## Privacy-first service preparation

The intake section now offers only fixed service and purpose choices with no default selection. It has no name, contact, symptom, injury or treatment-note fields. Submission displays only the validated choices in the current response; it does not persist a draft, invoke AI/learning, publish, create a ticket or synchronize calendars. Form choices still reach the Streamlit server and can be associated with its session: this is data minimization, not a claim of anonymity or encryption. Invalid payloads are never echoed.

Sensitive client-record persistence remains unconditionally disabled. This is consistent with assistant_privacy's default-off learning consent and community_privacy's default-off discovery/personalization. A privacy profile label alone is not an authorization boundary. The existing generic free-text stream and Life Swarm notes are outside this scoped change and are not certified for clinical records.

Validation adds all supported service/purpose pairs, unknown/type-invalid content, no default selection, invalid-payload non-echo, and checks that the preparation flow never calls storage, recovery advice or calendar synchronization.
