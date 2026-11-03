# Tasks

One task per session. Do them in order; a task starts only when every task it depends on is
`done`. Update the Status column in `finish-task`. Gates are checked with the `gate-check` skill
before the next task begins.

Status: `todo` · `in_progress` · `review` (tests or code waiting for the human) · `done` · `cut`

| ID | Task | Depends on | Size | Test review | Gate | Status |
| --- | --- | --- | --- | --- | --- | --- |
| T00 | Scaffold the monorepo | — | S | — | | done |
| T01 | Schemas and IDs (`@cb/schema`) | T00 | M | — | | done |
| T02 | Paste parser and seed fixtures | T01 | S | — | | done |
| T03 | Sanitiser (`@cb/sanitizer`) | T01, T02 | M | required | | done |
| T04 | Token counting, budgets, envelope | T01 | S | — | | done |
| T05 | Compiler, verbatim mode, coverage, bundle | T03, T04 | M | required | | done |
| T06 | Vault, expiry, audit | T01, T03 | M | — | | done |
| T07 | Bridge host: protocol, sessions, approval, install | T02, T05, T06 | L | required | | done |
| T08 | Extension shell: manifest, port, Capture and Select | T07 | L | — | | done |
| T09 | Review and Deliver; clipboard and bundle routes | T08 | M | — | **G1** | done |
| T09b | Investigate a one-off test-suite failure | T09 | S | — | | done |
| T10 | BM25 retrieval index (`@cb/index`) | T01 | S | — | | done |
| T11 | MCP server, five read-only tools | T07, T10 | M | required | **G2** | done |
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

G1 · 2026-11-03 · passed · paste (8 turns) → Review → approve → clipboard (cp_d7c9fa78) and bundle (cp_1369eec5); human observed: Gemini answered goal and next step correctly from both; envelope showed [SECRET_1]/[EMAIL_1]; Review highlighted redactions and the injection flag; clipboard unchanged before approval; clipboard copy was automatic after committed. Checked: pnpm check/build green, host listens on no port, no planted secret in vault, audit has ids/counts/hashes only, zip written 0.5 s after the approved event, manifest permissions = plan.

G2 · 2026-11-03 · passed · synthetic 46-turn paste (7,171 tokens) → Continue + MCP → cp_fe5bac84, pushed 5,077 / budget 5,100, 16 turns cut (t001–t016); human observed: in a Claude Desktop Chat tab, the server's tools appeared, get_pack and then search_history each showed a permission prompt and were approved, Claude answered BLUE-HERON-7 from cut turn t003 (an earlier Code-tab run in auto mode called get_pack/get_turns with no prompt: client auto-approval, not counted). Images not exercised (no attachments; G3). Checked: pnpm check/build green, host and MCP server listen on no port, no planted secret in vault, served audit lines have ids/counts/tool only and all follow the approved event, manifest permissions = plan.

## Cut list (in this order, if time runs short)
1. Ablations in T21 (keep `full`, `continue-6k`, `rescue`, `second-blind`)
2. CSV summaries in T15
3. T14 ChatGPT adapter (the generic adapter still covers ChatGPT)
4. German fixtures in T20
5. Fault-injection tests beyond "model down"

**Never cut:** consent screens, redaction, ground-check, envelope, coverage invariant, the three
routes, at least 5 eval fixtures.
