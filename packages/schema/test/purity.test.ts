// @cb/schema's main entry is shared with the browser extension, so no node: module may be
// reachable from it. Node-only helpers live in src/node.ts (@cb/schema/node). See decisions.md.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const ENTRY = join(SRC, "index.ts");

// Specifiers of static imports/exports, dynamic import() and require().
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']([^"']+)["']/g;

/** Every source file reachable from `entry` through relative imports, with its specifiers. */
function reachable(entry: string): Map<string, string[]> {
  const seen = new Map<string, string[]>();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    const specs = [...readFileSync(file, "utf8").matchAll(SPECIFIER)].map((m) => m[1]!);
    seen.set(file, specs);
    for (const s of specs) {
      if (!s.startsWith(".")) continue;
      const ts = join(dirname(file), s.replace(/\.js$/, ".ts"));
      expect(existsSync(ts), `${relative(SRC, file)} imports ${s}`).toBe(true);
      queue.push(ts);
    }
  }
  return seen;
}

describe("@cb/schema source", () => {
  it("T03 main entry reaches no node: imports", () => {
    const files = reachable(ENTRY);
    expect(files.size).toBeGreaterThan(1);
    const offenders = [...files]
      .flatMap(([f, specs]) => specs.filter((s) => s.startsWith("node:")).map((s) => `${relative(SRC, f)}: ${s}`));
    expect(offenders).toEqual([]);
    // The Node-only subpath is not reachable from the main entry.
    expect(files.has(join(SRC, "node.ts"))).toBe(false);
  });
});
