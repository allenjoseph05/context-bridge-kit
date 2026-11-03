# T08 · Extension shell: manifest, port, Capture and Select
Depends on: T07 · Size: L · Test review: — · Security rows: S7

## Goal
A loadable MV3 extension with a side panel that connects to the host, takes pasted text, ingests it,
and lets the user choose profile, route, mode and turns, ending at the "Prepare" button.

## Why
US-6, US-7 (consent 1). The paste path through the real extension and host is the first half of G1.

## Read before starting (only these)
- `specs/plan/extension.md` §Manifest, §Files, §Side panel screens (Capture, Select, Working)
- `specs/plan/protocol.md` §Framing (chunk reassembly), §Session model
- Skill: `native-messaging`

## Human prerequisites
- Chrome installed. After the build, load `packages/extension/dist` via chrome://extensions
  (Developer mode → Load unpacked) and run `scripts/install-host.sh <printed ID>`.

## Deliverables
- `scripts/gen-extension-key.ts`: creates an RSA key pair in `packages/extension/key.pem`
  (git-ignored), writes the base64 public key into the manifest `key`, prints the extension ID.
- `packages/extension/manifest.json` exactly as in extension.md (plus icons).
- esbuild config: bundles `sw.ts`, `panel/index.tsx`, `panel.html`, and (empty for now) content
  scripts into `dist/`. Preact as the only UI dependency.
- `src/native.ts`: port wrapper — `request(msg) → Promise<reply>` keyed by `requestId`; progress
  callbacks; chunk reassembly (reuse the logic from `@cb/host/chunking` via a shared module in
  `@cb/schema` or copy with a test); timeout 180 s; reconnect on disconnect with a UI message.
- `src/sw.ts`: opens the side panel on action click (`sidePanel.setPanelBehavior`); owns the port;
  relays panel requests. No other state.
- Panel screens **Capture** (paste box + "Capture this chat" button disabled with tooltip "adapters
  arrive in T12") and **Select** (profile, blind toggle when Second opinion, route, mode, turn list
  with suggested ticks, live token meter using `@cb/tokens`) and **Working** (progress, cancel).
  "Prepare" sends `compile`; on `preview`, move to a placeholder Review screen showing the raw
  envelope text (full Review is T09).
- Paste parsing runs in the panel with `@cb/adapters/paste`; the transcript is sent with `ingest`.

## Acceptance criteria → tests
| # | Criterion | Test |
| --- | --- | --- |
| 1 | Built manifest equals extension.md's permissions and host permissions exactly (no extras) | `packages/extension/test/manifest.test.ts › S7 manifest minimal` |
| 2 | `native.ts` matches replies to requests by id, reassembles chunks, rejects on timeout | `native.test.ts › T08 port wrapper` (fake port) |
| 3 | Panel state machine: Capture → Select on `ingested`; Select → Working on Prepare; Working → Review on `preview`; any `error` shows message and fallback button | `panel.test.tsx › T08 state machine` (Preact testing library) |
| 4 | Token meter shows the effective budget for the chosen profile and route and turns red when the selection's raw tokens exceed it | `panel.test.tsx › AC-08 token meter` |
| 5 | Page text is rendered as text: a turn containing `<img src=x onerror=alert(1)>` appears literally | `panel.test.tsx › S14 no html injection` |
| 6 | Manual: load unpacked, install host, paste `small-chat.json` rendered as `User:/Assistant:` text, reach the placeholder Review screen | record in Implementation notes |

## Out of scope
Review details and delivery (T09). Page adapters (T12). Files (T16).

## Stop and ask if
`openPanelOnActionClick` or native messaging behaves differently from the plan in your Chrome
version; record what you observed in `decisions.md`.

## Implementation hints
- `@cb/tokens` (used by the token meter) bundles `js-tiktoken` with the `o200k_base` ranks, which adds
  several MB to the extension bundle. Acceptable, but check the built size and record it in the
  implementation notes.

## Done when
- [x] Tests pass; `pnpm check` green; manual criterion 6 recorded
- [x] Extension ID recorded in `decisions.md`
- [x] `finish-task` run

## Implementation notes
- Built: `packages/extension` — `manifest.json` (fixed `key`; ID `jmjcgjnadojagipfhicelhjmeipkggki`), `build.ts`
  (esbuild → `dist/`: `sw.js`, `panel.js`, `panel.html`, `panel.css`, generated icons; `content/*.ts` bundled as IIFE
  once they exist), `src/native.ts`, `src/sw.ts`, `src/panel/{Panel.tsx,index.tsx,panel.html,panel.css}`;
  `scripts/gen-extension-key.ts` (`pnpm gen:key`, reuses `key.pem` unless `--force`).
- Deviation (human): the **panel** opens the native port (`chromeNativeClient()` in native.ts); the SW only sets
  `openPanelOnActionClick`. Chunking moved to `@cb/schema` (`splitIntoChunks`, `reassemble`); host wraps it.
- `HostClient.request(body, { onProgress, signal })` resolves a typed `RequestResult` (never rejects): failures
  `timeout | disconnected | cancelled | invalid_reply`; `error` replies arrive as `ok: true` with `reply.type "error"`.
  Timeout 180 s since the last message; lazy reconnect; `onDisconnect(listener)` for the UI.
- `Panel` takes `{ client }`; T09 replaces `ReviewScreen` (placeholder: raw envelope in `<pre data-testid="envelope">`).
  Select defaults: suggested profile and ticks, route clipboard, mode verbatim; meter "approx." = per-part tokens.
- Tooling: the extension is outside root `tsconfig.json`/`tsconfig.build.json` (own tsconfig with DOM, JSX, chrome
  types); root `build`/`typecheck` chain its scripts. Panel tests use `// @vitest-environment jsdom`.
- Bundle size: `panel.js` 2,367.7 KiB minified (almost all js-tiktoken o200k ranks); `dist` total 2,371.6 KiB.
- Manual criterion 6 (human, Chrome 156.0.8078.47, Windows 11 25H2): loaded unpacked, install-host.ps1 OK, panel
  opened on icon click, host connected; small-chat paste → 8 turns, 2 flags, 2 redactions, meter "approx. 234 / 6800";
  Prepare → Review with a 450-token envelope, 0 cut, `[SECRET_1]` and `[EMAIL_1]` shown.
- Fixes from that run: manifest `version`/`description` added (spec bug); verbatim envelope omits `## Artifacts`;
  recent turns render oldest first; `hostVersion` from host package.json (0.1.0). Double Review block not reproduced.
- Gotcha: `parsePaste` needs WebCrypto (`crypto.subtle`); "Use pasted text" double click can send two ingests (the
  second supersedes the first; harmless, but T09 may want to disable the button before parsing).
