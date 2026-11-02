---
name: native-messaging
description: How Chrome native messaging works for the Context Bridge host and extension — framing, manifest locations, extension ID, size limits, debugging. Use when writing or debugging packages/host framing, the install scripts, or the extension's native port (tasks T07, T08).
---

# Chrome native messaging

## Protocol facts
- Chrome starts the host as a separate process and talks over **stdin/stdout**.
- Every message: **4-byte length in native byte order**, then UTF-8 JSON. Same format both ways.
- Limits: host → Chrome **1 MB** per message; Chrome → host **64 MB**. We chunk at 900,000 bytes.
- `runtime.connectNative(name)` keeps the host alive until the port closes;
  `sendNativeMessage` starts a new process per message (we do not use it).
- The first command-line argument is the caller origin, `chrome-extension://<id>/`. On Windows a
  `--parent-window=<handle>` argument may follow.
- Native messaging APIs are **not available in content scripts**; only in the service worker and
  extension pages.

## Host manifest
```json
{
  "name": "com.contextbridge.host",
  "description": "Context Bridge local host",
  "path": "/ABSOLUTE/path/to/packages/host/bin/context-bridge-host",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://<EXTENSION_ID>/"]
}
```
- `name`: lowercase alphanumerics, underscores, dots; no leading/trailing dot, no `..`.
- `path` must be absolute on macOS and Linux; the file must be executable (`chmod +x`).
- `allowed_origins` cannot contain wildcards → the extension ID must be stable → manifest `key`.

## User-level manifest locations (Chrome)
- macOS: `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.contextbridge.host.json`
- Linux: `~/.config/google-chrome/NativeMessagingHosts/com.contextbridge.host.json`
  (Chromium: `~/.config/chromium/NativeMessagingHosts/`)
- Windows: registry `HKCU\Software\Google\Chrome\NativeMessagingHosts\com.contextbridge.host`,
  default value = absolute path to the JSON manifest (which may live anywhere).

## Node host pitfalls
- **Never write to stdout except framed messages.** One `console.log` corrupts the stream; Chrome
  reports "Error when communicating with the native messaging host".
- Read stdin as a stream; a message can arrive split across chunks, and several messages can
  arrive in one chunk. Keep a buffer.
- Write the 4-byte length with `buf.writeUInt32LE` or `BE` per `os.endianness()`.
- The launcher script: `#!/bin/sh` + `exec node "$(dirname "$0")/../dist/main.js" "$@"`. Pass `"$@"`
  so the origin argument reaches Node. If Chrome cannot find `node` on its PATH, write the
  absolute node path into the launcher at install time.
- Exit cleanly when stdin closes (port disconnected).

## Debugging
- Start Chrome with logging: macOS/Linux `--enable-logging=stderr --v=1`; search for
  `native_messag` and `launch_context`. Windows: `chrome_debug.log`.
- Common errors: "Specified native messaging host not found" (manifest path/name),
  "Access to the specified native messaging host is forbidden" (ID not in `allowed_origins`),
  "Native host has exited" (crash or exit 1 from the origin check).
- Test the host without Chrome: spawn it from vitest, pass the origin argument, write framed
  messages to stdin, decode stdout.
