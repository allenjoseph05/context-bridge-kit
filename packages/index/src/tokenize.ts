// Lexical tokeniser for the BM25 index (plan/mcp-server.md §Retrieval index). Pure.

/** A token and the character range of the word it came from in the source text. */
export type TokenSpan = { token: string; start: number; end: number };

// Decimal numbers (`3.5`, `1.2.3`) first, then runs of letters, digits and underscores.
const WORD = /\d+(?:\.\d+)+|[\p{L}\p{N}_]+/gu;

/** Lowercased parts of one word: snake_case and camelCase pieces, then the whole word if it differs. */
function wordTokens(word: string): string[] {
  const parts = word
    .split("_")
    .flatMap((piece) =>
      piece
        .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2") // getUser → get User
        .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2") // HTTPServer → HTTP Server
        .split(" "),
    )
    .filter((p) => p !== "")
    .map((p) => p.toLowerCase());
  const whole = word.toLowerCase();
  if (parts.length === 1 && parts[0] === whole) return parts;
  return [...parts, whole];
}

/** Tokens with the span of their source word, in text order. */
export function tokenSpans(text: string): TokenSpan[] {
  const out: TokenSpan[] = [];
  for (const m of text.matchAll(WORD)) {
    const start = m.index;
    const end = start + m[0].length;
    for (const token of wordTokens(m[0])) out.push({ token, start, end });
  }
  return out;
}

/**
 * Lowercase; split on non-alphanumerics; split camelCase and snake_case identifiers into parts
 * and keep the whole identifier after them; keep numbers, including decimals such as `3.5`.
 */
export function tokenize(text: string): string[] {
  return tokenSpans(text).map((s) => s.token);
}
