---
name: write-source-adapter
description: Procedure to write or fix a source adapter that captures an AI assistant's chat page into a Transcript (Gemini, ChatGPT, generic, or a new site), working only from saved fixture HTML. Use for tasks T12, T13, T14 and whenever an adapter breaks after a site change.
---

# Write a source adapter

You cannot see the user's logged-in assistant page. **Selectors come only from fixture HTML the human
saved.** Guessed selectors are hallucinations that pass review and fail live.

## 1. Check fixtures
- `packages/adapters/fixtures/<adapter>/chat-NN.html` and `chat-NN.expected.json` must exist.
  Missing → stop and tell the human exactly how to create them (task card, Human prerequisites).
- Expected checkpoints format (written by the human, who knows what the chat contains):
```json
{
  "turnCount": 12,
  "roles": ["user", "assistant", "user", "assistant", "…"],
  "checks": [
    { "turn": 4, "partKind": "code", "lang": "python", "firstLine": "def add_todo(title):" },
    { "turn": 6, "partKind": "table", "contains": "| Priority |" },
    { "turn": 1, "attachment": { "name": "wireframe.png", "origin": "user_upload" } },
    { "turn": 9, "textContains": "switch to Postgres" }
  ]
}
```

## 2. Study the fixture
- Find the container for each turn and how roles are marked. Prefer, in order:
  `data-*` attributes, ARIA roles/labels, semantic tags, stable custom element names
  (e.g. `user-query`, `model-response`), and only then structure (child order).
- Avoid generated class names (hash-like, `css-1x2y3z`) — they change on every deploy.
- Note how code blocks, tables, math, citations, images and file chips are rendered.

## 3. Write `selectors.ts`
One exported object, versioned:
```ts
export const SELECTORS_VERSION = "0.1";
export const S = {
  turn: "…", userTurn: "…", assistantTurn: "…",
  code: "pre code", codeLang: "…", table: "table", math: "annotation[encoding='application/x-tex']",
  image: "img", fileChip: "…", variantVisible: "…"
};
```
Each selector gets a one-line comment: what it matches and which fixture line proves it.

## 4. Implement `capture`
- Use the shared `dom-parts.ts` mapping; adapter-specific code only where the site differs.
- Code: `textContent` of the `code` element (preserves whitespace) — never `innerText`.
- Text: `innerText` (visible text only — hidden text is an injection carrier).
- Only the visible variant of regenerated answers.
- Validate (≥ 1 user turn, no empty parts) → else `CaptureError`.
- No `fetch` except through `images.ts`.

## 5. Test against checkpoints
One test per checkpoint row, plus "empty page → error". Run in jsdom (note: jsdom has no layout, so
`innerText` may need the shared polyfill in `test/setup.ts` that falls back to `textContent`).

## 6. Live check (human)
Ask the human to build, reload the extension, capture the live chat, and compare with Select.
If live differs from the fixture: ask for a fresh fixture, update selectors, bump the version, log
the change in `specs/decisions.md`.
