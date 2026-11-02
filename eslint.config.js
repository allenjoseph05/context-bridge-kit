import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  globalIgnores(["**/node_modules/", "**/dist/", "**/coverage/"]),
  tseslint.configs.recommended,
  {
    // stdout is a protocol in these packages (native messaging, MCP): log to stderr only.
    files: ["packages/host/**/*.ts", "packages/mcp-server/**/*.ts"],
    rules: {
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
]);
