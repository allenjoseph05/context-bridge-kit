import { defineConfig } from "vitest/config";

// Root options only; the projects come from vitest.workspace.ts (kept by the T00 decision).
export default defineConfig({
  test: {
    // T09b: the second reporter names the file behind any error outside a test (file-level
    // failure, unhandled error or rejection), printed after the summary. Passing --reporter on
    // the command line replaces this list; add ./scripts/vitest-file-errors-reporter.ts there too.
    reporters: ["default", "./scripts/vitest-file-errors-reporter.ts"],
  },
});
