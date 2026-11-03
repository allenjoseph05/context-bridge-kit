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
- [x] Criterion 1 recorded
- [x] `finish-task` run

## Implementation notes
- Not reproduced; criterion 1 met by clean runs (Win 11, Node 25.2.1, vitest 3.2.7), all exit 0, no
  `[file-errors]` line: revise.test.ts ×50, `@cb/host` ×20, full suite ×20, shuffled ×15, `pnpm check` ×5,
  hanging-process ×1 (no open handles), `@cb/host` ×9 and full ×4 during forced `tsc -b`/extension rebuilds.
  45 full-suite runs, 124 overall.
- Planted failures: SIGKILLed worker → vitest aborts with no summary (not the observed run); afterAll/
  afterEach error → file fails but tests count as passed; unhandled rejection → `Errors 1 error` line.
  Only an import/collection error gives the observed signature (file failed, its tests uncounted).
- Lead (left to the human, decisions.md): tests import workspace packages from compiled `dist/`
  (exports); without `packages/schema/dist` 8/9 host files fail at import. A missing, stale or
  half-written `dist/` matches the signature.
- Instrumentation: root `vitest.config.ts` adds `scripts/vitest-file-errors-reporter.ts` after
  `default`; it prints `[file-errors]` lines after the summary (file-level failures and unhandled
  errors with their file). Passing `--reporter` on the CLI replaces the list, so add it there too.
- `scripts/stress-tests.ps1 -Mode full|shuffle|check|revise|host|hanging -Runs N [-LogDir]` keeps
  logs + JUnit XML of failing runs and a summary.csv (default `%TEMP%\cb-stress`). No .sh twin.
- `vitest.workspace.ts` kept (T00 decision); its deprecation notice is expected.
- Follow-up (same day): the `dist/` lead is closed. Tests resolve workspace packages from `src/` via
  a `"source"` export condition (vitest.shared.ts, vitest.workspace.ts, NODE_OPTIONS for spawned
  processes, esbuild in the extension build); see decisions.md. A missing or stale `dist/` can no
  longer fail or falsely pass `pnpm test`.
