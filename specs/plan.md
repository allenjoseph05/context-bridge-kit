# Plan: how Context Bridge is built

Overview only. Each topic has its own file in `specs/plan/`; a task card tells you which to read.

## Architecture
Hub and spoke. Source adapters (in the browser) produce one canonical `Transcript`. The bridge
host (local Node process) runs a pipeline of pure stages and stores the result. Destinations read
an approved `ContextPack` through one of three routes.

```
Gemini / ChatGPT / any site / paste
        │  content script, on click
        ▼
Extension (side panel + service worker) ── native messaging (stdio) ──► Bridge host
                                                                         validate → normalise
                                                                         → attachments → sanitise
                                                                         → extract (local model)
                                                                         → ground-check → compile
                                                                         → preview → approve → commit
                                                                         → index
                                                                              │
                                                     ┌──────────── vault (~/.context-bridge) ───┐
                                                     ▼                     ▼                   ▼
                                               clipboard text        bundle zip        MCP server (stdio)
                                                                                       → Claude Desktop, any MCP client
```

## Stack
| Concern | Choice |
| --- | --- |
| Language | TypeScript (strict), ESM, Node 20+ |
| Workspace | pnpm workspaces; package scope `@cb/*` |
| Schemas | zod; `zod-to-json-schema` for the model's output format |
| Tests | vitest; jsdom for adapter fixtures |
| Extension | Chrome MV3; esbuild; side panel UI in Preact |
| Model | Ollama on `http://127.0.0.1:11434`, JSON-schema `format`, temperature 0 |
| Tokens | `js-tiktoken` (`o200k_base`) as a proxy tokenizer for all vendors |
| MCP | `@modelcontextprotocol/sdk`, stdio transport |
| Files | `sharp` (images), `pdfjs-dist` (PDF text), `papaparse` (CSV), `fflate` (zip) |

## Packages
| Package | Responsibility | Plan file |
| --- | --- | --- |
| `@cb/schema` | zod schemas, IDs, wire messages | `plan/data-model.md`, `plan/protocol.md` |
| `@cb/sanitizer` | invisible chars, redaction, instruction flags | `plan/sanitizer.md` |
| `@cb/tokens` | token counting, budget maths | `plan/compiler.md` |
| `@cb/compiler` | priority compiler, profiles, envelope, bundle | `plan/compiler.md` |
| `@cb/extractor` | chunking, prompt, model provider, cache, ground-check, reduce | `plan/extractor.md` |
| `@cb/attachments` | file limits, images, PDF, CSV, text | `plan/attachments.md` |
| `@cb/index` | BM25 index over turns and file text | `plan/mcp-server.md` |
| `@cb/vault` | storage layout, permissions, expiry, audit | `plan/host.md` |
| `@cb/host` | native messaging host, sessions, pipeline wiring | `plan/host.md`, `plan/protocol.md` |
| `@cb/mcp-server` | five read-only tools | `plan/mcp-server.md` |
| `@cb/adapters` | source adapters + fixtures, paste parser | `plan/adapters.md` |
| `@cb/extension` | MV3 manifest, service worker, side panel | `plan/extension.md` |
| `evals/` | fixtures and runner | `plan/evals.md` |

Security controls and where they live: `plan/security.md`.

## Build order (why)
Plumbing and all three routes first in verbatim mode (G1, G2), then breadth of input (adapters,
files, G3), then intelligence (extractor, compiler profiles, G4), then measurement (G5). A weak or
missing model can then only lower quality; it can never break delivery.
