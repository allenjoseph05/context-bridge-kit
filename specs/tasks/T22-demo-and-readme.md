# T22 · Demo hardening and README
Depends on: T21 · Size: S · Test review: — · Security rows: all (verification)

## Goal
Someone else can install, run and understand the prototype in 15 minutes, and every claim is
labelled Built, Mocked or Inferred, as the brief demands.

## Why
The brief: "Be transparent about what you built, tested, simulated, or inferred." The interview
presentation runs from this.

## Read before starting (only these)
- `specs/spec.md` (acceptance criteria list only)
- `specs/plan/security.md`
- `evals/results/<latest>.md`
- `docs/design/technical-design.md` §Demo script (if present)

## Deliverables
- `README.md`: one-paragraph summary; architecture diagram (ASCII or Mermaid); install
  (pnpm, Ollama model, extension key, host install, Claude Desktop config); usage per route;
  **status table** of every AC with Built / Mocked / Inferred and its test; eval headline numbers;
  limitations (from security.md known limits and evals); next steps.
- `docs/demo-checklist.md`: the demo steps with expected results and the fallback for each
  (recorded video if a live site misbehaves).
- `scripts/doctor.ts` (`pnpm doctor`): checks Node, pnpm, host manifest installed, extension ID
  in config, Ollama reachable and model present, vault permissions, Claude Desktop config contains
  the server; prints a pass/fail list.
- `scripts/check-no-listener.sh`: runs the host and MCP server and shows `lsof -i` has no entry
  for them (AC-20).

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | README status table lists every AC-01…AC-25 exactly once | `test/readme.test.ts › T22 all ACs listed` |
| 2 | `pnpm doctor` exits non-zero when a check fails and names it | `test/doctor.test.ts › T22 doctor` |
| 3 | No-listener check passes | run it; paste output in notes |
| 4 | A fresh clone following only the README reaches G1 | human dry run |

## Out of scope
New features. Polishing UI beyond fixing anything that blocks the demo.

## Done when
- [ ] Tests pass; `pnpm check` green; human dry run done
- [ ] `finish-task` run; all tasks `done` or `cut` in `tasks.md`

## Implementation notes
