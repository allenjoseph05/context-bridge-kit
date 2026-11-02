# T05 · Compiler: verbatim mode, coverage, bundle
Depends on: T03, T04 · Size: M · **Test review: required** · Security rows: S4

## Goal
`compile()` produces a valid `ContextPack` in **verbatim mode** within budget, with a complete
manifest, plus the bundle zip builder. Condensed mode arrives in T19 on top of this.

## Why
AC-08, AC-09, AC-10, AC-17. Verbatim must work end to end before any model is involved, so a
missing or weak model can never break delivery.

## Read before starting (only these)
- `specs/plan/compiler.md` §API, §Verbatim mode, §Bundle, last line of §Priority order (unselected,
  ungrounded)
- `specs/plan/data-model.md` §Destination and pack, §Invariants

## Deliverables
- `packages/compiler/src/compile.ts`: `compile(input)` handling `mode: "verbatim"` for all three
  profiles; `mode: "condensed"` throws `NotImplementedError("T19")`.
  - Recent turns: selected turns newest first; each turn whole or not at all.
  - Artifacts list: every code/table/math part inside pushed turns, with `sha256` of its content.
  - Manifest: every non-pushed turn (ranges for consecutive turns with the same `why`),
    every attachment not pushed (`unavailable` if its status is `listed`/`unavailable`).
  - `stats` filled; `pushedTokens` counted on the rendered envelope (render, count, drop the oldest
    pushed turn, repeat until it fits).
- `packages/compiler/src/coverage.ts`: `checkCoverage(transcript, pack): string[]` returns the IDs
  not covered (used by tests and by the host as an assertion).
- `packages/compiler/src/bundle.ts`: `buildBundle(pack, envelope, files)` using `fflate`.
- Dependencies: `fflate`, `@cb/tokens`, `@cb/schema`.

## Acceptance criteria → tests
Write the tests first, commit them, and stop for the human's test review.

| # | Criterion | Test (`packages/compiler/test/…`) |
| --- | --- | --- |
| 1 | For `long-chat.json` and budgets 500, 2,000 and 20,000: rendered envelope tokens ≤ budget | `compile.test.ts › AC-08 never over budget` |
| 2 | `checkCoverage` returns `[]` for every pack produced in the tests | `compile.test.ts › AC-09 coverage invariant` |
| 3 | Consecutive non-pushed turns collapse into range entries; unselected turns have `why: "excluded_by_user"` | `compile.test.ts › AC-09 manifest ranges and reasons` |
| 4 | Every artifact's content equals the source part and its sha256 matches; a turn with a code block is never partially included | `compile.test.ts › AC-10 artifacts byte-identical and whole` |
| 5 | Pushed turns are the most recent selected ones, newest first | `compile.test.ts › T05 recency order` |
| 6 | `mode: "condensed"` throws `NotImplementedError` mentioning T19 | `compile.test.ts › T05 condensed not yet` |
| 7 | Bundle zip contains `pack.md` equal to the envelope, `files/<id>-<name>` for given files, `manifest.json` that parses; no transcript file | `bundle.test.ts › AC-17 bundle contents` |
| 8 | Property test (100 random selections and budgets on `long-chat.json`): budget and coverage always hold | `compile.property.test.ts › AC-08 AC-09 property` (use `fast-check`, dev dependency) |

## Out of scope
Items and priority order (T19). Attachments' excerpts and images (T16). IDs/dates/pull refs are
filled by the host (T07): accept them as input parameters here.

## Stop and ask if
The budget cannot be met even with zero pushed turns (header + manifest alone too large). Propose
compacting the manifest further; do not silently drop manifest entries.

## Done when
- [ ] Test commit reviewed, then green; `pnpm check` green
- [ ] `finish-task` run

## Implementation notes
