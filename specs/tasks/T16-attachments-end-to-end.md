# T16 · Attachments end to end: page images, drop zone, excerpts
Depends on: T09, T11, T13, T15 · Size: M · Test review: — · **Gate G3** · Security rows: S11, S14

## Goal
Files from a captured chat reach the destination by every route: images read from the page or
dropped by the user, documents as excerpts, everything else listed — with nothing dropped silently.

## Why
US-4, F13, F14, N14. Completes the "all inputs" promise with a clear worst case: the manifest and
the drop zone tell the user exactly what to add.

## Read before starting (only these)
- `specs/plan/attachments.md` §Excerpts for the pack, §Missing files
- `specs/plan/compiler.md` §Priority order step 5 (forms: image → excerpt → summary)
- `specs/plan/protocol.md` rows `ingest`, `add_file`, `preview.images`
- `specs/plan/extension.md` §Side panel screens (Capture: drop zone; Review: thumbnails)

## Deliverables
- Extension: captured image bytes sent with `add_file` right after `ingest`; Capture screen lists
  attachments by status with a drop zone per `listed` file and a general "add file" zone.
- Host: `add_file` handled with `@cb/attachments`; attachments registered in the session; turns get
  `attachment` parts.
- Compiler (verbatim mode): attachments in pushed turns are pushed as `image` (if
  `acceptsImages`), else `excerpt` (top-3 BM25 chunks of extracted text against the turn text,
  verbatim, trimmed to fit), else `summary`; anything not pushed goes to the manifest.
- Preview: images included (`preview.images`); Review shows thumbnails.
- Routes: bundle includes original files under `files/`; MCP `get_pack` returns pushed images as
  image content; clipboard lists files with "download the bundle to include them".

- Replace the verbatim-mode attachment placeholder reason with the real push behaviour (T11: today
  every attachment in a pushed turn is listed with `why: "profile"`, "not pushed in verbatim mode").

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | After ingest + add_file of a png and a pdf, both attachments have final statuses and appear in turns | `packages/host/test/attachments.test.ts › AC-07 add_file` |
| 2 | Coverage holds with attachments for every route (`checkCoverage` = []) | `packages/compiler/test/attachments.test.ts › AC-09 attachments covered` |
| 3 | Clipboard route never contains image data; it lists images in the manifest | `…/attachments.test.ts › T16 clipboard lists images` |
| 4 | Excerpts are verbatim substrings of the extracted text | `…/attachments.test.ts › T16 excerpts verbatim` |
| 5 | Bundle contains the original (metadata-stripped) image and the PDF | `packages/compiler/test/bundle.test.ts › AC-17 bundle with files` |
| 6 | `get_pack` via MCP returns the pushed image as image content | `packages/mcp-server/test/tools.test.ts › AC-19 pushed images` |
| 7 | Dropped file larger than the limit → visible refusal, flow continues | `panel.test.tsx › AC-07 refusal shown` |

## Gate G3 (run `gate-check` after this task)
Manual: capture the Gemini demo chat with an image and a PDF; drop the PDF original when asked;
deliver by MCP to Claude Desktop and by bundle to another assistant; ask each destination about the
image and the PDF. Record results.

## Out of scope
Condensed mode's use of attachments in priority order (T19).

## Done when
- [ ] Tests pass; `pnpm check` green; G3 passed and recorded
- [ ] `finish-task` run

## Implementation notes
