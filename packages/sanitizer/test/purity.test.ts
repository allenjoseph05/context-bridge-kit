// T03 row 12: @cb/sanitizer does no file or network I/O, and imports no node: module
// (it runs in the extension too; see decisions.md 2026-11-02 · T03).
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

// Static imports/exports, dynamic import() and require().
const SPEC = String.raw`(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*)["']`;
const IO_IMPORT = new RegExp(
  SPEC + String.raw`(?:node:)?(?:fs|net|http|https|http2|child_process|dgram|tls)(?:/[^"']*)?["']`,
);
const NODE_IMPORT = new RegExp(SPEC + "node:");
// Global network APIs that need no import.
const NETWORK_GLOBAL = /\bfetch\s*\(|\bXMLHttpRequest\b|\bWebSocket\b|\bEventSource\b/;

describe("@cb/sanitizer source", () => {
  it("T03 no io imports", () => {
    const files = sourceFiles(SRC);
    expect(files.length).toBeGreaterThan(0);
    const offenders = files.filter((f) => {
      const src = readFileSync(f, "utf8");
      return IO_IMPORT.test(src) || NODE_IMPORT.test(src) || NETWORK_GLOBAL.test(src);
    });
    expect(offenders).toEqual([]);
  });
});
