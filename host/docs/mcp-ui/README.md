# MCP views in this host

An MCP server can ship interactive **views** (MCP Apps: tool-linked `ui://` resources). The host renders a
view in a sandboxed frame; the view can call tools on its own server, read its resources and, with a
separate confirmation, send a chat message. Full behaviour: [../mcp-apps.md](../mcp-apps.md).

This folder is the portable record of the host-side work for views:

| File                                                     | Content                                                                                   |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| [TRANSFER.md](./TRANSFER.md)                             | Overlay files to copy, host seams to re-apply, shared config, brand file names, checklist |
| [app-initiated-approval.md](./app-initiated-approval.md) | Spec of the flag that lets view-initiated tool calls honour the approval policy           |
| [servers/m365.md](./servers/m365.md)                     | The M365 server: block, tools, allow/ask rules, Entra prerequisites                       |
| [servers/azure-devops.md](./servers/azure-devops.md)     | Stub, not wired yet                                                                       |

## Shared configuration (every server with views)

```yaml
mcpSettings:
  apps: true # MCP Apps on
  appsHonorToolApproval: true # optional, default off (see app-initiated-approval.md)
  allowedAddresses:
    - 'localhost:3000' # one entry per local server; needed for local addresses

mcpAppSandbox:
  url: http://localhost:3080/api/mcp/sandbox # in a deployment: a different origin from the chat page
  maxPersistedAppBytes: 4194304 # views built on a UI library are about 1 MB each (default 1 MiB)

endpoints:
  agents:
    toolApproval:
      enabled: true
      agentModes: true
      allow: ['<read-pattern>_mcp_<server>'] # reads and drafts run unprompted
      ask: ['<send-pattern>_mcp_<server>'] # anything that sends or deletes stays prompted
```

```dotenv
MCP_SANDBOX_FRAME_ANCESTORS=https://<chat origin>
```

Rules match the combined tool key `<tool>_mcp_<server>` (anchored glob; deny wins; ask wins over allow).
A deployment needs the sandbox on its own origin (a second hostname pointing at the same host).

## How many views stay open

`mcpSettings.maxActiveViews` (default 3, range 1-32) caps the views open at the same time in one
conversation view. Pressing **Open app** on one more view closes the oldest open view, which returns to
its **Open app** placeholder, and opens the new one: the request is never ignored. Order is by the time a
view was opened; reopening a closed view makes it the newest. A closed view starts a fresh session. The
logic is `client/src/ext/utils/mcpAppViewEviction.ts` (CH-220).

## OAuth tokens never reach the browser

`GET /api/mcp/oauth/tokens/:flowId` answers 404 to signed-in users (401 when not signed in) and does not
read the flow. Upstream returned the raw access and refresh tokens of a completed flow; nothing in the
client used it. Progress is still available from `GET /api/mcp/oauth/status/:flowId`, which carries no
tokens (CH-220).
