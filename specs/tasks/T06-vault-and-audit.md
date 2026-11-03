# T06 · Vault, expiry, audit (`@cb/vault`)
Depends on: T01, T03 · Size: M · Test review: — · Security rows: S5, S10, S15

## Goal
A small storage library for packs, envelopes, transcripts, indexes, files and the extractor cache,
with user-only permissions, atomic writes, expiry, deletion, and a content-free audit log.

## Why
AC-21, AC-22. The host (T07) and MCP server (T11) both read the vault; one library keeps the
layout and the rules in one place.

## Read before starting (only these)
- `specs/plan/host.md` §Vault layout, §Audit

## Deliverables
- `packages/vault/src/index.ts`: `openVault({ root?, now? })` returning:
  `writePack(pack, envelope, transcript, index)`, `readPack(id)`, `readEnvelope(id)`,
  `readTranscript(id)`, `readIndex(id)`, `listPacks()` (unexpired, as `PackMeta[]`),
  `deletePack(id)`, `sweepExpired()`, `putFile(bytes) → sha256`, `getFile(sha)`,
  `putText(sha, text)`, `getText(sha)`, `cacheGet(key)`, `cachePut(key, value)`,
  `audit(event)`, `readConfig()`, `writeConfig()`.
- Root from `CB_VAULT` or `~/.context-bridge`; folders created with mode 700, files 600
  (skip mode checks on Windows, note it).
- Atomic writes (temp file + rename). Clock injectable (`now`).
- `deletePack` and `sweepExpired` remove pack, envelope, transcript, index, and files no longer
  referenced by any remaining pack. Every removal writes an audit event.
- Reads, deletes and id-keyed writes return typed results `{ ok: true, value } | { ok: false, error:
  { code: "not_found" | "invalid_id" | "invalid" } }`; ids, shas and cache keys are validated by
  regex before any filesystem access. `audit()` throws on unknown fields (a programming error) and
  its parameter type makes them a compile error. A pack references `files/<sha>[.txt]` for every
  `attachment.sha256` in its stored transcript. `sweepExpired` also removes orphan files older than
  24 h and cache entries older than `expiryDays`. Crash simulation uses the undocumented
  `_testHooks.beforeRename` option, never passed by host or MCP server.

## Acceptance criteria → tests
| # | Criterion | Test (`packages/vault/test/…`, using a temp dir) |
| --- | --- | --- |
| 1 | Write then read returns equal objects; envelope text identical | `vault.test.ts › T06 round trip` |
| 2 | Folders are 700 and files 600 on POSIX | `vault.test.ts › S15 permissions` |
| 3 | A pack past `expiresAt` is not listed and is deleted by `sweepExpired`, with its envelope, transcript, index and unreferenced files; a file still referenced by another pack stays | `expiry.test.ts › AC-21 expiry with fake clock` |
| 4 | `deletePack` removes the same set and audits `deleted` | `expiry.test.ts › AC-21 user delete` |
| 5 | `putFile` is content-addressed: same bytes → same sha, stored once | `files.test.ts › T06 content addressed` |
| 6 | Audit lines are valid JSON with `ts` and `event`; the audit API rejects fields outside the allowed set | `audit.test.ts › AC-22 audit shape` |
| 7 | After writing `small-chat.json` (sanitised by `@cb/sanitizer`) as a pack, no file in the vault contains the fake key or email from the raw fixture | `audit.test.ts › AC-05 AC-22 no secrets on disk` |
| 8 | A crash between temp write and rename leaves the old file intact (simulate by throwing before rename) | `vault.test.ts › T06 atomic writes` |
| 9 | `sweepExpired` with a fake clock deletes files in `files/` that no pack references and are older than 24 h (younger orphans stay), and cache entries older than `expiryDays`; each deletion audits `expired` without content | `expiry.test.ts › T06 orphan files and stale cache` |
| 10 | Every read, write and delete function rejects an id, sha or cache key such as `../../etc/passwd` with `invalid_id` before touching the disk; a file outside the vault stays intact | `vault.test.ts › T06 path traversal` |

## Out of scope
Encryption (designed, not built). Index format (T10 defines it; store it as opaque JSON here).

## Stop and ask if
Windows permission semantics block a test; document and skip that assertion on Windows only.

## Done when
- [x] Tests pass; `pnpm check` green
- [x] `finish-task` run

## Implementation notes
- `packages/vault/src/index.ts`: `openVault({ root?, now? }) → Vault` (sync `node:fs`; Node only, never
  bundle into the extension). Also exports `VaultResult`, `VaultErrorCode`, `AuditInput`, `AuditEvent`,
  `AuditEventName` (zod enum), `VaultConfig`, `SweepReport`, `VaultOptions`.
- Reads/deletes/id-keyed writes return `{ ok, value } | { ok: false, error: { code } }` with
  `not_found | invalid_id | invalid`; ids/shas/cache keys are regex-checked before any path is built.
- `writePack` writes transcript, index, envelope, then the pack file last (so `listPacks` never sees a
  half-written pack). Every write: temp file `<target>.<hex>.tmp` + fsync + rename; temp removed on failure.
- `listPacks` filters expired packs but does not delete; the host (T07) must call `sweepExpired()` on
  start and on `list_packs`. `deletePack`/sweep audit `deleted`/`expired` with `counts.files`.
- File refs = `attachment.sha256` in the stored transcript. `putFile`, `putText`, `cachePut` set mtime
  from the injected clock; orphans > 24 h and cache entries > `expiryDays` are removed by `sweepExpired`.
- `audit()` throws (zod strict) on unknown fields or free-text values: `tool` must be `[a-z_]+`, count
  keys `[A-Za-z]+`, ids must match their regexes. Host/MCP callers should pass literals only.
- `readConfig()` returns `{ defaults: { expiryDays: 7 } }` when `config.json` is absent or invalid.
- Windows: mode bits are set but not enforced; `S15 permissions` is skipped on win32 and has **not yet
  run on POSIX** (WSL here has no Node). Run it on Linux/macOS before G1.
- Test-only `_testHooks.beforeRename` (undocumented). Vault tests import `@cb/compiler` etc. via `dist`:
  run `pnpm build` first if those packages changed.
