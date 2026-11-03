# T11 · MCP server, five read-only tools
Depends on: T07, T10 · Size: M · **Test review: required** · **Gate G2** · Security rows: S2, S9

## Goal
An stdio MCP server that lets Claude Desktop (or any MCP client) load an approved pack and pull
earlier turns, search the history, and fetch attachments — read-only, capped and audited.

## Why
F8, F15, AC-18, AC-19. Push a compact pack, pull detail on demand. The client's own tool-approval
prompt is a second, independent consent.

## Read before starting (only these)
- `specs/plan/mcp-server.md` §MCP server (all)
- `specs/plan/host.md` §Vault layout
- Skill: `mcp-server-tools` (load it)

## Human prerequisites
- Claude Desktop installed (free plan is enough for a local stdio server).

## Deliverables
- `packages/mcp-server/src/index.ts`: server with the five tools from the table in mcp-server.md,
  using `@modelcontextprotocol/sdk` and zod input schemas; annotations exactly as specified.
- Tool descriptions written as triggers (what it returns, when to use it).
- Response cap 4,000 tokens with the truncation suffix on the pull tools, each with optional `offset`; `get_pack` uncapped, bounded by the approved budget.
- Notice line prepended to every tool result that carries pack content.
- Audit `served` event per call.
- Host change: on `approve`, store the shareable transcript only (host.md §Pipeline: no turns
  excluded by the user or withheld by the profile, no excluded attachments), build the BM25 index
  (`@cb/index`) from it and store it (replaces T07's placeholder).
- `packages/compiler/src/index.ts`: export `renderTurn` (get_turns renders with it).
- `packages/schema/src/transcript.ts`: optional `Attachment.pageOffsets` (data-model.md).
- README snippet `docs/mcp-setup.md`: the Claude Desktop config with the absolute path, how to
  restart the client, how to verify the tools appear.

## Acceptance criteria → tests
Write the tests first, commit them, and stop for the human's test review. Use the SDK's in-memory
client transport and a temp vault seeded with packs.

| # | Criterion | Test (`packages/mcp-server/test/…`) |
| --- | --- | --- |
| 1 | `tools/list` returns exactly the five tools, each with `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false` | `tools.test.ts › AC-18 five read-only tools` |
| 2 | An expired pack and an unknown id both give the error "pack not found or expired" for every tool | `tools.test.ts › AC-18 only committed unexpired packs` |
| 3 | `get_pack` returns the stored envelope byte-identical, with the notice line | `tools.test.ts › T11 get_pack` |
| 3b | `get_pack`'s envelope token count never exceeds the pack's `stats.budget` (not cut at 4,000) | `tools.test.ts › T11 get_pack within approved budget` |
| 4 | `get_turns` with 11 ids is rejected; with valid ids returns the turns verbatim | `tools.test.ts › T11 get_turns` |
| 4b | A turn from `get_turns` matches its rendering inside the envelope exactly | `tools.test.ts › T11 get_turns matches envelope` |
| 5 | `search_history` returns ≤ 8 results with refs and snippets | `tools.test.ts › T11 search_history` |
| 6 | A response that would exceed 4,000 tokens is truncated with the `offset` hint | `tools.test.ts › AC-18 response cap` |
| 6b | Following the `offset` hints and concatenating the pages reproduces the full result exactly (`get_turns`, `get_attachment`) | `tools.test.ts › AC-18 offset pages concatenate` |
| 7 | `get_attachment` on an image returns image content with mime; on a text document returns a text range; on a listed file returns an explanation (seed the vault with a small png and a txt) | `tools.test.ts › AC-19 attachments` |
| 7b | `get_attachment` with `page` on a text with `pageOffsets` returns that page; an out-of-range page is an error naming the page count | `tools.test.ts › AC-19 attachment pages` |
| 7c | An excluded turn's unique phrase is absent from `search_history`, `get_turns` refuses it with "not available: excluded by the user", and the phrase appears in no vault file; a budget-cut turn stays pullable | `exclusion.test.ts › T11 excluded turns are not pullable` |
| 7d | In a blind second opinion, no assistant turn is pullable or searchable (AC-13) | `exclusion.test.ts › AC-13 blind withholds assistant turns from pull` |
| 7e | The host's `approve` stores the shareable transcript and a BM25 index built from it | `packages/host/test/approve-index.test.ts › T11 approve stores shareable transcript and index` |
| 8 | Every call adds one `served` audit line with no content | `tools.test.ts › AC-22 served audited` |
| 9 | No tool name or description implies writing, deleting or network access | `tools.test.ts › S9 tool surface` |

## Gate G2 (run the `gate-check` skill after this task)
Manual: approve a pack with route MCP → configure Claude Desktop → in a new chat type the
instruction sentence → approve the tool call → ask about a turn that is only in the manifest →
Claude calls `get_turns` or `search_history`. Record results, including whether images render.

## Out of scope
Remote/HTTP transport, OAuth. Writing to the vault.

## Stop and ask if
The SDK version's API differs from the skill's examples; check the installed package's types and
record the version in `decisions.md`.

## Done when
- [ ] Test commit reviewed, then green; `pnpm check` green
- [ ] G2 passed and recorded
- [ ] `finish-task` run

## Implementation notes
