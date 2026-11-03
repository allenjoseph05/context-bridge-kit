import { defineConfig } from "vitest/config";
import { sourceResolve } from "./vitest.shared.js";

// Root options; the projects come from vitest.workspace.ts (kept by the T00 decision). Packages
// without their own vitest.config.ts inherit this file there (`extends: true`); a package with its
// own config spreads `sourceResolve` itself.
export default defineConfig({
  ...sourceResolve,
  test: {
    // Child processes that tests spawn (e.g. the real host via tsx in host/test/main.test.ts)
    // resolve workspace packages from src/ too.
    env: { NODE_OPTIONS: [process.env.NODE_OPTIONS, "--conditions=source"].filter(Boolean).join(" ") },
    // T09b: the second reporter names the file behind any error outside a test (file-level
    // failure, unhandled error or rejection), printed after the summary. Passing --reporter on
    // the command line replaces this list; add ./scripts/vitest-file-errors-reporter.ts there too.
    reporters: ["default", "./scripts/vitest-file-errors-reporter.ts"],
  },
});
