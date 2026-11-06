# Spec: app-initiated tool calls honour the approval policy (CH-219)

**Purpose.** Without this, every tool call a view makes shows "Run tool from app?", even for tools the
administrator already allows. With it, a view feels like the real app: allowed tools run, denied tools are
blocked, everything else still asks.

**Flag.** `mcpSettings.appsHonorToolApproval: true` (default off = unchanged behaviour). Validated as an
optional boolean in `packages/data-provider/src/config.ts`. When on, the startup config publishes
`mcpAppsHonorToolApproval: true` (absent otherwise) and the client reads it as `policy.honorToolApproval`.

**Decision flow** (`packages/api/src/ext/mcp/appToolApproval.ts`, `evaluateAppToolApproval`), for the
combined key `<tool>_mcp_<server>` (the bare tool name is also tested for deny and ask):

1. policy missing or `enabled` not true: **ask**
2. an admin `deny` rule matches: **deny**
3. an admin `ask` rule matches: **ask**
4. an admin `allow` rule matches the combined key: **allow**
5. `agentModes: true` and the conversation's agent has the tool in mode `allow` (Always approve): **allow**
6. otherwise (unmatched under `default` or `dontAsk`): **ask**

**Where it runs.** `POST /api/mcp/app-tool-call` is wrapped by `createAppToolApprovalGate`. Flag off passes
straight through. `verdictOnly: true` answers `{ verdict }` without calling the tool (the client asks this
before its dialog, sending the conversation's `agentId`). A real call whose verdict is `deny` is rejected
with 403 and a clear message, whatever the client did. The agent's `tool_options` are read only for an agent
the user can view (`api/ext/services/mcpAppAgentToolOptions.js`). Any lookup fault answers ask. The client
(`client/src/ext/hooks/useMCPAppToolApproval.ts`) skips the dialog on allow, shows an error toast and blocks
on deny, and keeps the dialog on ask. App-initiated chat messages always keep their dialog. No glob
matching exists on the client.

**Tests.**

- `packages/api/src/ext/mcp/appToolApproval.spec.ts` (14): policy, gate, deny enforced on the route
- `client/src/ext/hooks/__tests__/useMCPAppToolApproval.spec.ts` (6): dialog skipped or shown
- `api/ext/services/mcpAppAgentToolOptions.spec.js` (2): agent lookup and view permission
- `api/server/routes/__tests__/config.spec.js`: flag published only when on
