# Transfer set for MCP views (host side)

Scope: only the files of the MCP-views work (the app-initiated approval change, CH-219) and the config it
relies on. Per-server details: [servers/](./servers/). Other view-related host files already in the tree
are not repeated here.

## 1. Overlay files (copy verbatim)

| Path                                                           | Purpose                                             |
| -------------------------------------------------------------- | --------------------------------------------------- |
| `packages/api/src/ext/mcp/appToolApproval.ts`                  | verdict logic and the route gate                    |
| `packages/api/src/ext/mcp/appToolApproval.spec.ts`             | its tests                                           |
| `api/ext/services/mcpAppAgentToolOptions.js`                   | agent `tool_options` lookup with view permission    |
| `api/ext/services/mcpAppAgentToolOptions.spec.js`              | its tests                                           |
| `client/src/ext/hooks/useMCPAppToolApproval.ts`                | client preflight before the dialog                  |
| `client/src/ext/hooks/__tests__/useMCPAppToolApproval.spec.ts` | its tests                                           |
| `client/src/ext/locales/en/translation.json`                   | one added key, `com_ui_mcp_app_tool_denied`         |
| `client/src/ext/utils/mcpAppViewEviction.ts`                   | oldest-first view eviction (CH-220)                 |
| `client/src/ext/utils/mcpAppViewEviction.spec.ts`              | its tests                                           |
| `api/ext/routes/mcpOAuthTokensDisabled.js`                     | 404 handler for the OAuth tokens route (CH-220)     |
| `api/ext/routes/mcpOAuthTokensDisabled.spec.js`                | its test                                            |
| `packages/api/src/ext/agents/contextOverflowLastResort.ts`     | last-resort overflow recovery (CH-221)              |
| `packages/api/src/ext/agents/contextOverflowLastResort.spec.ts`| its tests                                           |
| `packages/api/src/ext/agents/toolBudgetDeferral.ts`            | defers MCP tools beyond 40% of the window (CH-221)  |
| `packages/api/src/ext/agents/toolBudgetDeferral.spec.ts`       | its tests                                           |
| `packages/api/src/ext/agents/innerCallPolicy.ts`               | admin rules for tool calls from code (CH-221)       |
| `client/src/ext/components/Messages/ContextErrorWithRetry.tsx` | "Compact and retry" on the context error (CH-221)   |
| `client/src/ext/components/Messages/__tests__/ContextErrorWithRetry.spec.tsx` | its tests                       |
| `tools/export-host-changes.sh`                                 | exports this change set and regenerates the fragment|
| `docs/mcp-ui/**`, `docs/mcp-apps.md`                           | docs (section "Honouring the tool-approval policy") |

`fork-overlay.manifest.json` lists only overrides of upstream files; this change adds none, so nothing is
added to it. Ext files are picked up by path, seams by their markers, and the ledger entry CH-219 in
`CHANGES.md` names the seam slug.

## 2. Host seams (slug `mcp-app-honor-tool-approval`, insert or replace)

Verify with `grep -rln "ext:begin mcp-app-honor-tool-approval" .` and `node tools/fork-overlay/cli.mjs gate`.

- `packages/api/src/mcp/apps/controller.ts`: imports of `createAppToolApprovalGate` and the type
  `AppToolApprovalGateDependencies` from `~/ext/mcp/appToolApproval`;
  `export interface MCPAppsControllerDependencies extends AppToolApprovalGateDependencies {` (orig: no
  `extends`); `const appToolCallHandler = createProxyHandler({` (orig name `appToolCall`); after that call:
  `const appToolCall = createAppToolApprovalGate(dependencies)(appToolCallHandler);`
- `packages/data-provider/src/config.ts`: in `mcpSettings`: `appsHonorToolApproval: z.boolean().optional(),`;
  in `TMCPAppsPolicy`: `honorToolApproval?: boolean;`; in `TStartupConfig`: `mcpAppsHonorToolApproval?: boolean;`
- `api/server/routes/config.js` (right after the `mcpApps` entry):
  `...(appConfig?.mcpSettings?.appsHonorToolApproval === true ? { mcpAppsHonorToolApproval: true } : {}),`
- `api/server/controllers/mcpApps.js`:
  `const { getViewableAgentToolOptions } = require('~/ext/services/mcpAppAgentToolOptions');` and, in the
  controller dependencies, `getAgentToolOptions: getViewableAgentToolOptions,`
- CH-220, slug `mcp-app-view-eviction`: `client/src/Providers/MCPAppsPolicyContext.tsx` (import; `reserveView`
  calls `reserveViewEvictingOldest` instead of refusing at the limit, orig two lines; `activeAppViewsAtom` is now
  exported), `client/src/components/MCPUIResource/MCPAppViews.tsx` (import, `activeViewStore` from the host, and
  an effect that returns an evicted view to its placeholder), `MCPAppViews.test.tsx` (two capacity tests).
- CH-220, slug `mcp-oauth-tokens-disabled`: `api/server/routes/mcp.js` (import and a route registered before the
  upstream `/oauth/tokens/:flowId` handler, which becomes unreachable), `api/server/routes/__tests__/mcp.spec.js`
  (new describe; the upstream describe is `describe.skip`).
