# Spec: Cross-Assistant Context Bridge

What and why. How it is built lives in `plan.md`. Decisions behind this spec are in
`docs/design/` (needs, landscape, technical design) and `decisions.md`.

## Problem
A user has useful context in a conversation with one AI assistant and wants to continue in
another without starting over. Copy-paste loses files, buries decisions in noise, leaks secrets,
and overflows the destination's context window. No assistant offers an API to read chat history.

## Goal
Move selected messages or a concise, cited summary — plus the files and outputs the work depends
on — from any assistant to any other, securely and reliably. Gemini → Claude is the showcase pair.

## Users and why they move context
| Profile | Motivation | What matters most |
| --- | --- | --- |
| Continue (default) | Another model fits the next step better | Decisions and constraints survive |
| Rescue | Hit a rate limit or context limit | Speed: continue within a minute |
| Second opinion | Verify an answer | Independence: the reviewer is not biased by the source |

Switch, Share and Sync profiles are designed but out of scope for this build.

## User stories
- **US-1 Continue.** As a user, I can select messages from a chat and move them, verbatim or as a
  cited summary, into another assistant, so it continues without re-explaining.
- **US-2 Rescue.** As a blocked user, I can move the current task and the last turns in seconds,
  without waiting for a model.
- **US-3 Second opinion.** As a user, I can send the question and the facts to another assistant
  without the first assistant's answer, so the review is independent.
- **US-4 Files.** As a user, the images, PDFs, data files and code my chat depends on travel with it,
  or I am told exactly which ones did not and how to add them.
- **US-5 Detail on demand.** As a user, the destination gets a compact pack first and can fetch any
  earlier turn or file when it needs it.
- **US-6 Any assistant.** As a user, I can capture from any assistant site and deliver to any
  assistant, even when only paste is possible.
- **US-7 Control.** As a user, I see and approve exactly what leaves my machine, and secrets are
  hidden by default.
- **US-8 Trust.** As a reviewer, I can see measured quality, not claims.

## Acceptance criteria
Each criterion becomes at least one test named with its ID.

### Capture (US-1, US-6)
- **AC-01** Capturing a supported chat page (Gemini, ChatGPT) returns ordered turns with roles and
  typed parts; code parts are byte-identical to the code text shown on the page.
- **AC-02** Capturing a text selection on any other site returns a transcript marked
  `confidence: "inferred"`.
- **AC-03** Pasted text with role markers (`User:`, `You:`, `Assistant:`, `ChatGPT:`, `Gemini:`,
  `Claude:`, `Model:` at line start) is split into turns; text without markers becomes one user turn
  plus a warning.
- **AC-04** A capture that finds no turns returns a typed error and the UI offers paste. An empty
  transcript is never produced.

### Processing (US-4, US-7)
- **AC-05** Invisible and control characters are removed; secrets and personal data are replaced by
  stable placeholders before any model call; original values are never written to disk, except a
  value the user explicitly reveals at review: revealing is the user's choice to share it, so it may
  appear in the approved envelope and its stored copy (the pack marks that redaction `revealed`).
  Values not revealed never reach disk.
- **AC-06** Instruction-like text (addressed to an AI) is flagged, not deleted, and shown at review.
- **AC-07** Files over 25 MB, more than 50 files, and archives are refused with a reason; image
  metadata is stripped; PDF text is extracted (scanned PDFs flagged); CSV files are summarised;
  every file ends with a status: carried, extracted, listed or unavailable.

### Compilation (US-1, US-2, US-3, US-5)
- **AC-08** The pushed pack never exceeds the effective token budget.
- **AC-09** Coverage: every captured turn and attachment is either pushed or listed in the manifest
  with a reason (`condensed`, `budget`, `profile`, `unavailable`, `excluded_by_user`,
  `ungrounded`). Consecutive turns may be listed as one range.
- **AC-10** Code, table and math parts appear byte-identical (equal SHA-256) or not at all; a code
  block is never cut.
- **AC-11** Every condensed item cites at least one existing turn and an evidence quote found in it;
  items that fail are flagged `ungrounded` and excluded unless the user keeps them.
- **AC-12** When a decision is reversed later in the chat, the later decision is active and the
  earlier one is marked superseded.
- **AC-13** Rescue uses no model by default. Second opinion in blind mode contains no content that
  originated from the source assistant.
- **AC-14** If the model is unavailable or its output fails validation twice, a verbatim pack is
  produced with a visible notice.

### Consent and delivery (US-5, US-6, US-7)
- **AC-15** Nothing is stored or delivered before approval. Approval carries the hash of the last
  preview; a mismatch is rejected.
- **AC-16** The envelope starts with a fixed notice that the content is data, not instructions, and
  uses a random fence that does not occur in the content.
- **AC-17** The clipboard route yields the envelope text; the bundle route yields a zip with
  `pack.md`, `files/` and `manifest.json`.
- **AC-18** The MCP server exposes exactly five tools, all annotated read-only; only committed,
  unexpired packs are visible; each response is at most 4,000 tokens; every call is audited.
- **AC-19** `get_attachment` returns images as MCP image content and documents as text ranges.

### Platform and security (US-7)
- **AC-20** No component listens on a network port. The host accepts messages only from the
  configured extension origin.
- **AC-21** Packs expire (default 7 days) and are deleted with their transcript and unreferenced
  files on next start; the user can delete a pack.
- **AC-22** The audit log has one line per event with time, IDs, counts and hashes, never content.
- **AC-23** The model endpoint must be loopback unless `CB_ALLOW_REMOTE_MODEL=1` is set.

### Reliability (US-8)
- **AC-24** `pnpm eval` runs offline and writes a results table: must-carry recall, faithfulness,
  artifact integrity, redaction recall, injection resistance, coverage, retrieval success,
  continuation accuracy, tokens pushed, time.
- **AC-25** Re-transferring a chat that grew only extracts the new chunks (cache hit for the rest).

## Out of scope (this build)
- Switch, Share and Sync profiles; official export parsers (ChatGPT, Claude, Google Takeout).
- Remote MCP connector for web clients; vendor memory exporters.
- OCR, Word/slides/audio extraction, image description with a vision model, embedding retrieval.
- Encrypting the vault (file permissions only).
- Mobile apps; typing into another assistant's UI; background or scheduled capture.
- Any backend, account or telemetry.
