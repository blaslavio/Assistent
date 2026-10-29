import { describe, expect, it } from "vitest";
import { puzzelOplossen, sha256 } from "./aanmelden";

const hex = (h: Uint32Array) => Array.from(h, (w) => w.toString(16).padStart(8, "0")).join("");
const echt = async (t: string) => new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)));
const echtHex = async (t: string) => Array.from(await echt(t), (b) => b.toString(16).padStart(2, "0")).join("");

describe("sha256", () => {
  it("geeft hetzelfde als de standaard, ook voor lange teksten en tekens buiten ASCII", async () => {
    for (const t of ["", "abc", "a".repeat(55), "a".repeat(56), "b".repeat(200), "café ✓ 1234567890"])
      expect(hex(sha256(t))).toBe(await echtHex(t));
  });
});

describe("puzzelOplossen", () => {
  it("vindt een getal waarvan de hash met genoeg nul-bits begint, zoals de database controleert", async () => {
    const zout = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
    const n = await puzzelOplossen(zout, 12);
    const h = await echt(zout + n);
    expect(new DataView(h.buffer).getUint32(0) >>> 20).toBe(0);
  });
});
