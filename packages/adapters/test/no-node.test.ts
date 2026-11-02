// T02: @cb/adapters runs in the extension panel (T08), so its source must not import node: modules.
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

describe("@cb/adapters source", () => {
  it("T02 adapters import no node: modules", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => NODE_IMPORT.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
