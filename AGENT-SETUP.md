# Agent setup procedure

Follow in order. Every step names the file that holds the detail; do not improvise values.

## 0. Prerequisites
- Node 20+, npm, a chat host that implements the MCP Apps (ext-apps 1.7.x) sandbox and a per-tool approval policy.
- An Entra tenant where you can create two app registrations (or an administrator who will).
- For Azure DevOps: an organization and a test project the signed-in users can access.

## 1. Tenant: app registrations and scopes
Read `setup/admin-setup/ADMIN-SETUP.md`.
- Section 1: the Microsoft 365 registration. Redirect URI = the host's MCP OAuth callback. Configure `User.Read`
  up front; the server requests the rest of the delegated scopes listed in the table at sign-in. Note which
  scopes need admin consent in your tenant (`ChannelMessage.Read.All` by default).
- Section 2: the Azure DevOps registration with the delegated `user_impersonation` scope on the Azure DevOps
  application.
- Record client ids in the servers' environment; client secrets only if the registration is confidential.

## 2. Microsoft 365 server
In `servers/m365/`: `npm ci && npm run build`. Environment per `docs/deployment.md` and `.env.example`
(`MS365_MCP_CLIENT_ID`, `MS365_MCP_TENANT_ID`, `MS365_MCP_PUBLIC_URL` off loopback, `MS365_MCP_ATTACHMENT_URL_KEY`,
allowed redirect URIs). Run with the enabled-tools file so only the view-backed tools are exposed:

```
node dist/index.js --http 127.0.0.1:3000 --org-mode --enabled-tools-file docs/enabled-tools.local.txt
```

`docs/interactive-views.md` maps each tool to its view and lists the review-before-send tools.
`npm run lint && npm run typecheck && npm test && npm run build` is the gate; `npm run measure:views` runs the parity,
overflow, contrast and frame checks against a local Chrome.

## 3. Azure DevOps server
In `servers/azure-devops/`: `npm ci && npm run build`. Environment per `docs/http-oauth.md` (client id, tenant,
public URL, allowed redirect URIs, `ADO_MCP_CONFIRM_SECRET` shared across replicas, `ADO_MCP_TEAM` default). Run:

```
node dist/index.js <organization> --http 127.0.0.1:3001 -d core work work-items repositories pipelines test-plans
```

`docs/interactive-views.md` covers views, project scope, Basic vs Agile process layouts and the review token.
Gate: `eslint .`, `tsc --noEmit`, `jest`, `npm run build`; parity and overflow through `bin/measure-views.mjs`.

## 4. Host: overlay and configuration
Read `host/docs/mcp-ui/TRANSFER.md`.
1. Copy the overlay files listed in section 1 verbatim into the host checkout (they are under `host/api`,
   `host/client`, `host/packages`, `host/tools`).
2. Apply the seams in section 2 to the upstream files named in `host/seams.txt`; each seam is a marked block.
3. Add the configuration in section 3: the two `mcpServers` entries, `mcpSettings.apps` and
   `mcpSettings.appsHonorToolApproval`, the sandbox block, `endpoints.all.maxToolResultChars`, and the
   `toolApproval` allow/ask globs. `setup/host-config-fragment.yaml` is the complete block; `setup/tool-policy.md`
   explains every entry (reads and review forms allow; writes ask).
4. Process environment: `MCP_SANDBOX_FRAME_ANCESTORS=<chat origin>`, `USE_REDIS=true` for more than one replica,
   and the credential keys for stored OAuth tokens (`host/docs/mcp-ui/CONFIG.md`).
5. Run the host's test suites for the overlay (the specs ship next to each file) and start the host.

## 5. Verify, in this order
1. In a new chat attach both servers; sign in when the host asks (per-user OAuth).
2. Read path: "Show my inbox", "Show the team board" — no approval prompt, the view opens with real data.
3. Write path from a view: Save or Send opens the host card "Run tool from app?" with the full arguments; the
   view shows success only after the call returns; confirm the record in the real product.
4. Model write path: ask the model to create or send directly — the write tool is refused, the review form opens
   pre-filled, one approval at Save.
5. Network: only the host origin and the sandbox origin are called from the browser; no tokens in URLs.
Full checklist: `servers/m365/.claude/skills/mcp-app-views/references/verification.md`.

## 6. Adding the next product
The playbook skill in `servers/*/.claude/skills/mcp-app-views/` (capture, measure, kit, review-before-write,
policy register, verification, security checklist) is the procedure that produced these two servers.
