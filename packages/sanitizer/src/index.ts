// @cb/sanitizer — public API (specs/plan/sanitizer.md). Pure functions, no I/O.
import { canonicalJson, sha256HexWeb, type Part, type Transcript, type Turn } from "@cb/schema";
import { type SanitizeContext } from "./context.js";
import { findInstructionFlags, type Flag } from "./flags.js";
import { removeInvisible } from "./invisible.js";
import { stripMarkup } from "./markup.js";
import { redactPii } from "./pii.js";
import { redactSecrets } from "./secrets.js";

export { createContext, unredact } from "./context.js";
export type { Redaction, RedactionKind, SanitizeContext } from "./context.js";
export type { Flag } from "./flags.js";

/** A flag inside a transcript: `part` is the part's index in the turn, `index` an offset into its text. */
export type PartFlag = Flag & { part: number };

/**
 * Steps 1–5 in order. `isCode` skips markup stripping only (code and tool_output parts);
 * secrets, personal data and flags apply to everything. Flag indexes are into the returned text.
 */
export function sanitizeText(
  text: string,
  ctx: SanitizeContext,
  opts?: { isCode?: boolean },
): { text: string; flags: Flag[] } {
  let out = removeInvisible(text);
  if (!opts?.isCode) out = stripMarkup(out);
  out = redactSecrets(out, ctx);
  out = redactPii(out, ctx);
  return { text: out, flags: findInstructionFlags(out) };
}

function sanitizePart(part: Part, ctx: SanitizeContext): { part: Part; flags: Flag[] } {
  switch (part.kind) {
    case "text": {
      const r = sanitizeText(part.text, ctx);
      return { part: { ...part, text: r.text }, flags: r.flags };
    }
    case "table": {
      const r = sanitizeText(part.markdown, ctx);
      return { part: { ...part, markdown: r.text }, flags: r.flags };
    }
    case "code":
    case "tool_output": {
      const r = sanitizeText(part.content, ctx, { isCode: true });
      return { part: { ...part, content: r.text }, flags: r.flags };
    }
    default:
      return { part, flags: [] }; // math, citation, attachment: untouched
  }
}

/**
 * Sanitise every text, table, code and tool_output part and recompute turn hashes (WebCrypto, so it
 * runs in the extension too). The input is not mutated. `flags` lists only turns with flags.
 */
export async function sanitizeTranscript(
  t: Transcript,
  ctx: SanitizeContext,
): Promise<{ transcript: Transcript; flags: Record<string, PartFlag[]> }> {
  const flags: Record<string, PartFlag[]> = {};
  const turns: Turn[] = [];
  for (const turn of t.turns) {
    const parts: Part[] = [];
    const turnFlags: PartFlag[] = [];
    turn.parts.forEach((p, i) => {
      const r = sanitizePart(p, ctx);
      parts.push(r.part);
      for (const f of r.flags) turnFlags.push({ ...f, part: i });
    });
    if (turnFlags.length > 0) flags[turn.id] = turnFlags;
    turns.push({ ...turn, parts, sha256: await sha256HexWeb(canonicalJson(parts)) });
  }
  return { transcript: { ...t, turns }, flags };
}
