# T01 · Schemas and IDs (`@cb/schema`)
Depends on: T00 · Size: M · Test review: — · Security rows: —

## Goal
Every shared shape exists once, as a zod schema with an inferred TypeScript type, plus ID helpers,
the wire-protocol messages, and a JSON schema for the model's output.

## Why
The constitution makes `@cb/schema` the single source of truth. Every later package validates at
its boundary with these schemas, so mistakes surface as validation errors, not silent drift.

## Read before starting (only these)
- `specs/plan/data-model.md` (all)
- `specs/plan/protocol.md` §Extension → host, §Host → extension, §Error codes

## Deliverables
- `packages/schema/src/ids.ts`: `turnId(n)`, `attachmentId(n)`, `itemId(n)`, `newPackId()`,
  `newSessionId()`, `newPreviewId()` (crypto random hex), and a regex per ID kind.
- `packages/schema/src/transcript.ts`: `Part`, `Turn`, `Attachment`, `Transcript`, `CaptureError`.
- `packages/schema/src/items.ts`: `ItemKind`, `ItemDraft`, `Item`, `itemDraftsJsonSchema()`
  (uses `zod-to-json-schema`, returns the schema of `{ items: ItemDraft[] }`).
- `packages/schema/src/pack.ts`: `Route`, `Profile`, `DestinationProfile`, `ManifestEntry`,
  `ContextPack`, `PackMeta` (id, title, source, profile, createdAt, expiresAt, stats).
- `packages/schema/src/protocol.ts`: `ExtToHost` and `HostToExt` discriminated unions on `type`,
  `ErrorCode` enum, `Chunk` message.
- `packages/schema/src/hash.ts`: `canonicalJson(value)` (sorted keys, no whitespace) and
  `sha256Hex(data: string | Uint8Array)` using `node:crypto` **and** a WebCrypto variant
  `sha256HexWeb` for the extension.
- `packages/schema/src/index.ts` re-exports everything.
- Runtime dependencies: `zod`, `zod-to-json-schema`.

## Acceptance criteria → tests
| # | Criterion | Test (`packages/schema/test/…`) |
| --- | --- | --- |
| 1 | Valid example objects of every schema parse | `schemas.test.ts › T01 valid examples parse` |
| 2 | A turn with zero parts, an item with no `sourceTurns`, an evidence over 200 chars, an unknown part kind, and a bad ID format are rejected | `schemas.test.ts › T01 invalid examples rejected` |
| 3 | `decision` and `constraint` drafts without `topic` are rejected (zod refine) | `schemas.test.ts › T01 topic required for decisions` |
| 4 | Every message type in protocol.md parses; an unknown `type` is rejected | `protocol.test.ts › T01 protocol messages` |
| 5 | `itemDraftsJsonSchema()` is a JSON Schema object with `items` array of objects requiring `kind, text, sourceTurns, evidence, attachmentRefs, origin` | `items.test.ts › T01 json schema for model output` |
| 6 | `canonicalJson` is key-order independent; `sha256Hex` and `sha256HexWeb` agree on the same input | `hash.test.ts › T01 canonical hashing` |
| 7 | Generated IDs match their regexes and differ across 1,000 calls | `ids.test.ts › T01 ids` |

## Steps
1. Write the tests from the table, using example objects copied from data-model.md.
2. Implement schemas exactly as named in data-model.md; field names must match.
3. Export inferred types (`export type Transcript = z.infer<typeof Transcript>`).

## Out of scope
Any logic beyond validation and IDs. Profiles' budget numbers (T04).

## Stop and ask if
data-model.md and protocol.md disagree on a field, or a field's meaning is unclear.

## Done when
- [x] All tests above pass; `pnpm check` green
- [x] No other package defines its own copy of these types
- [x] `finish-task` run

## Implementation notes
- Built `packages/schema/src/{ids,transcript,items,pack,protocol,hash}.ts`, all re-exported from `index.ts`.
  Each schema is exported under its type name (`Transcript` is both the zod schema and the inferred type).
- Extra exports later tasks can use: `TurnIdSchema`, `AttachmentIdSchema`, `PackIdSchema`, `Sha256Hex`,
  `IsoDateTime`, `TranscriptSource`, `PackStats`, `Redaction`, `Flag`, `Edits`, `ProgressStage`,
  `Deliverable`, `ItemDrafts` (parse model output with this), one `*Msg` schema per message,
  and the regexes `TURN_ID`, `ATTACHMENT_ID`, `ITEM_ID`, `PACK_ID`, `SESSION_ID`, `PREVIEW_ID`, `TURN_RANGE`, `SHA256_HEX`.
- `turnId(n)`/`attachmentId(n)`/`itemId(n)` are 1-based and throw a RangeError outside 1–999 (a programming error, not an expected failure).
- Random IDs use `crypto.getRandomValues` (Node 20 global and browser), so they work in the extension too.
- `hash.ts` imports `node:crypto` (for `sha256Hex`), as the card requires. The extension (T08) must import
  `sha256HexWeb` without bundling `node:crypto`: a bundler alias, or a `@cb/schema/web` entry if needed.
- `itemDraftsJsonSchema()` inlines everything (`$refStrategy: "none"`), draft-07. The decision/constraint topic rule
  can't be expressed in JSON Schema, so validate model output with `ItemDrafts`.
- zod 3.25.x, not zod 4: zod-to-json-schema silently returns an empty schema for zod 4 (see decisions.md).
- Objects strip unknown keys (zod default); only `Edits` is strict. `compile.selection` is `string[]` with no ID-format check
  (protocol.md does not say which IDs it may hold).
- Tooling: root dev dependency `@types/node@^20`. `packages/schema/tsconfig.json` sets `"types": ["node"]` because TypeScript 6
  defaults `types` to `[]` and the package build otherwise misses Node globals. Other Node packages will need the same.
- Test files were changed once after the test commit (370908e): lint/format only, plus one added assertion that
  replaced an unused variable. No assertion was weakened.
