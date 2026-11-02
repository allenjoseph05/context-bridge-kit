# T09 · Review and Deliver; clipboard and bundle routes
Depends on: T08 · Size: M · Test review: — · **Gate G1** · Security rows: S8, S14

## Goal
The user sees the exact payload, can edit it, approves it (consent 2), and receives it by clipboard
or as a bundle download. Completes gate G1.

## Why
AC-15, AC-17, US-7. Consent must be visible and binding: what the user approves is what leaves.

## Read before starting (only these)
- `specs/plan/extension.md` §Side panel screens (Review, Deliver), §UI rules
- `specs/plan/protocol.md` §Host → extension, §Hash binding

## Deliverables
- **Review** screen: envelope in a monospace scroll area; highlighted placeholders (redactions),
  flagged spans (possible instruction), notices; cut list with "include" (→ `revise moveToPush`);
  per-redaction "reveal" (→ `revise unredact`) with a confirm dialog naming the risk; per-turn
  remove (→ `revise moveToManifest`); destination line + data note ("The destination's own data
  policy applies once you send."); "Approve and send" sends `approve { previewId, hash }`.
- **Deliver** screen per route:
  - clipboard: `navigator.clipboard.writeText` **only after** `committed`; buttons to open
    gemini.google.com, claude.ai, chatgpt.com in a new tab;
  - bundle: Blob from `zipBase64` → `chrome.downloads.download` with the file name;
  - mcp: shows the instruction sentence and a copy button (MCP itself arrives in T11);
  - "Delete this pack" → `delete_pack`; "New transfer".
- Host side, if missing: `revise` handling for the four edit kinds (recompile, new previewId/hash).

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | Nothing is written to the clipboard or downloaded before `committed` is received | `panel.test.tsx › AC-15 no delivery before approval` (spy on APIs) |
| 2 | `approve` sends the previewId and hash of the **currently displayed** preview; after a `revise`, the new pair is used | `panel.test.tsx › AC-15 approve binds displayed preview` |
| 3 | Reveal requires confirmation and results in a new preview whose envelope contains the value | `panel.test.tsx › AC-05 reveal is explicit` |
| 4 | Each `revise` kind changes the preview as expected (host side) | `packages/host/test/revise.test.ts › T09 revise edits` |
| 5 | Bundle download uses the file name from `committed` and the zip bytes decode | `panel.test.tsx › AC-17 bundle download` |
| 6 | Flagged and redacted spans are rendered as text with markers, not HTML | `panel.test.tsx › S14 review renders text` |

## Gate G1 (run the `gate-check` skill after this task)
Manual: paste a synthetic chat → Select → Prepare → Review (redaction visible) → Approve →
clipboard → paste into Claude or Gemini and ask "What is the goal and the next step?". Repeat with
the bundle route and upload the zip contents. Record results in `tasks.md` §Gates notes.

## Out of scope
MCP tools (T11). Images in Review (T16).

## Stop and ask if
Clipboard writes from the side panel are blocked in your Chrome version; propose the fallback
(a "Copy" button the user clicks, which is a user gesture).

## Done when
- [ ] Tests pass; `pnpm check` green
- [ ] G1 passed and recorded
- [ ] `finish-task` run

## Implementation notes
