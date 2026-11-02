# T03 · Sanitiser (`@cb/sanitizer`)
Depends on: T01, T02 · Size: M · **Test review: required** · Security rows: S5, S2 (flags)

## Goal
Pure functions that remove invisible characters and markup remnants, replace secrets and personal
data with stable placeholders, and flag instruction-like text, before any model or destination
sees the content.

## Why
AC-05 and AC-06. A leaked key is irreversible; an over-redacted brief is easy to fix. Deterministic
rules are auditable; a model-based redactor would see the secret first.

## Read before starting (only these)
- `specs/plan/sanitizer.md` (all)
- `specs/spec.md` AC-05, AC-06

## Deliverables
- `packages/sanitizer/src/invisible.ts`, `markup.ts`, `secrets.ts`, `pii.ts`, `flags.ts`,
  `entropy.ts`, `context.ts`, `index.ts` exposing the API in sanitizer.md.
- `sanitizeTranscript` sanitises every `text`, `code`, `table`, `tool_output` part and turn hashes
  are recomputed after sanitising.
- No runtime dependencies beyond `@cb/schema`. **No file or network I/O** in this package.

## Acceptance criteria → tests
Write the tests first, commit them, and stop for the human's test review.

| # | Criterion | Test (`packages/sanitizer/test/…`) |
| --- | --- | --- |
| 1 | Each listed invisible/control char is removed; `\n`, `\t` and U+200D stay | `invisible.test.ts › AC-05 invisible characters removed` |
| 2 | Tag-block characters (U+E0041 …) that spell hidden text are removed | `invisible.test.ts › AC-05 unicode tag smuggling removed` |
| 3 | `<script>`, `<style>`, HTML comments removed from text parts, untouched in code parts | `markup.test.ts › AC-05 markup remnants` |
| 4 | Each secret format in the table is replaced, including inside code parts | `secrets.test.ts › AC-05 known secret formats` |
| 5 | A 40-char random base64 token is redacted; a 40-char git SHA, a 64-char SHA-256 hex, a UUID and a long camelCase identifier are **not** | `secrets.test.ts › AC-05 entropy rule and false positives` |
| 6 | `password = hunter2hunter` → only the value redacted | `secrets.test.ts › AC-05 assignment values` |
| 7 | Valid IBAN and Luhn-valid card redacted; checksum-invalid look-alikes kept | `pii.test.ts › AC-05 checksum-validated pii` |
| 8 | Same value twice → same placeholder; different values → `_1`, `_2` per kind | `context.test.ts › AC-05 stable placeholders` |
| 9 | `unredact` restores only the requested placeholders | `context.test.ts › AC-05 unredact` |
| 10 | Each instruction pattern is flagged with its index; text is unchanged by flagging | `flags.test.ts › AC-06 instruction text flagged not deleted` |
| 11 | On `small-chat.json` and `injection-chat.json` fixtures: fake key and email gone, PINEAPPLE instruction flagged, every other character preserved | `transcript.test.ts › AC-05 AC-06 fixtures` |
| 12 | The package has no import of `fs`, `net`, `http`, `child_process` | `purity.test.ts › T03 no io imports` (scan source files) |

## Out of scope
Attachment text (T15 reuses this package). UI display of flags (T09).

## Stop and ask if
A rule from sanitizer.md produces false positives on the seed fixtures that would damage normal text.
Report the case; do not loosen a rule silently.

## Done when
- [x] Test commit reviewed by the human (`review` status), then all tests green
- [x] `pnpm check` green
- [x] `finish-task` run

## Implementation notes
- API in `packages/sanitizer/src/index.ts`: `createContext`, `sanitizeText`, `unredact` (sync) and
  `sanitizeTranscript` (**async**, WebCrypto hashes); types `Flag`, `PartFlag` (`part` = index in the
  turn), `Redaction`, `RedactionKind`, `SanitizeContext`. `flags` is keyed by turn id, flagged turns only.
- Order per part: invisible (`\r\n`/`\r` → `\n`) → markup (text and table only) → secrets (known
  formats, then assignments, then entropy) → PII → flags (indexes into the sanitised text).
  `code` and `tool_output` use `{ isCode: true }`; math, citation and attachment parts are untouched.
- PII is one leftmost-first scan (email | IBAN | number) so a checksum-failing IBAN-shaped run is never
  re-read as a card or phone number. A number is a card if 13–19 digits, Luhn-valid, no `+`/`.`; else a
  phone if `+` and 8–15 digits or 9–15 digits; else kept. Numbers next to `-`, `.`, `/` or word chars
  are skipped (UUIDs, dates, paths).
- Assignment values keep surrounding quotes and trailing `,;.:)}]`; values already a placeholder are skipped.
- Placeholder numbers are per kind per context; `unredact` replaces exact `[KIND_n]` strings only.
- Seed fixtures: only small-chat t007 changes; injection t003 gets one flag; long-chat (60 turns) is
  unchanged with no flags.
- No `node:` imports in src (purity test). Resolved after T03 (`fix(schema): browser-safe hashing`):
  `@cb/schema`'s main entry no longer reaches `node:crypto`; sync `sha256Hex` moved to `@cb/schema/node`.
  The T08 bundling concern is gone.
- Test review changes (tool_output keeps markup, `\r` normalised, quoted/indented role flags, entropy needs
  a digit or `+/=`): see decisions.md 2026-11-02 · T03.
