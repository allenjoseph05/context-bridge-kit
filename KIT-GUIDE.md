# How to build Context Bridge with a coding agent

For you, the human. The agent reads `AGENTS.md`; you read this. It applies the course's principles:
lean always-loaded context, skills on demand, grill before code, spec → plan → tasks → implement,
acceptance criteria as tests.

## Where the knowledge lives (rule of thumb from the lecture)
| Needed… | Lives in | Loaded |
| --- | --- | --- |
| for every task | `AGENTS.md` (purpose, structure, conventions, pitfalls) | always |
| for every phase | `specs/constitution.md` | once per session |
| for this feature | `specs/spec.md`, `specs/plan.md` + `specs/plan/*.md` | only the sections a card lists |
| for this task | `specs/tasks/Txx-*.md` | the one card in progress |
| sometimes (procedures) | `.claude/skills/*/SKILL.md` | when the description matches |
| as background | `docs/design/*` | only when a card points there |

`AGENTS.md` is ~60 lines on purpose. If you are tempted to add a procedure to it, make it a skill.

## Setup once
1. Create the repo; copy this kit into it; `git init`; commit "chore: spec kit".
2. The design docs are already in `docs/design/` (`needs.md`, `technical-design.md`); the landscape
   research is linked from `docs/design/README.md`.
3. Install Node 20+, pnpm 9+, Chrome, Claude Desktop, Ollama (+ one 7–8B instruct model before T17).
4. Read `specs/spec.md` and `specs/tasks.md` yourself once. You are the product owner.
5. Claude Code reads `CLAUDE.md` (which imports `AGENTS.md`) and finds skills in `.claude/skills/`.
   Other agents: point them at `AGENTS.md`; most also read it by default.

## The loop, per task
```
fresh session  →  "start T05"  →  agent restates the task  →  you confirm
              →  agent writes tests from the card  →  (Test review: required?) you review the test commit
              →  agent implements until green  →  "finish"  →  agent writes handoff notes, updates tasks.md
              →  close the session (or /clear)  →  next task in a fresh session
```
- **One task per session.** The card plus its implementation notes are the handoff; a long session
  drifts into the "dumb zone" where earlier details get lost.
- **Review test commits carefully** for cards marked `required`. Tests are the spec: once you approve
  them, the agent may not change them to pass.
- **If the agent asks a question, answer it** — or say "use clarify-spec" when a requirement is
  genuinely open. Its answers land in `specs/` so the next session has them.
- **At a gate** (after T09, T11, T16, T19, T21) say "gate-check G1" etc. You do the clicking; the
  agent guides and records.

## Prompts you can paste
- Start: `Start task T07. Use the start-task skill.`
- When the agent wanders: `Stop. Re-read the T07 card. Is this in its Deliverables? If not, revert it.`
- When unsure: `Use clarify-spec on <topic>. One question at a time.`
- Finish: `Use the finish-task skill.`
- Gate: `Use gate-check for G2. I'll do the manual steps; tell me exactly what to click.`

## What you must do yourself (the agent cannot)
| When | What |
| --- | --- |
| before T08 | Load the unpacked extension; run the host install script with the printed ID |
| before T11 gate | Add the MCP server to Claude Desktop's config; restart it |
| before T13 / T14 | Create demo chats from `docs/demo-chats.md`; save fixture HTML and checkpoints |
| before T17 | Install Ollama and pull the model |
| T20 | Approve the eval seed spec; read the fixtures |
| every gate | Do the manual run and report what you saw |

## Signs of context rot, and the fix
- The agent re-reads files it already read, or contradicts its own earlier output → commit, finish,
  fresh session.
- It "remembers" a requirement that is not in the card → ask it to quote the line; if it cannot, it
  invented it.
- It edits a test file → reject; restate "Do not change test files."

## Limits (from the lecture, applied)
Spec-driven work has overhead. Small fixes (a typo, a selector bump) do not need a new card: use a
short commit referencing the task. Keep specs focused; if a plan file grows past ~150 lines, split it.
When code and spec disagree, fix the spec first (spec-anchored), then the code.
