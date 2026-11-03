// S7: the built manifest asks for exactly the permissions in specs/plan/extension.md §Manifest.
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildExtension } from "../build.js";

const SPEC = fileURLToPath(new URL("../../../specs/plan/extension.md", import.meta.url));

/** The JSON block under "## Manifest" in extension.md. */
function specManifest(): Record<string, unknown> {
  const md = readFileSync(SPEC, "utf8");
  const section = md.slice(md.indexOf("## Manifest"));
  const m = /```json\r?\n([\s\S]*?)```/.exec(section);
  if (!m?.[1]) throw new Error("no JSON block under ## Manifest in extension.md");
  return JSON.parse(m[1]) as Record<string, unknown>;
}

let out: string;
let built: Record<string, unknown>;

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "cb-ext-"));
  await buildExtension({ outdir: out });
  built = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")) as Record<string, unknown>;
}, 120_000);

afterAll(() => {
  rmSync(out, { recursive: true, force: true });
});

describe("manifest", () => {
  it("S7 manifest minimal", () => {
    const spec = specManifest();
    expect(built.permissions).toEqual(spec.permissions);
    expect(built.host_permissions).toEqual(spec.host_permissions);
    for (const extra of ["optional_permissions", "optional_host_permissions", "content_scripts",
      "externally_connectable", "web_accessible_resources"]) {
      expect(built, extra).not.toHaveProperty(extra);
    }
    // Everything else as specified, apart from the generated key and the icons.
    const { key: builtKey, icons, ...rest } = built;
    const { key: _specKey, ...specRest } = spec;
    void _specKey;
    expect(rest).toEqual(specRest);
    expect(builtKey).toMatch(/^[A-Za-z0-9+/]{200,}={0,2}$/);
    expect(icons).toBeTypeOf("object");
  });

  it("S7 manifest minimal: every referenced file is in the build", () => {
    const icons = Object.values(built.icons as Record<string, string>);
    for (const f of ["sw.js", "panel.html", "panel.js", ...icons]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    const html = readFileSync(join(out, "panel.html"), "utf8");
    expect(html).toContain('src="panel.js"');
    // No inline script (CSP script-src 'self'): every <script> tag loads a file.
    const tags = html.match(/<script\b[^>]*>/g) ?? [];
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.filter((t) => !/\bsrc=/.test(t))).toEqual([]);
  });
});
