// Tests resolve workspace packages from src/ through the "source" export condition, so a stale or
// missing dist/ can neither fail nor falsely pass them (T09b lead, decisions.md). Builds keep using
// the import condition (dist/). The other two entries are vitest 3's defaults (Vite's server
// conditions minus "module"), which setting `conditions` would otherwise replace.
export const TEST_CONDITIONS = ["source", "node", "development|production"];

/** Vite options that apply TEST_CONDITIONS to both the client and the SSR resolver. */
export const sourceResolve = {
  resolve: { conditions: TEST_CONDITIONS },
  ssr: { resolve: { conditions: TEST_CONDITIONS } },
};
