export type WorkspaceKind = "personal" | "business";
export type Workspace = { id: string; owner_id: string; kind: WorkspaceKind; name: string };
export type WorkspaceItem = { id: string; workspace_id: string; kind: "task" | "event" | "note"; title: string; starts_at: string | null; ends_at: string | null };
export type WorkspaceClient = {
  auth: { getUser(): Promise<{ data: { user: { id: string } | null }; error: unknown }> };
  from(table: string): any;
};
export async function loadWorkspaces(client: WorkspaceClient): Promise<Workspace[]> {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) throw new Error("authentication_required");
  const result = await client.from("os_workspaces").select("id,owner_id,kind,name").eq("owner_id",user.id);
  if (result.error) throw new Error("workspace_load_failed");
  return result.data ?? [];
}
export async function loadWorkspaceItems(client: WorkspaceClient, workspace: Workspace): Promise<WorkspaceItem[]> {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || workspace.owner_id !== user.id) throw new Error("workspace_access_denied");
  const result = await client.from("os_workspace_items").select("id,workspace_id,kind,title,starts_at,ends_at").eq("workspace_id",workspace.id);
  if (result.error) throw new Error("workspace_items_load_failed");
  return result.data ?? [];
}
export async function createWorkspaceItem(client: WorkspaceClient, workspace: Workspace, input: {
  kind: WorkspaceItem["kind"]; title: string; starts_at?: string | null; ends_at?: string | null;
}): Promise<WorkspaceItem> {
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user || workspace.owner_id !== user.id) throw new Error("workspace_access_denied");
  if (!input.title.trim() || input.title.trim().length > 180) throw new Error("invalid_title");
  const result = await client.from("os_workspace_items").insert({
    workspace_id: workspace.id, created_by: user.id, kind: input.kind,
    title: input.title.trim(), starts_at: input.starts_at ?? null, ends_at: input.ends_at ?? null,
  }).select("id,workspace_id,kind,title,starts_at,ends_at").single();
  if (result.error) throw new Error("workspace_item_create_failed");
  return result.data;
}
