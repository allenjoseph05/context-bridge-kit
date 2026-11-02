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

## Out of scope
Encryption (designed, not built). Index format (T10 defines it; store it as opaque JSON here).

## Stop and ask if
Windows permission semantics block a test; document and skip that assertion on Windows only.

## Done when
- [ ] Tests pass; `pnpm check` green
- [ ] `finish-task` run

## Implementation notes
