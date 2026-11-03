// esbuild config for the extension: bundles sw.ts, the panel and the content scripts into `outdir`,
// copies manifest.json, panel.html and panel.css, and writes the icons. No remote code.
//   pnpm --filter @cb/extension build      → packages/extension/dist
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deflateSync } from "node:zlib";
import { build, type BuildOptions } from "esbuild";

const ROOT = dirname(fileURLToPath(import.meta.url));
const SRC = join(ROOT, "src");
export const ICON_SIZES = [16, 48, 128] as const;

export interface BuildResult {
  /** Built file → size in bytes, relative to `outdir`. */
  files: Record<string, number>;
}

const common: BuildOptions = {
  bundle: true,
  // Bundle workspace packages from src/ ("source" export condition), so the extension build does
  // not depend on their dist/ being built first or current.
  conditions: ["source"],
  platform: "browser",
  target: "chrome120",
  jsx: "automatic",
  jsxImportSource: "preact",
  legalComments: "none",
  logLevel: "warning",
};

/** Build the unpacked extension into `outdir` (emptied first). */
export async function buildExtension(opts: { outdir: string; minify?: boolean }): Promise<BuildResult> {
  const { outdir } = opts;
  rmSync(outdir, { recursive: true, force: true });
  mkdirSync(outdir, { recursive: true });
  const minify = opts.minify ?? true;

  await build({
    ...common,
    minify,
    format: "esm",
    entryPoints: { sw: join(SRC, "sw.ts"), panel: join(SRC, "panel", "index.tsx") },
    outdir,
  });

  // One classic-script bundle per adapter, injected with chrome.scripting.executeScript (T12+).
  const contentDir = join(SRC, "content");
  const content = existsSync(contentDir) ? readdirSync(contentDir).filter((f) => f.endsWith(".ts")) : [];
  if (content.length > 0) {
    await build({
      ...common,
      minify,
      format: "iife",
      entryPoints: content.map((f) => join(contentDir, f)),
      outdir: join(outdir, "content"),
    });
  }

  copyFileSync(join(ROOT, "manifest.json"), join(outdir, "manifest.json"));
  copyFileSync(join(SRC, "panel", "panel.html"), join(outdir, "panel.html"));
  copyFileSync(join(SRC, "panel", "panel.css"), join(outdir, "panel.css"));
  mkdirSync(join(outdir, "icons"), { recursive: true });
  for (const size of ICON_SIZES) writeFileSync(join(outdir, "icons", `icon${size}.png`), iconPng(size));

  return { files: sizes(outdir) };
}

function sizes(dir: string, base = dir, out: Record<string, number> = {}): Record<string, number> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sizes(p, base, out);
    else out[relative(base, p).replace(/\\/g, "/")] = statSync(p).size;
  }
  return out;
}

// ---- Icons: a generated PNG (two overlapping rounded squares, "bridge" between two chats) ----

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function inRoundedSquare(x: number, y: number, x0: number, y0: number, s: number, r: number): boolean {
  if (x < x0 || y < y0 || x >= x0 + s || y >= y0 + s) return false;
  const cx = Math.min(Math.max(x, x0 + r), x0 + s - r);
  const cy = Math.min(Math.max(y, y0 + r), y0 + s - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}

/** RGBA PNG of `size`×`size` pixels. */
export function iconPng(size: number): Buffer {
  const s = size * 0.62;
  const r = size * 0.14;
  const rows: Buffer[] = [];
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 4); // filter byte 0
    for (let x = 0; x < size; x++) {
      const px = x + 0.5;
      const py = y + 0.5;
      const a = inRoundedSquare(px, py, 0, 0, s, r);
      const b = inRoundedSquare(px, py, size - s, size - s, s, r);
      const rgba = a && b ? [0x1d, 0x4e, 0x89, 255] : a ? [0x3b, 0x82, 0xf6, 255] : b ? [0x10, 0xb9, 0x81, 255] : [0, 0, 0, 0];
      row.set(rgba, 1 + x * 4);
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(Buffer.concat(rows))),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const outdir = join(ROOT, "dist");
  const { files } = await buildExtension({ outdir });
  let total = 0;
  for (const [f, n] of Object.entries(files).sort()) {
    total += n;
    console.log(`${(n / 1024).toFixed(1).padStart(9)} KiB  ${f}`);
  }
  console.log(`${(total / 1024).toFixed(1).padStart(9)} KiB  total → ${relative(process.cwd(), outdir) || "."}`);
}
