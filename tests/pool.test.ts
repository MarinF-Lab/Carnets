import { describe, expect, it } from "vitest";
import { mapLimit } from "@/lib/pool";

describe("mapLimit", () => {
  it("mantiene el orden y respeta el límite de paralelismo", async () => {
    let running = 0;
    let max = 0;
    const progress: number[] = [];
    const out = await mapLimit(
      [50, 10, 30, 5, 20, 1],
      3,
      async (ms, i) => {
        running++;
        max = Math.max(max, running);
        await new Promise((r) => setTimeout(r, ms));
        running--;
        return i * 10;
      },
      (d) => progress.push(d),
    );
    expect(out).toEqual([0, 10, 20, 30, 40, 50]);
    expect(max).toBe(3);
    expect(progress.at(-1)).toBe(6);
  });

  it("funciona con una lista vacía", async () => {
    expect(await mapLimit([], 4, async (x) => x)).toEqual([]);
  });
});
