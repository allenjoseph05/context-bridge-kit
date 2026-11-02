# T18 · Ground-check and reduce
Depends on: T17 · Size: S · **Test review: required** · Security rows: S3

## Goal
Deterministic code that checks every draft against its sources, merges duplicates, resolves
reversed decisions, and assigns item IDs.

## Why
AC-11, AC-12. This is what makes a model's output trustworthy: invented items are caught by code,
not by hoping the model behaved.

## Read before starting (only these)
- `specs/plan/extractor.md` §6, §7
- `specs/plan/data-model.md` §Item, §Invariants (2)

## Deliverables
- `packages/extractor/src/normalise.ts`: NFKC, curly → straight quotes, collapse whitespace, trim.
- `packages/extractor/src/ground.ts`: `groundCheck(drafts, transcript, sanitizerFlags) → Item[]`
  (status initially `active`; flags `ungrounded`, `possible_instruction`).
- `packages/extractor/src/reduce.ts`: merge, supersession by topic, id assignment.
- `packages/extractor/src/index.ts`: `extractItems(...) = reduce(groundCheck(extractDrafts(...)))`.

## Acceptance criteria → tests
Write the tests first, commit them, and stop for the human's test review. Use hand-written drafts,
no model.

| # | Criterion | Test (`packages/extractor/test/…`) |
| --- | --- | --- |
| 1 | Evidence present (modulo whitespace, quote style, NFKC) → grounded | `ground.test.ts › AC-11 grounded evidence` |
| 2 | Evidence absent, or a non-existent source turn → `ungrounded` | `ground.test.ts › AC-11 ungrounded detected` |
| 3 | Evidence present but only in a turn not listed in `sourceTurns` → `ungrounded` | `ground.test.ts › AC-11 evidence must be in a cited turn` |
| 4 | Evidence overlapping a sanitiser instruction flag → `possible_instruction` | `ground.test.ts › AC-06 flag carried to items` |
| 5 | Two drafts with the same kind and normalised text merge; sourceTurns unioned; earliest evidence kept | `reduce.test.ts › T18 merge duplicates` |
| 6 | `small-chat.json`: "use SQLite" (t003) and "switch to Postgres" (t006), same topic → Postgres active, SQLite superseded | `reduce.test.ts › AC-12 reversed decision` |
| 7 | IDs are `i001…` in order of first source turn; deterministic across runs | `reduce.test.ts › T18 ids` |

## Out of scope
Compiling and rendering (T19).

## Stop and ask if
Topic normalisation merges decisions that are clearly different in the fixtures; report examples.

## Done when
- [ ] Test commit reviewed, then green; `pnpm check` green
- [ ] `finish-task` run

## Implementation notes
