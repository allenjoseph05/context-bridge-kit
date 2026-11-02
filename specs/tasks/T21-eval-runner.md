# T21 · Eval runner and results
Depends on: T20 · Size: M · Test review: — · **Gate G5** · Security rows: S2, S3, S5

## Goal
`pnpm eval` runs every fixture through every configuration offline and writes a results table with
the metrics from the plan, labelled honestly.

## Why
AC-24, US-8. The demo shows measured quality per token, not adjectives; ablations justify the
defaults.

## Read before starting (only these)
- `specs/plan/evals.md` §Configurations, §Metrics, §Output
- `specs/plan/compiler.md` §Token counting (budget numbers to tune)

## Human prerequisites
- Ollama running with the model from `decisions.md` (T17).

## Deliverables
- `evals/src/run.ts`: loads fixtures; for each config builds the pack through the same packages the
  host uses (sanitizer → attachments → extractor → compiler; no extension); computes metrics.
- `evals/src/metrics/*.ts`: one file per metric in evals.md, deterministic ones unit-tested.
- Destination stand-in: the local model answers probes from the envelope (labelled **Mocked**).
- Non-deterministic metrics run 3 times: mean and range.
- `evals/results/<date>.md` and `.json`; a table metric × config with the proposed targets from the
  needs doc beside the measured values; a short "What this shows / limitations" paragraph.
- Root `pnpm eval` wired; `pnpm eval -- --quick` runs 3 fixtures × 2 configs for fast checks.

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | Each deterministic metric returns known values on a tiny hand-built case | `evals/test/metrics.test.ts › AC-24 deterministic metrics` |
| 2 | Redaction metric scans envelope, vault files and audit log | `metrics.test.ts › AC-05 redaction everywhere` |
| 3 | Results markdown contains every metric row and every config column; Mocked/Inferred labels present | `evals/test/report.test.ts › AC-24 report shape` |
| 4 | `--quick` completes offline (no non-loopback request; enforce by a fetch guard in the runner) | `evals/test/offline.test.ts › AC-23 offline` |
| 5 | Manual: full `pnpm eval` run; results committed | record runtime and headline numbers in notes |

## Gate G5 (run `gate-check`)
Results table exists and is readable. If budgets are tuned from the ablation, update the numbers
in `specs/plan/compiler.md` and log the decision.

## Out of scope
Changing extractor prompts to raise scores (that is a new task; log ideas in notes).

## Stop and ask if
A metric is far below its target; report it, do not tweak the fixtures or metrics to pass.

## Done when
- [ ] Tests pass; `pnpm check` green; results committed; G5 recorded
- [ ] `finish-task` run

## Implementation notes
