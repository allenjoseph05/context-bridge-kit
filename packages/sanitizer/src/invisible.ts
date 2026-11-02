// Step 1: invisible and control characters (sanitizer.md §Steps 1).

// U+200B/C/E/F, bidi embeddings and overrides, word joiner and invisible operators, bidi isolates,
// BOM, the tag block, and C0 controls except \t and \n (\r is normalised before this runs).
const INVISIBLE =
  /[​‌‎‏‪-‮⁠-⁤⁦-⁩﻿\u{E0000}-\u{E007F}\u0000-\u0008\u000B\u000C\u000E-\u001F]/gu;

/** Normalise `\r\n` and lone `\r` to `\n`, then drop invisible and control characters. Keeps U+200D. */
export function removeInvisible(text: string): string {
  return text.replace(/\r\n?/g, "\n").replace(INVISIBLE, "");
}
