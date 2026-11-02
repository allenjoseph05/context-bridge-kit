// T05 row 8: random selections and budgets on long-chat.json; budget and coverage always hold.
// over_budget is a valid outcome only when genuine (decisions.md 2026-11-03, known limit).
import { countTokens } from "@cb/tokens";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import type { CompileInput } from "../src/compile.js";
import { checkCoverage } from "../src/coverage.js";
import { ALL_IDS, destination, input, LONG } from "./helpers.js";

const RUNS = 100;

/**
 * Check one compile. On over_budget, prove it genuine: `needed` is the smallest pack compile can
 * build (decisions.md 2026-11-03): at budget `needed` it succeeds with exactly `needed` tokens;
 * at `needed - 1` it fails.
 */
async function checkOne(over: Partial<CompileInput>, budget: number): Promise<boolean> {
  const result = await compile(input({ ...over, destination: destination(budget) }));
  if (!result.ok) {
    expect(result.error.code).toBe("over_budget");
    expect(result.error.budget).toBe(budget);
    expect(result.error.needed).toBeGreaterThan(budget);
    expect(budget).toBeLessThan(1000);

    const minimal = await compile(
      input({ ...over, destination: destination(result.error.needed) }),
    );
    expect(minimal.ok).toBe(true);
    if (minimal.ok) expect(countTokens(minimal.envelope)).toBe(result.error.needed);
    const below = await compile(
      input({ ...over, destination: destination(result.error.needed - 1) }),
    );
    expect(below.ok).toBe(false);
    return false;
  }
  const tokens = countTokens(result.envelope);
  expect(tokens).toBeLessThanOrEqual(budget);
  expect(result.pack.stats.pushedTokens).toBe(tokens);
  expect(checkCoverage(LONG, result.pack)).toEqual([]);
  return true;
}

describe("compile property", () => {
  it("AC-08 AC-09 property", async () => {
    let successes = 0;
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(ALL_IDS),
        fc.subarray(ALL_IDS, { maxLength: 5 }),
        fc.subarray(ALL_IDS, { maxLength: 5 }),
        fc.integer({ min: 500, max: 20000 }),
        fc.constantFrom("continue" as const, "rescue" as const, "second_opinion" as const),
        fc.boolean(),
        async (selection, excluded, forcedPush, budget, profile, blind) => {
          const over: Partial<CompileInput> = {
            selection,
            excluded,
            forcedPush,
            profile,
            blind: profile === "second_opinion" && blind,
          };
          if (await checkOne(over, budget)) successes += 1;
        },
      ),
      { numRuns: RUNS },
    );
    expect(successes).toBeGreaterThanOrEqual(RUNS * 0.8);

    // Worst case for the manifest: every other turn selected, so no two manifest turns are
    // consecutive (60 single entries), with and without blind. Never over_budget at 1,000.
    const scattered = ALL_IDS.filter((_, i) => i % 2 === 0);
    const worst: Array<Partial<CompileInput>> = [
      { selection: scattered },
      { selection: ALL_IDS.filter((_, i) => i % 2 === 1) },
      { selection: scattered, excluded: ALL_IDS.slice(0, 5), forcedPush: ALL_IDS.slice(55) },
      { selection: ALL_IDS, profile: "second_opinion", blind: true },
      { selection: ALL_IDS.filter((_, i) => i % 4 === 0), profile: "second_opinion", blind: true },
    ];
    for (const over of worst) expect(await checkOne(over, 1000)).toBe(true);
  }, 120_000);
});
