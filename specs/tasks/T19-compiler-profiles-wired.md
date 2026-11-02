# T19 · Compiler priority order and profiles, wired end to end
Depends on: T16, T18 · Size: L · **Test review: required** · **Gate G4** · Security rows: S2, S4

## Goal
Condensed mode: the compiler fills the budget in the specified priority order with items, artifacts,
evidence and recent turns; the three profiles behave as specified; the host runs extraction with
progress and falls back to verbatim on failure.

## Why
F15–F17, AC-08–AC-14. This is the product's core trade-off made concrete: maximum usefulness per
token, nothing important unreachable, different amounts of context for different reasons to move.

## Read before starting (only these)
- `specs/plan/compiler.md` §Priority order, §Profiles, §Envelope
- `specs/plan/host.md` §Pipeline per session (step 3)
- `packages/compiler/src/compile.ts` (your T05 code)

## Deliverables
- `packages/compiler/src/priority.ts`: steps 1–8 of the priority order; whole-or-nothing units;
  compact forms; manifest ranges; pull hints when `canPull`.
- `compile()` condensed mode for `continue` and `second_opinion` (extractive rendering by evidence;
  blind rule); `rescue` stays verbatim unless the user picks condensed.
- `over_budget_orientation` error.
- Host: `compile` with `mode: "condensed"` → `extractItems` with `progress` messages →
  `compile`; on `model_unavailable` or failed chunks → verbatim for the affected turns + notice
  (AC-14). `revise` recompiles without new model calls (items cached in the session).
- Panel: profile selector drives mode default; Working shows per-chunk progress and cache hits;
  Review shows ungrounded items (excluded) with "keep anyway" (→ `revise keepUngroundedIds`).

## Acceptance criteria → tests
Write the tests first, commit them, and stop for the human's test review. Use fixed `Item[]`
inputs (no model) for compiler tests and `FakeProvider` for host tests.

| # | Criterion | Test |
| --- | --- | --- |
| 1 | With a tiny budget, orientation items appear before decisions, decisions before artifacts, artifacts before recent turns, facts last | `packages/compiler/test/priority.test.ts › T19 priority order` |
| 2 | Budget and coverage hold for all profiles × routes × budgets on `long-chat.json` with generated items (property test) | `priority.property.test.ts › AC-08 AC-09 condensed property` |
| 3 | Artifacts in use are byte-identical, deduplicated by sha256, whole or in the manifest | `priority.test.ts › AC-10 artifacts in condensed mode` |
| 4 | Superseded decisions render as one line pointing to the active one | `priority.test.ts › AC-12 superseded rendering` |
| 5 | Ungrounded items are excluded and listed with `why: "ungrounded"` unless kept | `priority.test.ts › AC-11 ungrounded excluded` |
| 6 | `second_opinion` renders items by evidence quote; blind mode contains no assistant-origin items or assistant turns, and the manifest says so | `profiles.test.ts › AC-13 second opinion and blind` |
| 7 | `rescue` makes no provider call by default | `packages/host/test/compile.test.ts › AC-13 rescue no model` |
| 8 | Provider down → verbatim pack with notice "Model unavailable: verbatim pack" | `compile.test.ts › AC-14 fallback` |
| 9 | One failed chunk → its turns verbatim, others condensed, notice names the turn range | `compile.test.ts › AC-14 partial fallback visible` |
| 10 | Orientation larger than the budget → `over_budget_orientation` | `priority.test.ts › T19 orientation over budget` |
| 11 | Pull hints present only for the MCP route | `priority.test.ts › T19 pull hints` |

## Gate G4 (run `gate-check` after this task)
Manual: on the Gemini demo chat, compare Continue, Rescue and Second opinion (blind) previews;
confirm citations, superseded decision, code exact, budget shown, cut list; deliver Continue by MCP
and ask Claude a question that needs a pulled turn.

## Out of scope
Eval harness (T20, T21). Switch/Share/Sync profiles.

## Stop and ask if
A priority rule in compiler.md produces packs that look wrong on the demo chat (e.g. a crucial code
block always cut). Report the case; budgets and rules are spec, not your call.

## Done when
- [ ] Test commit reviewed, then green; `pnpm check` green
- [ ] G4 passed and recorded
- [ ] `finish-task` run

## Implementation notes
