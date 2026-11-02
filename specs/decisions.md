# Decisions log

Append-only. One entry per decision the spec did not already make, or that changes it.
Format: date · task · decision · why · alternatives considered. Changes to behaviour also update
`spec.md` or the relevant `plan/*.md` in the same commit (spec-anchored).

## Decisions inherited from the design phase
See `docs/design/technical-design.md` §Key decisions (D1–D16) for the full reasoning. Summary:
- D1 Hub and spoke: N source adapters + M routes over one canonical format.
- D2 Push a compact pack, keep the rest pullable.
- D3 Structured adapters for Gemini and ChatGPT; generic selection capture; paste.
- D4 Chunked extraction with evidence quotes, cached; compiled later.
- D5 Priority-based compiler with per-profile and per-route budgets.
- D6 Chrome native messaging, no network listener.
- D8 Local model via Ollama, JSON-schema output, temperature 0; verbatim fallback.
- D9 Files processed locally; files the page does not expose are dropped in by the user.
- D10 Lexical BM25 retrieval now, embeddings later.
- D14 Spotlighting by delimiting in the extractor; fenced envelope at delivery.
- D15 Deterministic redaction before any model.

## Log
<!-- YYYY-MM-DD · Txx · decision · why · alternatives -->
- 2026-11-02 · T00 · Dev tooling pinned to vitest 3.2.x and TypeScript 6.0.x (with eslint 10, typescript-eslint 8, prettier 3). · vitest ≥4 removed `vitest.workspace.ts` (the card's deliverable) and vitest 5 does not support Node 20; typescript-eslint 8 supports TypeScript <6.1 only. · vitest 5 with `test.projects`; TypeScript 5.x or 7.x. Chosen by the human.
- 2026-11-02 · T01 · Protocol field types filled in `plan/protocol.md` §Field types: `ingested.turns` is `Turn[]` (sanitised turns, not a count); one shared `Flag { ref, kind, match?, index? }` for `ingested.flags` and `preview.flags`; new `ingested.redactions` (placeholder + kind, no values); `missingFiles` = attachment ids; `suggestedSelection` = turn ids only; `progress.stage` enum `attachments | extract | ground | compile`; `preview.stats` = `ContextPack.stats`; `requestId` on every request and reply, optional on `chunk`; `edits` strict. · protocol.md named these fields without types; the Select screen must show what the host will actually use. · Count instead of turns; free-form string flags. Chosen by the human.
- 2026-11-02 · T01 · zod pinned to 3.25.x (`^3.25.76`) with `zod-to-json-schema` 3.25.x. · `@modelcontextprotocol/sdk` 1.32.2 accepts `zod ^3.25 || ^4.0` (peer and dependency). `zod-to-json-schema` 3.25.2 declares `zod ^3.25.28 || ^4`, but tested on zod 4.6.7 it returns an empty schema (`{"$schema": …}` only) for zod 4 schemas, failing silently. With zod 3 schemas it produces the full schema. zod 3.25 works with both. · zod 4 with native `z.toJSONSchema` (works, but drops the card's named dependency and outputs draft 2020-12); zod 4 importing `zod/v3`.
