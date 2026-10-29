import { expect, it, vi } from "vitest";
const maak = vi.hoisted(() => vi.fn().mockResolvedValue({ stop_reason: "end_turn", content: [{ type: "text", text: "Controleer de open vraag." }] }));
vi.mock("@anthropic-ai/sdk", () => ({ default: class { messages = { create: maak }; } }));
const sessie = vi.hoisted(() => ({ naam: "test", token: "test-only" }));
vi.mock("../api", async origineel => ({ ...await origineel<object>(), huidigeSessie: () => sessie }));
import { projectHulp } from "./assistent";

it("stuurt uitsluitend gecontroleerde projectcontext zonder hulpmiddelen of geheugen", async () => {
  const data = { taken: [], afspraken: [], volgend_id: 1, geheugen: [{ feit: "PRIVE-NIET-MEESTUREN" }], instellingen: { anthropic_sleutel: "test-only" } };
  expect(await projectHulp(data, "[bron:chatbericht-7] Goedgekeurde projectcontext")).toContain("Controleer");
  const r = maak.mock.calls[0][0];
  expect(r.messages).toEqual([{ role: "user", content: "[bron:chatbericht-7] Goedgekeurde projectcontext" }]);
  expect(r.tools).toBeUndefined(); expect(JSON.stringify(r)).not.toContain("PRIVE-NIET-MEESTUREN");
});
