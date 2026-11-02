// @cb/compiler must stay free of node: imports (browser-safe; see AGENTS.md §Pitfalls).
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? sourceFiles(join(dir, e.name))
      : e.name.endsWith(".ts")
        ? [join(dir, e.name)]
        : [],
  );
}

// Static imports/exports, dynamic import() and require() of a "node:" specifier.
const NODE_IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']node:/;

describe("@cb/compiler source", () => {
  it("T04 compiler imports no node: modules", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => NODE_IMPORT.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
