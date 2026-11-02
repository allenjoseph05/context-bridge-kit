// Step 3: secrets, known formats first, then assignments, then high entropy (sanitizer.md §Steps 3).
// Applies to every sanitised part kind, code included.
import { PLACEHOLDER, placeholderFor, type SanitizeContext } from "./context.js";
import { isHighEntropyToken } from "./entropy.js";

// No token character directly before a match, so `task-…` never matches `sk-…`.
const B = "(?<![A-Za-z0-9_-])";

const KNOWN: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  new RegExp(B + String.raw`eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+`, "g"),
  new RegExp(B + "github_pat_[A-Za-z0-9_]{50,}", "g"),
  new RegExp(B + "gh[pousr]_[A-Za-z0-9]{36,}", "g"),
  new RegExp(B + "sk-ant-[A-Za-z0-9_-]{20,}", "g"),
  new RegExp(B + "sk-(?:proj-)?[A-Za-z0-9_-]{20,}", "g"),
  new RegExp(B + "AIza[0-9A-Za-z_-]{35}", "g"),
  new RegExp(B + "xox[baprs]-[A-Za-z0-9-]{10,}", "g"),
  new RegExp(B + "AKIA[0-9A-Z]{16}(?![A-Za-z0-9])", "g"),
];

// keyword, separator, then the raw value (trimmed below).
const ASSIGNMENT = /(password|passwd|secret|token|api[_-]?key)(\s*[:=]\s*)(\S+)/gi;
const LEADING_QUOTE = /^["'`]/;
const TRAILING = /[,;.:)}\]"'`]+$/;
const MIN_VALUE = 6;

const TOKEN = /[A-Za-z0-9+/_=-]{32,}/g;

/** Replace secrets with `[SECRET_n]`. */
export function redactSecrets(text: string, ctx: SanitizeContext): string {
  let out = text;
  for (const re of KNOWN) out = out.replace(re, (m) => placeholderFor(ctx, "secret", m));

  out = out.replace(ASSIGNMENT, (whole, key: string, sep: string, raw: string) => {
    const lead = LEADING_QUOTE.exec(raw)?.[0] ?? "";
    let rest = raw.slice(lead.length);
    if (PLACEHOLDER.test(rest)) return whole; // already redacted
    const trail = TRAILING.exec(rest)?.[0] ?? "";
    rest = rest.slice(0, rest.length - trail.length);
    if (rest.length < MIN_VALUE) return whole;
    return `${key}${sep}${lead}${placeholderFor(ctx, "secret", rest)}${trail}`;
  });

  return out.replace(TOKEN, (m) => (isHighEntropyToken(m) ? placeholderFor(ctx, "secret", m) : m));
}
