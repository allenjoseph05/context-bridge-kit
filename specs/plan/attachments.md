# Attachments (`@cb/attachments`)

Each content type gets its own path because each fails differently. Pattern for every file:
**check limits → process in an isolated worker → store by hash → set status → summary line**.

## Limits and safety (AC-07, N13)
- Max **25 MB** per file, **50 files** per session. Over the limit → refused with a reason.
- Archives refused by extension and magic bytes (`.zip .rar .7z .tar .gz .tgz`): removes zip bombs
  and path traversal.
- Type is decided by **magic bytes**, not the file name. Mismatch → trust bytes, add a warning.
- Processing runs in a `worker_threads` worker with a **20 s** timeout and a memory limit
  (`resourceLimits.maxOldGenerationSizeMb: 512`). No macros, scripts or embedded objects execute.
- Extracted text goes through the sanitiser like any turn text.

## Per type
| Type | Detect | Processing | Status | Summary line |
| --- | --- | --- | --- | --- |
| Image (png, jpeg, webp, gif) | magic bytes | `sharp`: re-encode **without metadata** (drops EXIF/GPS), downscale so the longest side ≤ 1,568 px, keep format (gif → png) | `carried` | `image · 1200×800 · png` |
| PDF | `%PDF` | `pdfjs-dist` text per page; if total text < 20 chars per page → flag `scanned_pdf` | `extracted` (or `listed` if scanned) | `pdf · 18 pages` |
| CSV / TSV | extension + text sniff | `papaparse`: header, row count, 5 sample rows, per-column type guess (number/date/text) | `extracted` | `csv · 1,204 rows · 7 columns` |
| Plain text, Markdown, JSON, source code | UTF-8 decode succeeds | as text | `extracted` | `text · 3,400 chars` |
| Word, slides, audio, other | — | none (designed: extraction later) | `listed` | `docx · not processed; attach it directly` |

## Storage
- Original (post-metadata-strip for images) bytes at `vault/files/<sha256>`; extracted text at
  `vault/files/<sha256>.txt`. Content-addressed: duplicates are stored once.
- `Attachment.sha256`, `bytes`, `extractRef`, `summary`, `status` are filled in.
- PDF extraction records `pageOffsets` (character start of each page), computed after sanitising,
  so `get_attachment(…, page)` can find a page (a form-feed page break would not survive: the
  sanitiser strips C0 control characters).

## Excerpts for the pack
When the compiler wants an `excerpt` of a document, the host picks the top 3 ~500-token chunks of
its extracted text by BM25 against the text of the active items citing it (or the turn it appears
in), then trims to fit. Excerpts are verbatim text, never rewritten.

## Missing files
Most assistant pages show uploads only as a filename chip. Those attachments arrive as
`status: "listed"` with reason "drop the original to include it". The side panel shows them with a
drop zone; dropping a file sends `add_file` with the `attachmentId`, and the host processes it.
