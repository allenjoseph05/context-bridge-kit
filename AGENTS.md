# Context Bridge — agent guide

Always loaded. Short on purpose: what every task needs. Procedures live in skills,
requirements in `specs/`. Do not paste other documents into this file.

## Purpose
A local-first tool that moves selected context (messages, files, a cited summary) from one
AI assistant to another, e.g. Gemini → Claude. A browser extension captures a chat; a local
"bridge host" sanitises, condenses and budgets it; the user approves the exact payload; the
destination receives it via MCP, a Markdown bundle, or the clipboard.

## Structure
```
specs/constitution.md   principles for every task (read once per session)
specs/spec.md           what and why: user stories, acceptance criteria AC-xx
specs/plan.md           how: architecture overview; details in specs/plan/*.md
specs/tasks.md          ordered task list with status and dependencies
specs/tasks/Txx-*.md    one card per task: the only work you do in a session
specs/decisions.md      decision log (append only)
packages/*              pnpm workspace packages (see specs/plan.md for the map)
evals/                  synthetic fixtures and the eval runner
docs/design/            background research; read only when a task card points there
```

## Commands
- `pnpm install` · `pnpm check` (typecheck + lint + all tests) · `pnpm test -- <pattern>`
- `pnpm build` · `pnpm eval` (from task T21 on)

## Conventions
- TypeScript strict, ESM, Node 20+. Zod schemas from `@cb/schema` are the single source of truth.
- Pure functions for every pipeline stage; I/O only at the edges (host main, vault, MCP, extension).
- Exported functions declare their return types; expected failures are returned as typed results, not thrown.
- Test names start with the acceptance-criterion or task ID: `it("AC-10 code parts are byte-identical", …)`.
- IDs: turns `t001`, attachments `a001`, items `i001`, packs `cp_<8 hex>`, sessions `s_<8 hex>`.
- One commit for tests (`test(Txx): …`), then commits for code (`feat(Txx): …`).

## Pitfalls (read these)
- **stdout is a protocol** in `packages/host` and `packages/mcp-server`. Never `console.log` there;
  log with `console.error` (stderr). A stray print breaks native messaging and MCP.
- **Never invent DOM selectors.** Adapters are written only against saved fixture HTML in
  `packages/adapters/fixtures/`. No fixture → stop and ask.
- **Never send content to a non-loopback address.** The only outbound call is the local model.
- **Browser-safe packages import no `node:` module.** `@cb/schema` (main entry), `@cb/adapters` and
  `@cb/sanitizer` run in the extension: hash with async `sha256HexWeb`. Node-only helpers (sync
  `sha256Hex`) live in `@cb/schema/node`, for host, tests and scripts only. Purity tests enforce this.
- **Code, tables and math are copied by code, never retyped by a model.**
- **Do not modify test files to make them pass.** A test is part of the spec. If a test looks
  wrong, stop and say why; the human decides.
- Synthetic data only. Never commit a real conversation.

## How to work
1. One task per session. Start with the `start-task` skill and the task ID.
2. Read only what the task card lists. Do not read ahead into other tasks.
3. Tests first, from the card's acceptance criteria; then implement until green.
4. If the spec is unclear or contradicts itself, use the `clarify-spec` skill. Do not guess.
5. Finish with the `finish-task` skill. Then the human starts a fresh session.
