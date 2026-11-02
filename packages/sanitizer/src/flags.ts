// Step 5: instruction-like text is flagged, never removed (sanitizer.md §Steps 5, AC-06).

export type Flag = { kind: "possible_instruction"; match: string; index: number };

const PATTERNS: RegExp[] = [
  /ignore (?:all |any )?(?:previous|prior|above) (?:instructions|prompts)/gi,
  /disregard (?:the|all|your) /gi,
  /you are now/gi,
  /new instructions:/gi,
  /system prompt/gi,
  /<\|im_start\|>/gi,
  /\[INST\]/gi,
  // Role marker at line start; leading whitespace and > quote markers allowed before it.
  /(?<=^[ \t>]*)(?:system|assistant|developer)[ \t]*:/gim,
];

/** All instruction-like matches in `text`, in index order. */
export function findInstructionFlags(text: string): Flag[] {
  const flags: Flag[] = [];
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      flags.push({ kind: "possible_instruction", match: m[0], index: m.index });
    }
  }
  return flags.sort((a, b) => a.index - b.index);
}
