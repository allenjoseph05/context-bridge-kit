# Tasks

One task per session. Do them in order; a task starts only when every task it depends on is
`done`. Update the Status column in `finish-task`. Gates are checked with the `gate-check` skill
before the next task begins.

Status: `todo` · `in_progress` · `review` (tests or code waiting for the human) · `done` · `cut`

| ID | Task | Depends on | Size | Test review | Gate | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T00 | Scaffold the monorepo | — | S | — | | todo |
| T01 | Schemas and IDs (`@cb/schema`) | T00 | M | — | | todo |
| T02 | Paste parser and seed fixtures | T01 | S | — | | todo |
| T03 | Sanitiser (`@cb/sanitizer`) | T01, T02 | M | required | | todo |
| T04 | Token counting, budgets, envelope | T01 | S | — | | todo |
| T05 | Compiler, verbatim mode, coverage, bundle | T03, T04 | M | required | | todo |
| T06 | Vault, expiry, audit | T01, T03 | M | — | | todo |
| T07 | Bridge host: protocol, sessions, approval, install | T02, T05, T06 | L | required | | todo |
| T08 | Extension shell: manifest, port, Capture and Select | T07 | L | — | | todo |
| T09 | Review and Deliver; clipboard and bundle routes | T08 | M | — | **G1** | todo |
| T10 | BM25 retrieval index (`@cb/index`) | T01 | S | — | | todo |
| T11 | MCP server, five read-only tools | T07, T10 | M | required | **G2** | todo |
| T12 | Adapter interface, generic adapter, injection | T08 | M | — | | todo |
| T13 | Gemini adapter | T12 | M | — | | todo |
| T14 | ChatGPT adapter | T12 | S | — | | todo |
| T15 | Attachment processing (`@cb/attachments`) | T06 | M | required | | todo |
| T16 | Attachments end to end: page images, drop zone, excerpts | T09, T11, T13, T15 | M | — | **G3** | todo |
| T17 | Extractor: chunking, prompt, provider, cache | T03, T04, T06 | M | — | | todo |
| T18 | Ground-check and reduce | T17 | S | required | | todo |
| T19 | Compiler priority order and profiles, wired end to end | T16, T18 | L | required | **G4** | todo |
| T20 | Eval fixtures | T19 | M | human checks fixtures | | todo |
| T21 | Eval runner and results | T20 | M | — | **G5** | todo |
| T22 | Demo hardening and README | T21 | S | — | | todo |

## Gates
| Gate | Proves | How it is checked |
| --- | --- | --- |
| G1 | Pasted text → approved pack → clipboard and bundle, in a real Chrome | manual run + `pnpm check` |
| G2 | Claude Desktop loads a pack and pulls a turn through MCP | manual run in Claude Desktop |
| G3 | An image and a PDF from a captured chat reach the destination | manual run on a demo chat |
| G4 | A condensed, cited pack fits the budget; coverage holds; profiles differ as specified | manual run + tests |
| G5 | `pnpm eval` writes the results table | command output |

## Cut list (in this order, if time runs short)
1. Ablations in T21 (keep `full`, `continue-6k`, `rescue`, `second-blind`)
2. CSV summaries in T15
3. T14 ChatGPT adapter (the generic adapter still covers ChatGPT)
4. German fixtures in T20
5. Fault-injection tests beyond "model down"

**Never cut:** consent screens, redaction, ground-check, envelope, coverage invariant, the three
routes, at least 5 eval fixtures.
