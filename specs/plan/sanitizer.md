# Sanitiser (`@cb/sanitizer`)

Pure functions, no I/O. Runs on every text-bearing part and every extracted file text **before any
model sees it** (AC-05, AC-06). Bundled into both the host and the extension (no-host fallback).

## API
```ts
type Redaction = { placeholder: string; kind: RedactionKind; value: string };   // value: memory only
type RedactionKind = "secret" | "email" | "phone" | "iban" | "card";
type Flag = { kind: "possible_instruction"; match: string; index: number };

type SanitizeContext = { redactions: Map<string, Redaction> };   // one per session, keyed by value
function createContext(): SanitizeContext;
function sanitizeText(text: string, ctx: SanitizeContext,
                      opts?: { isCode?: boolean }): { text: string; flags: Flag[] };
function sanitizeTranscript(t: Transcript, ctx: SanitizeContext): { transcript: Transcript; flags: Record<string, Flag[]> };
function unredact(text: string, placeholders: string[], ctx: SanitizeContext): string;
```

## Steps, in this order
1. **Invisible and control characters** — remove U+200B, U+200C, U+200E, U+200F, U+202A–U+202E,
   U+2060–U+2064, U+2066–U+2069, U+FEFF, the tag block U+E0000–U+E007F, and C0 controls except
   `\n`, `\t`. Keep U+200D (zero-width joiner, used in emoji).
2. **Markup remnants** (text parts only, not code) — remove `<script>…</script>`, `<style>…</style>`,
   and HTML comments.
3. **Secrets** — known formats first, then high entropy. Applies to code parts too.
   | Kind | Pattern (indicative) |
   | --- | --- |
   | AWS access key | `AKIA[0-9A-Z]{16}` |
   | GitHub token | `gh[pousr]_[A-Za-z0-9]{36,}`, `github_pat_[A-Za-z0-9_]{50,}` |
   | OpenAI / Anthropic | `sk-(proj-)?[A-Za-z0-9_-]{20,}`, `sk-ant-[A-Za-z0-9_-]{20,}` |
   | Google API key | `AIza[0-9A-Za-z_-]{35}` |
   | Slack | `xox[baprs]-[A-Za-z0-9-]{10,}` |
   | JWT | `eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+` |
   | Private key | `-----BEGIN [A-Z ]*PRIVATE KEY-----` … `-----END [A-Z ]*PRIVATE KEY-----` |
   | Assignment | `(password\|passwd\|secret\|token\|api[_-]?key)\s*[:=]\s*\S{6,}` → redact the value only |
   | High entropy | token of ≥ 32 chars from `[A-Za-z0-9+/_=-]`, Shannon entropy ≥ 4.2 bits/char, ≥ 2 character classes |
   Hex hashes (git SHAs, SHA-256) have entropy ≤ 4.0 and must **not** be redacted.
4. **Personal data** — emails; phone numbers (E.164 or national with ≥ 9 digits); IBANs validated by
   mod-97 checksum; card numbers 13–19 digits validated by Luhn. Unvalidated look-alikes stay.
5. **Instruction flags** — case-insensitive patterns, flagged not removed:
   `ignore (all |any )?(previous|prior|above) (instructions|prompts)`, `disregard (the|all|your) `,
   `you are now`, `new instructions:`, `system prompt`, `<\|im_start\|>`, `\[INST\]`,
   line-start `(system|assistant|developer)\s*:` inside a turn's text.

## Placeholders
`[SECRET_1]`, `[EMAIL_1]`, `[PHONE_1]`, `[IBAN_1]`, `[CARD_1]`; numbering per kind, per session.
The same value always maps to the same placeholder within a session. Values live only in the
in-memory `SanitizeContext`; `unredact` is used when the user toggles a redaction off at review.
Nothing in this package writes to disk.

## Why deterministic
A model-based redactor would see the secret before hiding it, and its recall cannot be guaranteed.
Pattern rules are auditable and testable; their known gap (unusual personal data in free text) is
stated as a limitation.
