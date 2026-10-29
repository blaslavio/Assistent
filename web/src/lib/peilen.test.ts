import { afterEach, describe, expect, it, vi } from "vitest";
import { peilen } from "./peilen";

describe("peilen", () => {
  afterEach(() => vi.useRealTimers());

  it("kijkt minder vaak als het stil is en weer snel na iets nieuws", async () => {
    vi.useFakeTimers();
    let nieuw = false;
    const kijk = vi.fn(async () => nieuw);
    const p = peilen(kijk, 1000, 4000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(kijk).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500 + 2250 + 3375);
    expect(kijk).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(4000);
    expect(kijk).toHaveBeenCalledTimes(5); // niet vaker dan elke 4 seconden
    nieuw = true;
    await vi.advanceTimersByTimeAsync(4000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(kijk).toHaveBeenCalledTimes(7); // na iets nieuws weer elke seconde
    p.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(kijk).toHaveBeenCalledTimes(7);
  });

  it("kijkt meteen als je iets doet na een stille periode", async () => {
    vi.useFakeTimers();
    const kijk = vi.fn(async () => false);
    const p = peilen(kijk, 1000, 8000);
    await vi.advanceTimersByTimeAsync(1000 + 1500 + 2250 + 3375);
    const voor = kijk.mock.calls.length;
    window.dispatchEvent(new Event("pointerdown"));
    await vi.advanceTimersByTimeAsync(1000);
    expect(kijk.mock.calls.length).toBe(voor + 1);
    p.stop();
  });
});
