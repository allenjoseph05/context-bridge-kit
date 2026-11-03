# Bridge host and vault (`@cb/host`, `@cb/vault`)

## Host process
- Started by Chrome through the native messaging manifest; name **`com.contextbridge.host`**.
- Entry `packages/host/dist/main.js`; launcher `packages/host/bin/context-bridge-host` (sh) and
  `context-bridge-host.cmd` (Windows) because Chrome needs an executable path.
- First argument is the caller origin (`chrome-extension://<id>/`). If it differs from the
  configured extension ID, exit with code 1 before reading stdin (AC-20).
- **stdout carries the protocol only.** All logs go to stderr. ESLint `no-console` with
  `allow: ["error", "warn"]` in this package.
- Opens no network port. The only outbound connection is the model provider (loopback).
- Exits with code 0 when stdin closes (port disconnected); all sessions and their redaction values
  are discarded with the process. An incoming frame whose declared length exceeds 64 MiB gets
  `error invalid_message`; its bytes are skipped as they arrive, never buffered whole.
- The install scripts write node's absolute path into the launcher (Chrome does not use the
  shell's PATH).

## Pipeline per session (pure stages, wired in `session.ts`)
1. `ingest` → validate (zod) → normalise ids → sanitise (`@cb/sanitizer`; always, with a fresh
   per-session context, even if the extension already sanitised) → register attachments →
   reply with counts, flags, missing files, suggested profile (`continue`) and suggested selection.
2. `add_file` → `@cb/attachments` → update attachment → reply.
3. `compile` → if `mode = "condensed"` and the model is available: `@cb/extractor` with progress
   messages; otherwise verbatim with a notice → `@cb/compiler` → envelope → preview with hash.
4. `revise` → recompile with the user's edits (no new model calls) → new preview.
5. `approve` → check hash → write pack, transcript, index, audit → deliverable per route.

**Suggested selection** (deterministic): the last 10 turns plus any earlier turn that contains a code
part, a table, an attachment, or a number with a unit. The user can change it.

## Vault layout (`@cb/vault`)
```
~/.context-bridge/            (CB_VAULT overrides; mode 700)
  packs/<packId>.json         ContextPack (mode 600)
  packs/<packId>.envelope.txt the exact approved envelope
  transcripts/<packId>.json   sanitised transcript (redaction values never stored)
  index/<packId>.json         BM25 index
  files/<sha256>[.txt]        attachment bytes and extracted text
  cache/extract/<key>.json    extractor cache
  audit.jsonl                 append-only events
  config.json                 { extensionId, model, defaults }
```
- Writes are atomic (write temp file, then rename).
- **Packs are never overwritten.** `writePack` refuses with `exists` when `hasPack(id)` (any of the
  pack's four files exists). The host draws pack ids with `freshPackId`: a taken id is redrawn, up
  to 5 draws, then `vault_error`.
- **Expiry (AC-21):** packs expire 7 days after creation (`config.defaults.expiryDays`). On host
  start and on `list_packs`, expired packs are deleted with their envelope, transcript and index; a
  file in `files/` is deleted when no remaining pack references it. Clock is injectable for tests.
- `deletePack(packId)` does the same on demand.
- **File references:** a pack references `files/<sha>` and `files/<sha>.txt` for every
  `attachment.sha256` in its stored transcript.
- **Orphan cleanup:** `sweepExpired` also deletes files in `files/` that no pack references and
  whose mtime is older than 24 h (the grace period protects files of a session still in progress;
  `putFile` of existing bytes refreshes the mtime), and `cache/extract/` entries older than
  `expiryDays`. Each deletion writes an `expired` audit event without content.
- **Ids before disk:** pack ids, shas and cache keys (`[A-Za-z0-9_-]{1,128}`) are checked by regex
  before any filesystem access; anything else returns `invalid_id`.

## Audit (AC-22)
One JSON line per event: `{ ts, event, sessionId?, packId?, counts?, sha256?, tool?, route? }` where
`event ∈ captured | previewed | approved | delivered | served | deleted | expired | refused`.
**Never** text, file names of user content, or redaction values. A test scans the log for every
planted string from the fixtures and expects none.
