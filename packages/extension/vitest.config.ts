import { defineConfig } from "vitest/config";

// Panel tests render Preact (JSX automatic runtime); they opt into jsdom per file.
export default defineConfig({
  esbuild: { jsx: "automatic", jsxImportSource: "preact" },
  test: { include: ["test/**/*.test.{ts,tsx}"] },
});
