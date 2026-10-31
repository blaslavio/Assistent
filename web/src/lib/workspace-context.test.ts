import { describe, expect, it } from "vitest";
import { canAccessWorkspace, filterAccessibleWorkspaces, safeWorkspaceSelection, type WorkspaceContext } from "./workspace-context";
const personal: WorkspaceContext={id:"p",kind:"personal",ownerId:"alice"};
const business: WorkspaceContext={id:"b",kind:"business",ownerId:"alice",organizationId:"org"};
const access=[{userId:"bob",workspaceId:"b",role:"staff" as const,active:true}];
describe("workspace context isolation",()=>{
 it("blocks unauthorized users and anonymous access",()=>{expect(canAccessWorkspace(personal,"bob",access,"read")).toBe(false);expect(canAccessWorkspace(business,null,access,"read")).toBe(false)});
 it("never shares personal workspaces with business members",()=>expect(canAccessWorkspace(personal,"bob",access,"read")).toBe(false));
 it("allows active staff read/write but not billing or settings",()=>{expect(canAccessWorkspace(business,"bob",access,"write")).toBe(true);expect(canAccessWorkspace(business,"bob",access,"manage_billing")).toBe(false);expect(canAccessWorkspace(business,"bob",access,"manage_settings")).toBe(false)});
 it("denies inactive memberships",()=>expect(canAccessWorkspace(business,"bob",[{...access[0],active:false}],"read")).toBe(false));
 it("denies malformed business workspaces",()=>expect(canAccessWorkspace({...business,organizationId:null},"alice",access,"read")).toBe(false));
 it("rejects unknown roles",()=>expect(canAccessWorkspace(business,"bob",[{...access[0],role:"root" as never}],"read")).toBe(false));
 it("chooses only accessible workspaces, personal first on invalid request",()=>{
   expect(safeWorkspaceSelection("b",[personal,business],"bob",access)?.id).toBe("b");
   expect(safeWorkspaceSelection("b",[personal,business],"charlie",access)).toBeNull();
   expect(safeWorkspaceSelection("unknown",[personal,business],"alice",access)?.id).toBe("p");
 });
 it("filters workspace lists",()=>expect(filterAccessibleWorkspaces([personal,business],"bob",access)).toEqual([business]));
});
