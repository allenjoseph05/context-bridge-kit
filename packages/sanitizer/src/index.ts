// @cb/sanitizer — public API (specs/plan/sanitizer.md). Stub: implementation follows the test review.
import type { Transcript } from "@cb/schema";

export type RedactionKind = "secret" | "email" | "phone" | "iban" | "card";
/** `value` lives in memory only; never serialised or written to disk. */
export type Redaction = { placeholder: string; kind: RedactionKind; value: string };
export type Flag = { kind: "possible_instruction"; match: string; index: number };
/** A flag inside a transcript: `part` is the part's index in the turn, `index` an offset into its text. */
export type PartFlag = Flag & { part: number };
/** One per session. Keyed by the original value. */
export type SanitizeContext = { redactions: Map<string, Redaction> };

export function createContext(): SanitizeContext {
  throw new Error("not implemented (T03)");
}

export function sanitizeText(
  _text: string,
  _ctx: SanitizeContext,
  _opts?: { isCode?: boolean },
): { text: string; flags: Flag[] } {
  throw new Error("not implemented (T03)");
}

export function sanitizeTranscript(
  _t: Transcript,
  _ctx: SanitizeContext,
): Promise<{ transcript: Transcript; flags: Record<string, PartFlag[]> }> {
  return Promise.reject(new Error("not implemented (T03)"));
}

export function unredact(_text: string, _placeholders: string[], _ctx: SanitizeContext): string {
  throw new Error("not implemented (T03)");
}
