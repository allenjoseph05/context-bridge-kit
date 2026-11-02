# T07 · Bridge host: protocol, sessions, approval, install
Depends on: T02, T05, T06 · Size: L · **Test review: required** · Security rows: S6, S8

## Goal
A native messaging host that speaks the framed protocol, runs the verbatim pipeline per session,
returns previews bound by hash, commits only on a matching approval, and can be installed for Chrome.

## Why
AC-15, AC-20, and the base for every route. This is the trusted core: no port, no network, stdout
reserved for the protocol.

## Read before starting (only these)
- `specs/plan/protocol.md` (all)
- `specs/plan/host.md` §Host process, §Pipeline per session
- Skill: `native-messaging` (load it)

## Deliverables
- `packages/host/src/framing.ts`: `encode(obj) → Buffer`, `createDecoder(onMessage)` handling
  partial reads and multiple messages per read; native byte order via `os.endianness()`.
- `packages/host/src/chunking.ts`: split host → extension messages over 900,000 bytes into `chunk`
  messages; plus `reassemble()` used by tests and later by the extension.
- `packages/host/src/session.ts`: in-memory sessions; handlers for `hello`, `ingest`, `compile`
  (verbatim only for now; `mode: "condensed"` → verbatim with notice "condensed mode arrives in
  T19"), `revise`, `approve`, `delete_pack`, `list_packs`. `add_file` → `error` code
  `invalid_message` with message "attachments arrive in T15/T16".
- Suggested selection rule from host.md.
- `packages/host/src/main.ts`: checks the caller origin argument against `config.extensionId`
  (exit 1 on mismatch), runs `sweepExpired()`, then reads stdin.
- `packages/host/bin/context-bridge-host` and `.cmd` launchers.
- `scripts/install-host.sh` and `scripts/install-host.ps1`: take the extension ID, write the host
  manifest (`name: "com.contextbridge.host"`, `type: "stdio"`, absolute launcher path,
  `allowed_origins: ["chrome-extension://<ID>/"]`) to the user-level location for Chrome on macOS,
  Linux and Windows (registry key on Windows), and write `extensionId` into the vault config.
- On `approve`: write pack + envelope + sanitised transcript + empty index placeholder via
  `@cb/vault`; audit `approved`; return `committed` with the deliverable for the chosen route
  (clipboard text, bundle zip base64, or MCP instruction).

## Acceptance criteria → tests
Write the tests first, commit them, and stop for the human's test review.

| # | Criterion | Test (`packages/host/test/…`) |
| --- | --- | --- |
| 1 | Framing round-trips messages split across reads and several messages in one read | `framing.test.ts › T07 framing` |
| 2 | A 3 MB preview is sent as chunks ≤ 900,000 bytes each and reassembles to the original | `chunking.test.ts › T07 chunking` |
| 3 | Spawned host with the wrong origin argument exits with code 1 without replying | `main.test.ts › AC-20 caller origin enforced` |
| 4 | `hello` → `hello_ok` with protocol 1 | `session.test.ts › T07 hello` |
| 5 | `ingest` of `small-chat.json` returns counts, flags (fake key redacted, instruction flagged for `injection-chat.json`) and a suggested selection | `session.test.ts › AC-05 AC-06 ingest` |
| 6 | Invalid or unknown messages → `error invalid_message`, session state unchanged | `session.test.ts › T07 invalid messages` |
| 7 | `compile` → `preview` whose `hash` equals the formula in protocol.md | `session.test.ts › AC-15 preview hash` |
| 8 | `approve` with a stale previewId or wrong hash → `hash_mismatch` and **nothing written** to the vault | `session.test.ts › AC-15 hash mismatch writes nothing` |
| 9 | Before `approve`, the vault has no pack, envelope or transcript for the session | `session.test.ts › AC-15 nothing stored before approval` |
| 10 | `approve` with route clipboard/bundle/mcp returns the right deliverable kind; the stored envelope equals the previewed one | `session.test.ts › AC-17 deliverables` |
| 11 | The host source never writes to stdout except through `framing.encode` (lint rule + a test that spies on `process.stdout.write` during a full session) | `stdout.test.ts › T07 stdout is protocol only` |
| 12 | Install script dry-run (`--dry-run`) prints the manifest JSON with the absolute path and the given ID | manual; paste the output into Implementation notes |

## Human checkpoint
After the code is green: run `scripts/install-host.sh <any 32-char a–p id> --dry-run` and confirm
the manifest looks right. The real ID comes in T08.

## Out of scope
Extension code (T08). Model calls (T17). Attachments (T15). Index content (T11).

## Stop and ask if
Chrome's documented manifest locations differ from what the skill lists for your OS.

## Done when
- [ ] Test commit reviewed, then green; `pnpm check` green
- [ ] Dry-run output recorded below
- [ ] `finish-task` run

## Implementation notes
