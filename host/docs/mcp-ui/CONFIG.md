# Host configuration for the MCP views (exportable)

Everything the chat host needs beyond the overlay files in `TRANSFER.md`. The exact values in use are in
[`config-fragment.yaml`](./config-fragment.yaml) (regenerated from the local config by `tools/export-host-changes.sh`).

## 1. Config file keys (merge into the host's MCP config — `ranger.yaml` / `exalor.yaml` in a branded export)
| Key | Value / purpose |
|---|---|
| `endpoints.agents.toolApproval.enabled` | `true` — writes need the approval card |
| `endpoints.agents.toolApproval.agentModes` | `true` — per-agent always-approve stays possible for scheduled agents |
| `endpoints.agents.toolApproval.grantLookupTimeoutMs` | `3000` |
| `endpoints.agents.toolApproval.mode` | `default` |
| `endpoints.agents.toolApproval.allow` | read tools and review/form tools: `<tool>_mcp_<server>` globs (see the fragment; source of truth `m365-setup/tool-policy.md`) |
| `endpoints.agents.toolApproval.ask` | write tools (`*_write`, sends, moves, deletes, creates) |
| `endpoints.all.maxToolResultChars` | `60000` � one tool result is cut to this many characters before it enters the prompt, for every endpoint (read in `packages/api/src/agents/initialize.ts`: the endpoint's own value wins, else `endpoints.all`). Keeps a single large result from filling the context; the last-resort recovery of CH-221 handles what still overflows |
| `mcpSettings.apps` | `true` — interactive views on |
| `mcpSettings.appsHonorToolApproval` | `true` — app-initiated tool calls follow allow/ask/deny (CH-219) |
| `mcpSettings.maxActiveViews` | `3` (default) — oldest view is evicted (CH-220) |
| `mcpSettings.allowedAddresses` | the MCP server hosts (local: `localhost:3000`, `localhost:3001`) |
| `mcpAppSandbox.url` | the sandbox proxy on a **different origin** from the chat page (local `http://localhost:3080/api/mcp/sandbox`) |
| `mcpAppSandbox.maxPersistedAppBytes` | `4194304` |
| `mcpServers.m365` | title "Microsoft 365", `type: streamable-http`, `url: http://<host>:3000/mcp`, `requiresOAuth: true` |
| `mcpServers.ado` | title "Azure DevOps", `type: streamable-http`, `url: http://<host>:3001/mcp`, `requiresOAuth: true` |

## 2. Environment (host process)
| Variable | Value / purpose |
|---|---|
| `MCP_SANDBOX_FRAME_ANCESTORS` | the chat origin(s) allowed to frame the sandbox (local `http://localhost:3090`) |
| `CREDS_KEY` / `CREDS_IV` | encryption of stored MCP OAuth tokens (from the secret store in prod) |
| `USE_REDIS` | `true` in prod (multi-replica); approvals and MCP connections must not rely on one process |

## 3. Removal
Delete the `mcpServers.m365`/`ado` entries and the matching `allow`/`ask` globs; the overlay files and seams are
listed in `TRANSFER.md` and the ledger entries CH-219 and CH-220 in `CHANGES.md`.
