import { defineConfig } from "vitest/config";
import { sourceResolve } from "../../vitest.shared.js";

// Panel tests render Preact (JSX automatic runtime); they opt into jsdom per file.
// Workspace packages resolve from src/ like every other project (see vitest.shared.ts).
export default defineConfig({
  ...sourceResolve,
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  test: { include: ["test/**/*.test.{ts,tsx}"] },
});
