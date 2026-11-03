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
- [x] Tests pass; `pnpm check` green
- [x] `finish-task` run

## Implementation notes
- Files: `packages/index/src/tokenize.ts` (`tokenize`, `tokenSpans`), `bm25.ts` (`buildIndex`, `search`,
  types `IndexDoc { ref, text, offset? }`, `IndexJSON`, `SearchHit { ref, score, snippet, offset? }`,
  constants `K1 B MAX_K SNIPPET_CHARS`), `chunk.ts` (`chunkText`, `chunkSpans`, `docsFromTranscript`);
  all re-exported from `src/index.ts`. Pure; no `node:` imports. Runtime dep `@cb/tokens` only;
  `@cb/schema` is a devDependency (type-only import of `Transcript`).
- Refs (decided by the human, decisions.md): turns `t012`, one doc per turn, not chunked; attachment
  chunks `a002#c3`, 1-based, each with `offset` = char offset in the extracted text (chunks are
  exact slices). `search` returns `offset` only for attachment hits, ready for
  `get_attachment(packId, "a002", offset)` in T11.
- `IndexJSON` stores postings as sorted `[term, [[docIdx, tf]]]` arrays (no object keys, so
  `__proto__`/`constructor` are safe) and each doc's full text (for snippets). It survives
  `JSON.stringify`/`parse` unchanged; `search` rebuilds a Map per call.
- `search(index, query, k)`: k clamped to 0..8 (NaN → 0); only docs with ≥ 1 query term; score desc,
  then ref by code-unit order. Snippet: whole text if ≤ 600 chars, else a 600-char window centred on
  the first occurrence of the highest-idf query term, edges trimmed to whole words.
- Tokeniser: camelCase/snake_case parts, then the lowercased whole word; letters and digits inside a
  word are not split (`configStep30` → `config, step30, configstep30`).
- Chunking: paragraphs → sentences → words → hard length split (binary search with `countTokens`);
  greedy packing; every chunk ≤ maxTokens.
- Extra tests beyond the table: `chunk.test.ts` (chunk limits, no loss, refs/offsets).
- Observed once, not T10: `@cb/schema ids › T01 ids` failed in one full run while T10 stubs threw;
  it passes alone. The likely cause is a chance collision among 1000 random 32-bit ids (≈ 1 in 2,900 runs).
  Unconfirmed (assertion message not captured); test left untouched.
