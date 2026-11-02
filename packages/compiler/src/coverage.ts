// Coverage invariant (data-model.md §Invariants 3, AC-09).
import { ATTACHMENT_ID } from "@cb/schema";
import type { ContextPack, Transcript } from "@cb/schema";

/** Turn ids named by a manifest ref: `t005` → [t005], `t003-t005` → [t003, t004, t005]. */
function turnIdsOf(ref: string): string[] {
  const m = /^t(\d{3})(?:-t(\d{3}))?$/.exec(ref);
  if (m === null) return [];
  const from = Number(m[1]);
  const to = m[2] !== undefined ? Number(m[2]) : from;
  const ids: string[] = [];
  for (let n = from; n <= to; n += 1) ids.push(`t${String(n).padStart(3, "0")}`);
  return ids;
}

/**
 * Ids of turns and attachments in `transcript` that `pack` neither pushes nor lists in its
 * manifest, in transcript order. `[]` means the invariant holds.
 */
export function checkCoverage(transcript: Transcript, pack: ContextPack): string[] {
  const covered = new Set<string>([
    ...pack.push.recentTurns.map((t) => t.id),
    ...pack.push.attachments.map((a) => a.id),
  ]);
  for (const entry of pack.push.manifest) {
    if (ATTACHMENT_ID.test(entry.ref)) covered.add(entry.ref);
    for (const id of turnIdsOf(entry.ref)) covered.add(id);
  }
  return [...transcript.turns, ...transcript.attachments]
    .map((x) => x.id)
    .filter((id) => !covered.has(id));
}
