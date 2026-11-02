# T13 · Gemini adapter
Depends on: T12 · Size: M · Test review: — · Security rows: S7

## Goal
Capture a Gemini chat page into a structured transcript: ordered turns, roles, code, tables,
citations and attachments.

## Why
AC-01. Gemini → Claude is the brief's showcase pair, and Gemini has no API for chat history, so
page capture is the main path.

## Read before starting (only these)
- `specs/plan/adapters.md` §Structured adapters, §Fixture rules
- Skill: `write-source-adapter` (load it; follow it step by step)

## Human prerequisites (blocking)
1. In Gemini, create **two** chats with synthetic content following `docs/demo-chats.md`
   (Gemini chat 1 and chat 2).
2. For each: DevTools → select the conversation container → Copy → Copy outerHTML → save as
   `packages/adapters/fixtures/gemini/chat-01.html`, `chat-02.html`. Remove `<script>` tags.
3. Write `chat-0N.expected.json` checkpoints (the skill gives the format): number of turns, role
   sequence, which turn has code and its first line, which turn has the image and the PDF.
**If these files are missing, stop and ask. Do not invent selectors.**

## Deliverables
- `packages/adapters/src/gemini/selectors.ts` (versioned), `gemini/index.ts` implementing
  `SourceAdapter` with `id: "gemini"`, `version: "0.1"`, `matches` for `gemini.google.com`.
- Registered in the registry; content-script bundle added to the extension build.
- `packages/adapters/test/gemini.test.ts`.

## Acceptance criteria → tests
| # | Criterion | Test (`gemini.test.ts`, jsdom over the fixtures) |
| --- | --- | --- |
| 1 | Turn count and role sequence match the checkpoints | `AC-01 gemini turns and roles` |
| 2 | Code parts are byte-identical to the fixture's `code` text; language detected where shown | `AC-01 gemini code exact` |
| 3 | Tables → Markdown; links in answers → citations | `AC-01 gemini tables and citations` |
| 4 | Uploaded image and PDF appear as attachments (`origin: "user_upload"`), file chips without readable bytes are `listed` | `AC-01 gemini attachments` |
| 5 | Only the visible variant of a regenerated answer is captured | `AC-01 gemini followed branch only` |
| 6 | A fixture with the conversation container removed → `capture_empty` / `parse_failed`, never an empty transcript | `AC-04 gemini empty page` |
| 7 | Manual: capture the live demo chat in Chrome → Select shows the same turns | record in notes |

## Out of scope
Fetching uploaded files from Google's storage (forbidden: private endpoints). The drop zone (T16).

## Stop and ask if
The live page and the fixture disagree (selectors pass on fixture but fail live): save a new fixture
and ask the human to confirm before changing selectors; bump `version`.

## Done when
- [ ] Tests pass; `pnpm check` green; manual criterion recorded
- [ ] `finish-task` run

## Implementation notes
