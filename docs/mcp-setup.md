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
Open the config file (create it if it does not exist):

- Windows: `%APPDATA%\Claude\claude_desktop_config.json`
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`

Add the entry with the **absolute** path to `dist/index.js` in your checkout:

```json
{
  "mcpServers": {
    "context-bridge": {
      "command": "node",
      "args": ["C:/Users/you/context-bridge-kit/packages/mcp-server/dist/index.js"]
    }
  }
}
```

On macOS the path looks like `/Users/you/context-bridge-kit/packages/mcp-server/dist/index.js`.
If your vault is not in the default place, add `"env": { "CB_VAULT": "/absolute/path/to/vault" }`
next to `args`. Keep any other `mcpServers` entries you already have.

## 3. Restart Claude Desktop
Quit it fully (Windows: right-click the tray icon → Quit; macOS: Claude → Quit Claude, or ⌘Q);
closing the window is not enough. Then open it again.

## 4. Check that the tools appear
In a new chat, open the tools menu (the sliders / "Search and tools" button below the input box).
`context-bridge` should be listed with its five tools. If it is missing, see the server log:
Windows `%APPDATA%\Claude\logs\mcp-server-context-bridge.log`, macOS
`~/Library/Logs/Claude/mcp-server-context-bridge.log` (the server logs to stderr only).

## 5. Use a pack
1. In the Context Bridge side panel, approve a pack with the route **MCP**. It shows a sentence
   like `Load context pack cp_1a2b3c4d with the Context Bridge tools.`
2. Paste that sentence into a new Claude Desktop chat.
3. Claude asks to run `get_pack`. **Approve the tool call**: this prompt is the second consent,
   by design.
4. Ask about something that is only in the pack's manifest; Claude can call `get_turns`,
   `search_history` or `get_attachment` (each asks for approval again).

Every tool call is logged as a `served` line in the vault's `audit.jsonl` (tool, pack id and sizes;
never content). Packs expire after 7 days; expired packs answer "pack not found or expired".
Turns and files the user left out at review are never stored, so they cannot be pulled.

For a manual look without Claude Desktop:
`npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js`.
