# T20 · Eval fixtures
Depends on: T19 · Size: M · Test review: **human checks every fixture** · Security rows: —

## Goal
Ten synthetic conversations with attachments and ground truth that let the eval runner measure
recall, faithfulness, redaction, injection resistance, retrieval and coverage.

## Why
US-8, AC-24, constitution §16. Reliability must be measured, and the ground truth must come from a
spec, not from the system under test.

## Read before starting (only these)
- `specs/plan/evals.md` §Fixtures
- Skill: `eval-fixture` (load it; follow its procedure for each fixture)

## Deliverables
- `evals/seed-spec.md`: one paragraph per fixture (domain, length, planted items, attachments,
  injection, language) — write this first and **stop for the human to approve it**.
- `evals/fixtures/fx01 … fx10/` each with `transcript.json`, `truth.json`, `files/`.
- `evals/scripts/gen-files.ts`: generates attachment files deterministically (PNG, PDF, CSV).
- `evals/test/fixtures.test.ts` validating every fixture: transcript schema valid; every truth
  reference exists; planted secrets/PII/keywords actually occur in the transcript; code sha256
  values match.

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | Every fixture's transcript parses | `fixtures.test.ts › T20 transcripts valid` |
| 2 | Every truth reference (turn, part, attachment) exists | `fixtures.test.ts › T20 truth references exist` |
| 3 | Every planted keyword, secret, PII value and injection signal occurs in the transcript or its files | `fixtures.test.ts › T20 planted values present` |
| 4 | Coverage of the seed spec: ≥ 1 long (≥ 100 turns), 2 German, 3 with attachments, 2 injections (1 in a PDF), each with secrets/PII and a reversed decision | `fixtures.test.ts › T20 seed spec coverage` |

## Steps
1. Write `seed-spec.md`; stop for approval.
2. For each fixture, follow the `eval-fixture` skill: truth first, then the transcript that
   realises it (an LLM may draft dialogue; you edit to plant values exactly), then files.
3. Run the validation tests. Stop for the human to read fixtures (they are the measuring stick).

## Out of scope
The runner and metrics (T21).

## Done when
- [ ] Seed spec approved; fixtures checked by the human; tests green
- [ ] `finish-task` run

## Implementation notes
