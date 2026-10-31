# Private and business workspace rollout

This change introduces separate personal and business workspace data stores. It does not silently migrate legacy tasks, calendar entries, payments, customers, chat history, or AI memories.

## Security
- Owner-only RLS is enforced for workspaces and workspace items; staff membership records are metadata only, **not** authorization for item access.
- Never trust workspace IDs or active workspace claims from the browser without database RLS.
- A combined calendar should query both workspaces with the signed-in owner's JWT and merge only in the owner's UI. Staff views must query business workspaces only after explicit role policies are designed and tested.
- AI memory, search indexing, notifications and connector credentials must be partitioned by workspace before activation.
- Avoid storing personal/private content in business analytics or shared telemetry.

## Release gates
1. Apply migration to an isolated test project; confirm anon cannot access tables and user A cannot read user B's personal or business items.
2. Verify that owner-only INSERT/UPDATE/DELETE cannot move an item to another owner's workspace.
3. Add real UI switcher and explicit business creation flow; do not show fake workspaces.
4. Implement explicit migration mapping and reconciliation for legacy agenda/tasks; preserve originals and audit moved records.
5. Add approved employee roles and AI authorization policies with tests.
6. Enable only after CI, database tests and production deployment smoke tests.
