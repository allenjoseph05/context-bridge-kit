// T05 row 8: random selections and budgets on long-chat.json; budget and coverage always hold.
import { countTokens } from "@cb/tokens";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { compile } from "../src/compile.js";
import { checkCoverage } from "../src/coverage.js";
import { ALL_IDS, destination, input, LONG } from "./helpers.js";

describe("compile property", () => {
  it("AC-08 AC-09 property", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.subarray(ALL_IDS),
        fc.subarray(ALL_IDS, { maxLength: 5 }),
        fc.subarray(ALL_IDS, { maxLength: 5 }),
        fc.integer({ min: 500, max: 20000 }),
        fc.constantFrom("continue" as const, "rescue" as const, "second_opinion" as const),
        fc.boolean(),
        async (selection, excluded, forcedPush, budget, profile, blind) => {
          const result = await compile(
            input({
              selection,
              excluded,
              forcedPush,
              profile,
              blind: profile === "second_opinion" && blind,
              destination: destination(budget),
            }),
          );
          if (!result.ok) {
            // Only allowed when header + manifest alone exceed the budget (card: "Stop and ask").
            expect(result.error.code).toBe("over_budget");
            expect(result.error.needed).toBeGreaterThan(budget);
            return;
          }
          const tokens = countTokens(result.envelope);
          expect(tokens).toBeLessThanOrEqual(budget);
          expect(result.pack.stats.pushedTokens).toBe(tokens);
          expect(checkCoverage(LONG, result.pack)).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  }, 60_000);
});
