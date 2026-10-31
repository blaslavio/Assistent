import {describe,it,expect} from "vitest";
import {EVENT_TYPES,findEventType} from "./event-types";
describe("event categories",()=>{
 it("includes birthdays, reunions and sports",()=>expect(["birthday","reunion","sports"].every(id=>EVENT_TYPES.some(x=>x.id===id))).toBe(true));
 it("provides appropriate tools for a reunion",()=>expect(findEventType("reunion").tools).toContain("datumprikker"));
 it("falls back to custom events",()=>expect(findEventType("unknown").id).toBe("other"));
 it("uses unique identifiers",()=>expect(new Set(EVENT_TYPES.map(x=>x.id)).size).toBe(EVENT_TYPES.length);
});
