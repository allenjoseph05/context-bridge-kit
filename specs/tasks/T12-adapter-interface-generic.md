# T12 · Adapter interface, generic adapter, injection
Depends on: T08 · Size: M · Test review: — · Security rows: S7

## Goal
The adapter interface and registry, the generic selection adapter for any site, and the extension
wiring that injects the right adapter on a user click.

## Why
D1, D3, AC-02, AC-04. Any site must work at least at "inferred" quality; structured adapters (T13,
T14) then plug into the same interface.

## Read before starting (only these)
- `specs/plan/adapters.md` §Interface, §Generic adapter, §Page images
- `specs/plan/extension.md` §Manifest (why `activeTab` and the context menu)
- Skill: `write-source-adapter`

## Deliverables
- `packages/adapters/src/types.ts` (re-exported interface), `registry.ts` (`pickAdapter(url)`),
  `generic.ts`, `images.ts` (shared page-image capture: fetch data/blob/same-origin, else `listed`).
- `packages/adapters/src/dom-parts.ts`: shared DOM → `Part[]` mapping (code, table → Markdown,
  math annotation, citation links, images, text via `innerText`).
- Extension:
  - context menu "Capture selection with Context Bridge" on `selection` context → injects the
    generic content script with the selection → opens the side panel at Select;
  - "Capture this chat" button enabled when `pickAdapter` returns a structured adapter for the
    active tab, injecting that adapter's bundle;
  - capture errors show the paste fallback.
- `packages/adapters/fixtures/generic/` — two small synthetic HTML pages (a forum-like Q&A, an
  unknown chat UI) with `*.expected.json` checkpoints (see the skill for the format).

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | `pickAdapter` returns gemini/chatgpt for their hosts (once registered) and generic otherwise | `packages/adapters/test/registry.test.ts › T12 pick adapter` |
| 2 | Generic capture on fixtures returns turns matching the checkpoints, `confidence: "inferred"`, warning "roles inferred" | `generic.test.ts › AC-02 generic capture` (jsdom) |
| 3 | `pre` blocks become code parts byte-identical to `textContent` | `dom-parts.test.ts › AC-01 code preserved` |
| 4 | An HTML table becomes a Markdown table part | `dom-parts.test.ts › T12 tables` |
| 5 | An empty selection → `capture_empty` (AC-04) | `generic.test.ts › AC-04 empty selection` |
| 6 | Cross-origin image → attachment `listed` with the drop-the-original reason; data: image → bytes captured | `images.test.ts › T12 page images` (mock fetch) |
| 7 | Content scripts contain no `fetch` except in `images.ts` | `packages/adapters/test/purity.test.ts › S7 no fetch` |

## Out of scope
Gemini and ChatGPT selectors (T13, T14). Sending image bytes to the host (T16).

## Stop and ask if
`activeTab` is not granted by the context-menu click in practice; record the observation in
`decisions.md` and keep the paste fallback.

## Done when
- [ ] Tests pass; `pnpm check` green
- [ ] Manual: select text on any web page → context menu → transcript appears in Select
- [ ] `finish-task` run

## Implementation notes
