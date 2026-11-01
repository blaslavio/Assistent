import { describe, expect, it } from "vitest";
import { gekozenAiModel } from "./assistent";
import type { Gegevens } from "../api";

const data = (instellingen: Record<string, unknown>) => ({ instellingen }) as unknown as Gegevens;

describe("AI provider routing", () => {
  it("keeps Claude as the backwards-compatible default", () => {
    expect(gekozenAiModel(data({}))).toBe("claude-opus-5-5");
  });
  it("supports Azure GPT-5-mini for platform users", () => {
    expect(gekozenAiModel(data({ ai_model: "azure-gpt-5-mini" }))).toBe("azure-gpt-5-mini");
  });
  it("supports OpenAI for platform users", () => {
    expect(gekozenAiModel(data({ ai_model: "gpt-5.4" }))).toBe("gpt-5.4");
  });
  it("preserves direct Claude connections with a personal key", () => {
    expect(gekozenAiModel(data({ anthropic_sleutel: "private-key", ai_model: "azure-gpt-5-mini" }))).toBe("claude-opus-5-5");
  });
  it("rejects unknown provider identifiers", () => {
    expect(gekozenAiModel(data({ ai_model: "not-a-real-provider" }))).toBe("claude-opus-5-5");
  });
});
