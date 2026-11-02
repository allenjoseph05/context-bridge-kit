// High-entropy token rule (sanitizer.md §Steps 3, "High entropy").

export const MIN_TOKEN_LENGTH = 32;
export const MIN_ENTROPY = 4.2;

/** Shannon entropy in bits per character. */
export function shannonEntropy(s: string): number {
  if (s.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let h = 0;
  for (const c of counts.values()) {
    const p = c / s.length;
    h -= p * Math.log2(p);
  }
  return h;
}

/**
 * True for a token of ≥ 32 chars from `[A-Za-z0-9+/_=-]` with entropy ≥ 4.2 bits/char, at least two
 * character classes, and at least one digit or one of `+ / =` (keeps long camelCase identifiers).
 */
export function isHighEntropyToken(token: string): boolean {
  if (token.length < MIN_TOKEN_LENGTH || !/^[A-Za-z0-9+/_=-]+$/.test(token)) return false;
  if (!/[0-9+/=]/.test(token)) return false;
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[+/_=-]/].filter((re) => re.test(token)).length;
  if (classes < 2) return false;
  return shannonEntropy(token) >= MIN_ENTROPY;
}
