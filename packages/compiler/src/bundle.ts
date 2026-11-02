// Bundle zip (compiler.md §Bundle, AC-17). Browser-safe: fflate only.
import type { ContextPack } from "@cb/schema";
import { strToU8, zipSync } from "fflate";
import type { Zippable } from "fflate";

/** A file name safe as one zip path segment: no separators, control chars or leading dots. */
function safeName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "_").replace(/^\.+/, "");
  return cleaned === "" ? "file" : cleaned;
}

/**
 * Zip with `pack.md` (the envelope), `files/<attachmentId>-<name>` for each pushed attachment
 * whose bytes are in `files` (keyed by attachment id), and `manifest.json` (the pack's manifest
 * and pushed attachments). Never contains the transcript.
 */
export function buildBundle(
  pack: ContextPack,
  envelope: string,
  files: Map<string, Uint8Array>,
): Uint8Array {
  const entries: Zippable = {
    "pack.md": strToU8(envelope),
    "manifest.json": strToU8(
      JSON.stringify({ manifest: pack.push.manifest, attachments: pack.push.attachments }, null, 2),
    ),
  };
  for (const a of pack.push.attachments) {
    const bytes = files.get(a.id);
    if (bytes !== undefined) entries[`files/${a.id}-${safeName(a.name)}`] = bytes;
  }
  // Fixed timestamp: the same pack always yields the same bytes.
  return zipSync(entries, { mtime: new Date(pack.createdAt) });
}
