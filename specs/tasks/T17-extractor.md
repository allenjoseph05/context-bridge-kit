# T17 · Extractor: chunking, prompt, provider, cache
Depends on: T03, T04, T06 · Size: M · Test review: — · Security rows: S1, S13

## Goal
Turn selected, sanitised turns into validated `ItemDraft`s with a local model: chunked,
spotlighted, schema-constrained, retried once, cached.

## Why
F4, AC-14, AC-23, AC-25. The only place a model runs; everything around it is built to check it.

## Read before starting (only these)
- `specs/plan/extractor.md` §1–§5
- `specs/plan/data-model.md` §Item
- Skill: `llm-structured-output` (load it)

## Human prerequisites
- Ollama installed and running; pull one 7–8B instruct model that supports JSON-schema output
  (e.g. `qwen2.5:7b-instruct` or `llama3.1:8b`). Record the choice and the machine (CPU/GPU) in
  `decisions.md`. Unit tests do **not** need Ollama (they use `FakeProvider`).

## Deliverables
- `packages/extractor/src/chunk.ts`: chunking with one-turn overlap; oversized-turn code markers.
- `packages/extractor/src/render.ts`: turn rendering with a random nonce per call; attachments as
  one-line placeholders.
- `packages/extractor/prompts/extract-v1.md`: the system prompt (rules from extractor.md §2), with
  2 short synthetic examples of input → output.
- `packages/extractor/src/provider.ts`: `ModelProvider`, `OllamaProvider` (loopback check,
  timeout, `format` = `itemDraftsJsonSchema()`, temperature 0, `num_ctx` 8192), `FakeProvider`.
- `packages/extractor/src/extract.ts`: `extractDrafts({ transcript, selection, provider, cache,
  onProgress, signal }) → { drafts, failedChunks, cacheHits }` with validate → one retry with the
  error → fail chunk.
- `packages/extractor/src/cache.ts`: key formula from extractor.md §5 on top of the vault cache.
- `scripts/try-extract.ts`: runs the extractor on a seed fixture against real Ollama and prints the
  drafts (manual check).

## Acceptance criteria → tests
| # | Criterion | Test (`packages/extractor/test/…`) |
| --- | --- | --- |
| 1 | Chunks ≤ 3,000 tokens with one-turn overlap; an oversized turn is its own chunk with code markers instead of code | `chunk.test.ts › T17 chunking` |
| 2 | Rendered input wraps every turn in tags carrying the call's nonce; two calls use different nonces | `render.test.ts › S1 spotlighting delimiters` |
| 3 | Invalid JSON then valid → success after one retry, retry message contains the validation error | `extract.test.ts › T17 retry with error` |
| 4 | Two invalid responses → chunk in `failedChunks`, no partial drafts from it | `extract.test.ts › AC-14 failed chunk reported` |
| 5 | Provider unavailable → typed `model_unavailable` error | `extract.test.ts › AC-14 model unavailable` |
| 6 | `CB_OLLAMA_URL=http://10.0.0.5:11434` is refused; allowed with `CB_ALLOW_REMOTE_MODEL=1` | `provider.test.ts › AC-23 loopback only` |
| 7 | Second run on a grown transcript (same first 40 turns + 10 new) calls the provider only for new chunks | `extract.test.ts › AC-25 cache hits` |
| 8 | Changing the prompt version or model id misses the cache | `cache.test.ts › AC-25 cache key` |
| 9 | Manual: `try-extract` on `small-chat.json` returns sensible items with exact evidence | record a sample in notes |

## Out of scope
Ground-check and reduce (T18). Wiring into the host (T19).

## Stop and ask if
The chosen model ignores the schema often (> 1 in 5 chunks on the seed fixtures). Report numbers;
the human decides whether to change model or prompt.

## Done when
- [ ] Tests pass; `pnpm check` green; manual sample recorded
- [ ] `finish-task` run

## Implementation notes
