# T10 · BM25 retrieval index (`@cb/index`)
Depends on: T01 · Size: S · Test review: — · Security rows: —

## Goal
A deterministic lexical index over turns and extracted file text, used by `search_history` and by
document excerpts.

## Why
D10 and F15 (pull on demand). Chat retrieval is dominated by names, code identifiers and numbers,
where lexical search is strong; it is free, fast and testable.

## Read before starting (only these)
- `specs/plan/mcp-server.md` §Retrieval index

## Deliverables
- `packages/index/src/tokenize.ts`, `bm25.ts`, `chunk.ts`, `index.ts`:
  `buildIndex(docs: Array<{ ref: string; text: string }>) → IndexJSON`,
  `search(index, query, k) → Array<{ ref, score, snippet }>`,
  `chunkText(text, maxTokens = 500) → string[]` (split on paragraph, then sentence boundaries).
- `docsFromTranscript(transcript, extractedTexts: Map<attachmentId, string>)` producing refs
  `t012` and `a002#c3` (chunk 3).
- No runtime dependency beyond `@cb/tokens`.

## Acceptance criteria → tests
| # | Criterion | Test (`packages/index/test/…`) |
| --- | --- | --- |
| 1 | Tokeniser lowercases, splits `getUserById` → `get, user, by, id, getuserbyid`, `max_retry_count` likewise, keeps numbers like `30` and `3.5` | `tokenize.test.ts › T10 identifiers and numbers` |
| 2 | On `long-chat.json`, searching a phrase unique to turn 30 returns `t030` first | `bm25.test.ts › T10 finds the right turn` |
| 3 | Same inputs → identical results and order across runs; ties ordered by ref | `bm25.test.ts › T10 deterministic` |
| 4 | Snippets are ≤ 600 chars and contain at least one query term | `bm25.test.ts › T10 snippets` |
| 5 | `buildIndex` → JSON → `search` gives the same results as in memory | `bm25.test.ts › T10 serialisable` |
| 6 | k is capped at 8 | `bm25.test.ts › T10 k cap` |

## Out of scope
Embeddings. The MCP tool wrapper (T11).

## Done when
- [ ] Tests pass; `pnpm check` green
- [ ] `finish-task` run

## Implementation notes
