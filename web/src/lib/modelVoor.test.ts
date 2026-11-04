import { describe, expect, it } from "vitest";
import { modelVoor } from "./assistent";
import type { Gegevens } from "../api";

const met = (instellingen: Record<string, unknown>) => ({ taken: [], afspraken: [], volgend_id: 1, instellingen }) as unknown as Gegevens;

describe("modelVoor", () => {
  it("kiest Claude als standaard en bij Automatisch", () => {
    expect(modelVoor(met({}))).toBe("claude-opus-5-5");
    expect(modelVoor(met({ ai_model: "Automatisch" }))).toBe("claude-opus-5-5");
  });
  it("volgt de keuze voor Azure of ChatGPT", () => {
    expect(modelVoor(met({ ai_model: "Azure" }))).toBe("azure-gpt-5-mini");
    expect(modelVoor(met({ ai_model: "ChatGPT" }))).toBe("gpt-5.4");
  });
  it("gebruikt altijd Claude met een eigen sleutel", () => {
    expect(modelVoor(met({ ai_model: "ChatGPT", anthropic_sleutel: "x" }))).toBe("claude-opus-5-5");
  });
});
