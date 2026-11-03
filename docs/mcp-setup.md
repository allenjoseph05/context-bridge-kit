# Connect Claude Desktop to Context Bridge (MCP)

The MCP server is a local stdio process that Claude Desktop starts itself. It opens no network
port and only **reads** the vault (`~/.context-bridge`, or `CB_VAULT`). It offers five read-only
tools: `list_packs`, `get_pack`, `search_history`, `get_turns`, `get_attachment`.

## 1. Build
```sh
pnpm install
pnpm build          # writes packages/mcp-server/dist/index.js
```

## 2. Add the server to Claude Desktop
Open the config file with **Settings → Developer → Edit Config** in Claude Desktop. This creates
the file if needed and opens the folder that this install actually reads. Its usual location:

- Windows (installer): `%APPDATA%\Claude\claude_desktop_config.json`
- Windows (Microsoft Store): `%LOCALAPPDATA%\Packages\Claude_<id>\LocalCache\Roaming\Claude\claude_desktop_config.json`
  (the `%APPDATA%` path does not exist there, so use Edit Config)
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Quit Claude Desktop before editing (step 3): a running app can overwrite your change.
Add the entry with the **absolute** path to `dist/index.js` in your checkout:

```json
{
  "mcpServers": {
    "context-bridge": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["C:\\Users\\you\\context-bridge-kit\\packages\\mcp-server\\dist\\index.js"]
    }
  }
}
```

On Windows, give the absolute path to `node.exe` (`where node` prints it): a Store install may not
see your `PATH`. On macOS `"command": "node"` usually works, and the path looks like
`/Users/you/context-bridge-kit/packages/mcp-server/dist/index.js`.
If your vault is not in the default place, add `"env": { "CB_VAULT": "/absolute/path/to/vault" }`
next to `args`.

**The file is often not empty.** Recent versions keep `"preferences"` and other keys in it. Keep
them all: add `"mcpServers"` as another **top-level** key (not inside `"preferences"`), with a
comma after the key before it, and keep any `mcpServers` entries you already have. To check the
JSON on Windows:
`Get-Content "<path>\claude_desktop_config.json" -Raw | ConvertFrom-Json | Select-Object -ExpandProperty mcpServers`

## 3. Restart Claude Desktop
Quit it fully (Windows: click **^** in the taskbar, right-click the Claude icon → Quit; macOS:
Claude → Quit Claude, or ⌘Q); closing the window is not enough. Then open it again.

On Windows, **Claude Code also runs as `claude.exe`**, so do not run `Stop-Process -Name claude`:
it would end your Claude Code sessions too. To see what is still running, and to stop only Claude
Desktop:
```powershell
Get-Process claude | Select-Object Id, Path
Get-Process claude | Where-Object { $_.Path -like "*WindowsApps*" -or $_.Path -like "*AnthropicClaude*" } | Stop-Process -Force
```

## 4. Check that the tools appear
In a new chat, open the tools menu (the sliders / "Search and tools" button below the input box).
`context-bridge` should be listed with its five tools. If it is missing, see the server log:
Windows `%APPDATA%\Claude\logs\mcp-server-context-bridge.log`, macOS
`~/Library/Logs/Claude/mcp-server-context-bridge.log` (the server logs to stderr only).

## 5. Use a pack
1. In the Context Bridge side panel, approve a pack with the route **MCP**. It shows a sentence
   like `Load context pack cp_1a2b3c4d with the Context Bridge tools.`
2. Paste that sentence into a new chat in the **Chat** tab. (The Code tab in auto mode runs tool
   calls without asking, so the consent prompt below does not appear there.)
3. Claude asks to run `get_pack`. **Approve the tool call**: this prompt is the second consent,
   by design.
4. Ask about something that is only in the pack's manifest; Claude can call `get_turns`,
   `search_history` or `get_attachment` (each asks for approval again).

Every tool call is logged as a `served` line in the vault's `audit.jsonl` (tool, pack id and sizes;
never content). Packs expire after 7 days; expired packs answer "pack not found or expired".
Turns and files the user left out at review are never stored, so they cannot be pulled.

For a manual look without Claude Desktop:
`npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js`.
