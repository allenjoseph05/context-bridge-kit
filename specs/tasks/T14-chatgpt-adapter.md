# T14 · ChatGPT adapter
Depends on: T12 · Size: S · Test review: — · Security rows: S7 · **On the cut list (3)**

## Goal
Capture a ChatGPT chat page into a structured transcript, proving the adapter pattern generalises
beyond one source ("or between two other assistants you choose").

## Why
F12 any-to-any. A second structured adapter shows the interface is real, not Gemini-shaped.

## Read before starting (only these)
- `specs/plan/adapters.md` §Structured adapters, §Fixture rules
- Skill: `write-source-adapter`
- `packages/adapters/src/gemini/` as a reference implementation (read, do not modify)

## Human prerequisites (blocking)
Same as T13, on chatgpt.com, using `docs/demo-chats.md` (ChatGPT chat 1), saved to `packages/adapters/fixtures/chatgpt/chat-01.html` (+ expected
checkpoints). Include a code block, a table, an uploaded image, and one "code interpreter"/analysis
output if available. **If missing, stop and ask.**

## Deliverables
- `packages/adapters/src/chatgpt/selectors.ts`, `chatgpt/index.ts` (`id: "chatgpt"`,
  `matches` for `chatgpt.com` and `chat.openai.com`), registry entry, content-script bundle.
- Tool/analysis output → `tool_output` part (final result only).

## Acceptance criteria → tests
| # | Criterion | Test (`packages/adapters/test/chatgpt.test.ts`) |
| --- | --- | --- |
| 1 | Turns and roles match checkpoints | `AC-01 chatgpt turns and roles` |
| 2 | Code exact; tables → Markdown | `AC-01 chatgpt code and tables` |
| 3 | Analysis output becomes `tool_output` | `AC-01 chatgpt tool output` |
| 4 | Attachments listed or carried as in T13 | `AC-01 chatgpt attachments` |
| 5 | Empty page → error, never empty transcript | `AC-04 chatgpt empty page` |

## Out of scope
Anything not listed. Do not refactor the Gemini adapter; propose shared helpers in notes instead.

## Done when
- [ ] Tests pass; `pnpm check` green; live capture checked manually
- [ ] `finish-task` run

## Implementation notes
