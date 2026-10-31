import { describe, expect, it } from "vitest";
import { quoteCart, type CatalogItem } from "./universal-commerce-engine";
const base: CatalogItem = { id:"a", workspaceId:"business-1", kind:"physical", title:"Gloves", priceMinor:2599, currency:"EUR", active:true, inventory:5 };
describe("Universal Commerce Engine", () => {
  it("quotes integer minor units", () => expect(quoteCart("business-1",[base],[{itemId:"a",quantity:2}]).subtotalMinor).toBe(5198));
  it("rejects cross-workspace products", () => expect(()=>quoteCart("private",[base],[{itemId:"a",quantity:1}])).toThrow("item_unavailable"));
  it("rejects tampered quantities", () => expect(()=>quoteCart("business-1",[base],[{itemId:"a",quantity:-1}])).toThrow("invalid_quantity"));
  it("rejects insufficient stock", () => expect(()=>quoteCart("business-1",[base],[{itemId:"a",quantity:6}])).toThrow("insufficient_inventory"));
  it("rejects duplicate lines", () => expect(()=>quoteCart("business-1",[base],[{itemId:"a",quantity:1},{itemId:"a",quantity:1}])).toThrow("duplicate_cart_line"));
  it("rejects mixed currency", () => expect(()=>quoteCart("business-1",[base,{...base,id:"b",currency:"USD"}],[{itemId:"a",quantity:1},{itemId:"b",quantity:1}])).toThrow("mixed_currency"));
  it("rejects overflow", () => expect(()=>quoteCart("business-1",[{...base,priceMinor:Number.MAX_SAFE_INTEGER,inventory:null}],[{itemId:"a",quantity:2}])).toThrow("amount_overflow"));
});
