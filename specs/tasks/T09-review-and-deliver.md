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
- Implement `edits.unredact` (reveal) host-side, per the AC-05 rule in decisions.md: revealed
  values may appear in the approved and stored envelope and are marked `revealed: true`. Remove
  the T07 `invalid_message` stub.

## UI rules
- After any failed compile or revise, clear the displayed preview; never leave an old preview
  approvable on screen.

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
- [x] Tests pass; `pnpm check` green
- [ ] G1 passed and recorded
- [x] `finish-task` run

## Implementation notes
- Built: host `revise` handles all four edit kinds; `unredact` replaces the T07 stub. `CompileParams.revealed` is cumulative and
  unknown placeholders are ignored. `revealTranscript` (session.ts) restores values in text/table/code/tool_output parts and
  recomputes turn hashes. Revealed redactions get `revealed: true` and their `redacted` flags are dropped from `preview.flags`.
  `Preview.transcript` (the revealed copy) is what approve stores.
- Panel: `ReviewScreen` (h1 "Review", `data-testid="review-stats"`, envelope via exported `markEnvelope(envelope, flags)` →
  `<mark data-kind>` text segments, Reveal → inline `role="alertdialog"` confirm, Remove tNNN / Include tNNN, destination +
  data note, Approve). `DeliverScreen` (clipboard auto-copy after `committed`, else a Copy button; Open Gemini/Claude/ChatGPT
  links; bundle Blob → `chrome.downloads.download`, URL revoked after 60 s; MCP instruction + Copy; Delete this pack; New transfer).
- A failed revise or approve returns to Select with the error (preview cleared). Revise/approve are ignored while another op
  is in flight (a synthetic click on the disabled Approve still reached the handler in jsdom).
- The "double Review header" reported at the start of T09 was a copy-paste mistake by the human, not a render bug. The test
  `T09 review renders its header once` is kept as a guard (heading, stats line, host line, envelope each appear once).
- Tests edited after the test commit: spy typing for lint (28fb376, approved). The exact pushed-token assertion first failed
  because pack id and fence are random; `createHost` now takes `newPackId` and `fenceRng` (HostOptions), and
  `harness({ deterministicIds: true })` uses them (dc8e446, replaces the loosened check from f4e3ce9).
- One `pnpm check` run had a file-level failure (6 tests never reported, likely `revise.test.ts`); not reproduced in 10
  verbose runs. Follow-up: T09b.
- Open: G1 manual run (human).