- CH-221, slug `ptc-policy-bypass`: `packages/api/src/agents/hitl/modes.ts` (import; in `validateExecution`, a call
  with no tool-call id runs `assertInnerCallPolicy` before returning).
- CH-221, slug `tool-budget-deferral`: `packages/api/src/agents/initialize.ts` (import; a block after the tool load
  that calls `applyToolDeferral`; `hasDeferredTools` or'd with the deferral count, orig `hasDeferredTools,`).
- CH-221, slug `context-overflow-last-resort-exports`: `packages/api/src/agents/index.ts` (one `export *`).
  The retry itself is wired in the existing ext file `api/ext/services/Files/turnFallbackText.js`
  (`runWithDocumentFallback`), and `api/server/controllers/agents/client.js` passes `indexTokenCountMap` inside the
  existing `model-input-fallback-retry` block.
- CH-221, slug `context-compact-retry`: `client/src/components/Messages/Content/Error/registry.ts` (import; the
  `empty_messages` and `final_context_overflow` entries point at `ContextErrorWithRetry`, orig `ContextError`).
  New locale keys `com_ext_context_compact_retry`, `com_ext_context_compacting_retry` in the ext translation file.
- Config: `endpoints.all.maxToolResultChars: 60000` (see `CONFIG.md`).
- `tools/fork-overlay/lib.mjs`: `git()` pins `core.autocrlf=input` so the audit does not depend on the ambient git config.
- `client/src/Providers/MCPAppsPolicyContext.tsx` (in the returned policy, after `...policy,`):
  `...(startupConfig?.mcpAppsHonorToolApproval === true ? { honorToolApproval: true } : {}),`
- `client/src/components/MCPUIResource/MCPAppViews.tsx`:
  `import useMCPAppToolApproval from '~/ext/hooks/useMCPAppToolApproval';`,
  `const requestAction = useMCPAppToolApproval(approval.request);` before `useAppBridge({`, and
  `onRequestAction: requestAction,` (orig `approval.request`)
- `api/server/routes/__tests__/config.spec.js`: one test inside the same slug markers ("publishes the app
  tool-approval flag only when it is on")

## 3. Configuration

Shared block: [README.md](./README.md). Per server: [servers/m365.md](./servers/m365.md). New key:
`mcpSettings.appsHonorToolApproval: true`. Environment: `MCP_SANDBOX_FRAME_ANCESTORS=https://<chat origin>`.

**File name per brand.** The export renames the dev config file `librechat.yaml`. In
`tools/fork-overlay/brands/ranger.brand.json` it becomes `ranger.yaml` (committable in the delivery); that
profile also comments out `mcpServers.pagehand` and `endpoints.agents.toolApproval.allow` as examples, so
re-enable the `allow` entries in the delivered file. The other profiles in that folder (illuma, salvea)
define no config-file rename, and no Exalor profile exists in this tree: check the profile you export with.
The ranger profile keeps the `LIBRECHAT_` env prefix (`keepIdentifiers`) and has no rename of
`LIBRECHAT_CODE_BASEURL`; a rename such as `RANGER_CODE_BASEURL` was not found in the profiles here and is
unverified. The keys used in this folder (`mcpSettings`, `mcpAppSandbox`, `endpoints.agents.toolApproval`)
are not renamed by the ranger profile.

**Demo deploy** (`C:\Projects\Chat\ranger-demo-deploy\30-host.sh`, not edited): it loads the exported
`ranger.yaml` and drops `mcpServers`, `mcpSettings` and `webSearch` before writing the demo config. For views
on a deployed host it must instead keep `mcpServers.m365` and `mcpSettings` (with `apps: true` and
`allowedAddresses` pointing at the deployed server, not localhost), keep `mcpAppSandbox` with a `url` on a
separate origin and the 4 MB limit, and add `MCP_SANDBOX_FRAME_ANCESTORS` to the env it stores in the secret.
The M365 server must be reachable from the host, and the Entra redirect set to the deployed origin.

## 4. External package

The M365 server fork, its start command, tool set and Entra prerequisites: [servers/m365.md](./servers/m365.md).

## 5. Verification checklist

- `cd packages/api && npx jest src/ext/mcp/appToolApproval.spec.ts` (14) and `src/mcp/apps/controller.spec.ts` (28)
- `cd client && npx jest src/ext/hooks/__tests__/useMCPAppToolApproval.spec.ts` (6) and
  `src/components/MCPUIResource/__tests__/MCPAppViews.test.tsx` (13)
- `cd api && npx jest ext/services/mcpAppAgentToolOptions.spec.js` (2) and `server/routes/__tests__/config.spec.js`
- `node tools/fork-overlay/cli.mjs gate`
- `cd client && npx jest src/ext/utils/mcpAppViewEviction.spec.ts` (6) and `api: npx jest ext/routes/mcpOAuthTokensDisabled.spec.js server/routes/__tests__/mcp.spec.js`
- live: opening a fourth view closes the oldest; `GET /api/mcp/oauth/tokens/<id>` returns 404
- live, flag off: a view tool call shows "Run tool from app?"
- live, flag on: an allowed tool runs without the dialog; a send tool (ask rule) shows it; a tool matching a
  `deny` rule shows an error toast and, called directly, returns 403; an agent tool set to Always approve
  runs without the dialog (needs `agentModes: true`); a view "send message" still asks
