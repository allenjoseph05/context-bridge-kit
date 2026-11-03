# T09b · Investigate a one-off test-suite failure
Depends on: T09 · Size: S · Test review: — · Security rows: —

## Goal
Find and fix the cause of a single `pnpm check` run (during T09) in which one test file failed
while no individual test failed, or show it cannot recur.

## Why
A suite that fails without a failing test erodes trust in `pnpm check`, which every task and gate
relies on (constitution §13).

## What is known (2026-11-03, Windows 11, Node 20+, vitest workspace `packages/*`)
- Observed once, in `pnpm check` (typecheck → lint → test) right after the T09 panel commit. Summary:
  `Test Files 1 failed | 52 passed (53)`, `Tests 146 passed | 1 skipped (147)`. The failing file's
  name was not captured (output was filtered).
- A normal run has `Tests 152 passed | 1 skipped (153)`: the failing file contributed **6 passed
  tests that never reported**, i.e. it failed at file level (collection/import error, unhandled
  error, or a worker crash), not on an assertion.
- The only test file with exactly 6 tests is `packages/host/test/revise.test.ts` (new in T09). Strong
  lead, not proof. It uses `harness()` from `helpers.ts` (temp vault per test, removed in `afterEach`
  with `rmSync(..., { force: true })`) and is the first host file to load `js-tiktoken` ranks in
  its worker (~1.7 s for the first test).
- Not reproduced afterwards: 4 × `pnpm check` and 10 × `pnpm test -- --reporter=verbose`, all green.
- Candidates to check: Windows file locks (EBUSY/EPERM) on temp-dir removal; worker memory or
  timeout while loading tokenizer ranks under load; an unhandled rejection from a host call not
  awaited; a timer (e.g. a 60 s `setTimeout`) left behind. No `setTimeout` is used in host code.

## Deliverables
- A loop script or documented command that runs the suite N times and keeps the full verbose log
  of any failing run (e.g. `--reporter=verbose --reporter=junit`), plus `--sequence.shuffle` runs.
- If reproduced: the fix, and a regression test where possible. If not reproduced after ≥ 30 runs
  including shuffled and `pnpm check` runs: record that in decisions.md and close.

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | The cause is identified and fixed, or ≥ 30 clean runs are recorded | manual, Implementation notes |

## Out of scope
Changing test timeouts globally without a measured cause.

## Done when
- [ ] Criterion 1 recorded
- [ ] `finish-task` run

## Implementation notes
