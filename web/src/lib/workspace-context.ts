/** Workspace boundaries shared by personal and business experiences.
 * This is a fail-closed client guard, not a substitute for database RLS.
 */
export type ContextKind = "personal" | "business";
export type ContextRole = "owner" | "admin" | "staff" | "member" | "viewer";
export type WorkspaceContext = { id: string; kind: ContextKind; ownerId: string; organizationId?: string | null };
export type ContextAccess = { userId: string; workspaceId: string; role: ContextRole; active: boolean };
export type WorkspaceAction = "read" | "write" | "manage_members" | "manage_billing" | "manage_settings";
const permissions: Record<ContextRole, ReadonlySet<WorkspaceAction>> = {
  owner: new Set(["read","write","manage_members","manage_billing","manage_settings"]),
  admin: new Set(["read","write","manage_members","manage_settings"]),
  staff: new Set(["read","write"]),
  member: new Set(["read"]),
  viewer: new Set(["read"]),
};
export function canAccessWorkspace(
  workspace: WorkspaceContext, userId: string | null | undefined,
  memberships: readonly ContextAccess[], action: WorkspaceAction
): boolean {
  if (!userId || !workspace.id || !["personal","business"].includes(workspace.kind)) return false;
  if (workspace.kind === "personal") return workspace.ownerId === userId &&
    (action === "read" || action === "write" || action === "manage_settings");
  if (!workspace.organizationId) return false;
  if (workspace.ownerId === userId) return permissions.owner.has(action);
  return memberships.some(m => m.active && m.userId === userId && m.workspaceId === workspace.id &&
    Object.prototype.hasOwnProperty.call(permissions, m.role) && permissions[m.role]?.has(action));
}
export function filterAccessibleWorkspaces(
  workspaces: readonly WorkspaceContext[], userId: string | null | undefined,
  memberships: readonly ContextAccess[]
): WorkspaceContext[] {
  return workspaces.filter(w => canAccessWorkspace(w,userId,memberships,"read"));
}
export function safeWorkspaceSelection(
  requestedId: string | null | undefined, workspaces: readonly WorkspaceContext[],
  userId: string | null | undefined, memberships: readonly ContextAccess[]
): WorkspaceContext | null {
  const allowed = filterAccessibleWorkspaces(workspaces,userId,memberships);
  return allowed.find(w => w.id === requestedId) ?? allowed.find(w => w.kind === "personal") ?? allowed[0] ?? null;
}
