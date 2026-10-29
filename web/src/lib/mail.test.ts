import { describe, expect, it } from "vitest";
import { antwoordOnderwerp } from "./mail";

describe("mail", () => {
  it("zet Re: er één keer voor", () => {
    expect(antwoordOnderwerp("Etentje vrijdag?")).toBe("Re: Etentje vrijdag?");
    expect(antwoordOnderwerp("Re: Etentje")).toBe("Re: Etentje");
    expect(antwoordOnderwerp("ANTW: Factuur")).toBe("ANTW: Factuur");
  });
});
