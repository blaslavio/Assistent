import {describe,it,expect} from "vitest";
import {volgendePlekStatus} from "./recent-acties";
describe("recent workspace actions",()=>{
 const initial={archived:[],removed:[]};
 it("archives without deleting the underlying item",()=>expect(volgendePlekStatus(initial,"app:documenten","archive")).toEqual({archived:["app:documenten"],removed:[]}));
 it("removes from recent without archiving",()=>expect(volgendePlekStatus(initial,"project:42","remove")).toEqual({archived:[],removed:["project:42"]}));
 it("restores archived entries",()=>expect(volgendePlekStatus({archived:["app:documenten"],removed:[]},"app:documenten","restore")).toEqual(initial));
 it("keeps actions mutually exclusive",()=>expect(volgendePlekStatus({archived:["project:42"],removed:[]},"project:42","remove")).toEqual({archived:[],removed:["project:42"]}));
 it("rejects malformed keys",()=>expect(()=>volgendePlekStatus(initial,"../invalid","archive")).toThrow());
});
