import { describe, expect, it } from "vitest";
import { chatDelenVan } from "./chatdelen";

describe("chatDelenVan", () => {
  it("geeft standaard een korte rij", () => expect(chatDelenVan(undefined)).toEqual(["chats", "communitys", "oproepen"]));
  it("houdt Chats altijd en de vaste volgorde", () =>
    expect(chatDelenVan(["oproepen", "projecten", "onzin"])).toEqual(["chats", "projecten", "oproepen"]));
  it("mag leeg zijn: dan alleen Chats", () => expect(chatDelenVan([])).toEqual(["chats"]));
});
