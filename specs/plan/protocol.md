# Wire protocol: extension ↔ bridge host

Chrome native messaging over stdio. Messages are defined as a zod discriminated union on `type`
in `@cb/schema` (`ExtToHost`, `HostToExt`). Unknown or invalid messages get an `error` reply and
change no state.

## Framing
- Each message: 4-byte unsigned length in **native byte order** (little-endian on x86 and ARM; use
  `os.endianness()`), then UTF-8 JSON.
- Chrome limits: host → extension ≤ 1 MB per message; extension → host ≤ 64 MB.
- Host → extension messages whose JSON exceeds **900,000 bytes** are split into
  `{ type: "chunk", messageId, index, count, data }` where `data` is a slice of the JSON string.
  The extension reassembles by `messageId`, then parses. Chunking is transport-level: the sender
  and receiver of real messages never see it.

## Session model
- The extension opens one port with `runtime.connectNative("com.contextbridge.host")`; the host
  lives while the port is open. Sessions are in memory, keyed by `sessionId`.
- If the port drops, all sessions are lost; the UI returns to the Capture screen with a message.
- Every request carries `requestId` (uuid). Every reply echoes it.

## Extension → host
| type | Fields | Reply |
| --- | --- | --- |
| `hello` | `protocol: 1` | `hello_ok { protocol, hostVersion, model: { available, name? } }` |
| `ingest` | `transcript: Transcript` | `ingested { sessionId, turns, attachments, flags, redactions, missingFiles, suggestedProfile, suggestedSelection }` |
| `add_file` | `sessionId, attachmentId?, name, mime, dataBase64` | `file_added { attachment }` |
| `compile` | `sessionId, selection: string[], profile, route, mode: "condensed" \| "verbatim", blind?: boolean` | zero or more `progress { stage, done, total }`, then `preview` |
| `revise` | `sessionId, previewId, edits` | `preview` |
| `approve` | `sessionId, previewId, hash` | `committed` |
| `delete_pack` | `packId` | `deleted { packId }` |
| `list_packs` | — | `packs { packs: PackMeta[] }` |

`edits = { removeItemIds: string[], keepUngroundedIds: string[], unredact: string[], moveToManifest: string[], moveToPush: string[] }`.

### Field types (T01)
- `requestId`: a uuid string on every extension → host message; every host → extension reply
  echoes it. A `chunk` carries it only optionally (it is added after the reply is built).
- `Flag = { ref: string; kind: "possible_instruction" | "redacted" | "ungrounded"; match?: string; index?: number }`.
  `ref` is a turn, attachment or item id; `match` is the matched text (never a redacted value);
  `index` is its character offset. Used by `ingested.flags` and `preview.flags`.
- `ingested`: `turns: Turn[]` (the sanitised turns the host will actually use, so Select shows
  them), `attachments: Attachment[]`, `flags: Flag[]`,
  `redactions: Array<{ placeholder: string; kind: string }>` (no values),
  `missingFiles: string[]` (attachment ids), `suggestedProfile: Profile`,
  `suggestedSelection: string[]` (turn ids only).
- `progress`: `stage: "attachments" | "extract" | "ground" | "compile"`; `done`, `total` are
  non-negative integers.
- `preview.stats` has the shape of `ContextPack.stats`.
- `edits` is a strict object; all five arrays are required.

## Host → extension
- `preview { sessionId, previewId, hash, envelope: string, images: Array<{ attachmentId, mime, dataBase64 }>, flags, cutList: ManifestEntry[], notices: string[], stats }`
- `committed { packId, route, deliverable }` where `deliverable` is one of
  `{ kind: "clipboard", text }`, `{ kind: "bundle", fileName, zipBase64 }`,
  `{ kind: "mcp", packId, instruction }` (the sentence the user types in the destination).
- `error { requestId, code, message, recoverable: boolean, fallback?: "paste" | "verbatim" | "clipboard" }`

## Error codes
`invalid_message`, `unknown_session`, `capture_empty`, `file_refused`, `model_unavailable`,
`model_invalid_output`, `over_budget_orientation`, `hash_mismatch`, `vault_error`, `internal`.

## Hash binding (AC-15)
`hash = sha256(envelope + "\n" + JSON.stringify(images.map(i => i.attachmentId)))`, lowercase hex.
The host keeps the last preview per session. `approve` succeeds only if `previewId` and `hash`
match that preview; otherwise `error { code: "hash_mismatch" }` and nothing is written.
