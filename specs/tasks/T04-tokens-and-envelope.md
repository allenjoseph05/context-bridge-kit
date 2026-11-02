# T04 · Token counting, budgets, envelope
Depends on: T01 · Size: S · Test review: — · Security rows: S2

## Goal
Count tokens, compute effective budgets, generate a safe fence, and render the envelope text the
destination will read.

## Why
AC-08 (budget) and AC-16 (envelope). Every route and profile uses these; they must be correct and
deterministic before the compiler exists.

## Read before starting (only these)
- `specs/plan/compiler.md` §Token counting, §Envelope
- `specs/plan/data-model.md` §Destination and pack

## Deliverables
- `packages/tokens/src/index.ts`: `countTokens(text)`, `IMAGE_TOKENS = 1000`,
  `PROFILE_BUDGET`, `ROUTE_BUDGET`, `PROFILE_RECENT_TURNS`, `effectiveBudget(profile, route, window?)`,
  `destinationProfile(route, profile, window?) → DestinationProfile`. Dependency: `js-tiktoken`.
- `packages/compiler/src/envelope.ts`: `newFence(content, rng?)`, `renderEnvelope(pack, { fence })`.
  The RNG is injectable for tests.

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | `countTokens` is deterministic and > 0 for non-empty text; empty → 0 | `packages/tokens/test/tokens.test.ts › T04 count` |
| 2 | `effectiveBudget("continue","mcp") = floor(6000×0.85)`, `("continue","clipboard") = floor(8000×0.85)`, `("rescue", any) = floor(3000×0.85)`, window 16,000 caps at `floor(4000×0.85)` | `tokens.test.ts › AC-08 effective budget` |
| 3 | `destinationProfile` sets `canPull`, `acceptsImages`, `acceptsFiles` per the route table | `tokens.test.ts › T04 destination profiles` |
| 4 | `newFence` returns 6 lowercase hex chars not present in the content; with an RNG forced to collide first, it retries | `packages/compiler/test/envelope.test.ts › AC-16 fence absent from content` |
| 5 | Envelope starts with the header line and the exact NOTICE paragraph; ends with the END line; the closing fence line appears exactly once and only at the end of the body | `envelope.test.ts › AC-16 envelope structure` |
| 6 | Content containing `--- abcdef ---` and `=== END CONTEXT PACK` lines cannot terminate the fenced body (fence differs) | `envelope.test.ts › AC-16 content cannot close fence` |
| 7 | Empty sections are omitted; assistant-origin items end with `[unverified]`; the pull line appears only when `canPull` | `envelope.test.ts › T04 sections and markers` |
| 8 | Snapshot of the envelope for a hand-built small pack | `envelope.test.ts › T04 snapshot` |

## Out of scope
Choosing what goes into the pack (T05, T19). Bundle zip (T05).

## Stop and ask if
The NOTICE wording in compiler.md seems to need changes; wording is part of the spec.

## Done when
- [ ] Tests pass; `pnpm check` green
- [ ] `finish-task` run

## Implementation notes
