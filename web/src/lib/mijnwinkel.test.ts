import { describe, expect, it } from "vitest";
import { webadres } from "./mijnwinkel";

describe("webadres", () => {
  it("maakt een geldig adres van de naam", () => {
    expect(webadres("Bakkerij De Zon")).toBe("bakkerij-de-zon");
    expect(webadres("Café Ñandú & Zoon!")).toBe("cafe-nandu-zoon");
    expect(webadres("  --Fit--  ")).toBe("fit");
    expect(webadres("a".repeat(40)).length).toBe(30);
  });
});
