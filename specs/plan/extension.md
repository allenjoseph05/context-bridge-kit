# Browser extension (`@cb/extension`)

Chrome MV3. Captures on click, shows the UI, holds no secrets and no files at rest.

## Manifest
```json
{
  "manifest_version": 3,
  "name": "Context Bridge",
  "key": "<public key from scripts/gen-extension-key>",
  "permissions": ["activeTab", "scripting", "sidePanel", "nativeMessaging",
                  "clipboardWrite", "downloads", "contextMenus"],
  "host_permissions": ["https://gemini.google.com/*", "https://chatgpt.com/*"],
  "background": { "service_worker": "sw.js", "type": "module" },
  "side_panel": { "default_path": "panel.html" },
  "action": { "default_title": "Context Bridge" },
  "content_security_policy": { "extension_pages": "script-src 'self'; object-src 'self'" }
}
```
- **Why `key`:** it fixes the extension ID, which the native host manifest must list in
  `allowed_origins` (no wildcards allowed). `scripts/gen-extension-key` creates the key pair and
  prints the ID; the private key is git-ignored.
- **Why these host permissions:** structured adapters need to run on Gemini and ChatGPT from the side
  panel button. Any other site is reached only through `activeTab`, granted by the context-menu
  click "Capture selection with Context Bridge" (generic adapter). If `activeTab` is not granted in
  practice, the UI falls back to paste (record what was observed in `decisions.md`).
- No remote code; bundles are built locally with esbuild.

## Files
| File | Role |
| --- | --- |
| `sw.ts` | Service worker: opens the side panel on action click, context menu, injects adapters with `chrome.scripting.executeScript`. Stateless; it does not touch the native port. |
| `content/*.ts` | One bundle per adapter, built from `@cb/adapters`. |
| `panel/*` | Preact side panel UI. Opens the native port (through `native.ts`); the host lives while the panel is open. |
| `native.ts` | Port wrapper used by the panel: `runtime.connectNative`, request/reply by `requestId`, chunk reassembly (`@cb/schema` chunking, shared with the host), timeouts, reconnect, dropping replies to cancelled requests. |

## Side panel screens (state machine)
```
Capture ──ingested──► Select ──compile──► Working ──preview──► Review ──approve──► Deliver
   ▲  └─error─► Paste box (same Select flow)          └─revise──┘                   │
   └──────────────────────────── "New transfer" ◄───────────────────────────────────┘
```
1. **Capture** — detected source and adapter; buttons: "Capture this chat", "Paste instead";
   after ingest: turn and file counts, warnings, list of files not exposed by the page with a
   drop zone each.
2. **Select** — profile (Continue / Rescue / Second opinion + blind toggle), route (MCP / bundle /
   clipboard), mode (condensed / verbatim), turn list with checkboxes pre-ticked from the
   suggestion, live token meter against the effective budget. Consent 1 = "Prepare".
3. **Working** — per-stage progress; cache hits shown; cancel.
4. **Review** — the exact envelope text (monospace, scrollable); image thumbnails; flags in colour
   (redacted, possible instruction, ungrounded); per-item remove; per-redaction "reveal" toggle;
   cut list with "include" buttons; notices; destination and a one-line data note. Consent 2 =
   "Approve and send".
5. **Deliver** — per route: clipboard copied + "Open Claude / Gemini / ChatGPT" buttons; bundle
   downloaded via `chrome.downloads` from a Blob URL; MCP shows the sentence to type in the client
   ("Load context pack cp_… from Context Bridge"). Plus "Delete this pack".

## UI rules
- Every error shows what happened and the fallback button (paste, verbatim, clipboard).
- Nothing is copied or downloaded before "Approve and send".
- Text from the page is rendered as text, never as HTML (no `dangerouslySetInnerHTML`).
