import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/", "**/dist/", "**/coverage/"]),
  tseslint.configs.recommended,
  {
    // Exported functions declare their return types (AGENTS.md §Conventions).
    files: ["**/*.ts"],
    rules: {
      "@typescript-eslint/explicit-module-boundary-types": "error",
    },
  },
  {
    // stdout is a protocol in these packages (native messaging, MCP): log to stderr only.
    files: ["packages/host/**/*.ts", "packages/mcp-server/**/*.ts"],
    rules: {
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
]);
