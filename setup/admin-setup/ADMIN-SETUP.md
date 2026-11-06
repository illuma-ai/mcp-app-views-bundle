# Admin setup: Microsoft 365 and Azure DevOps connectors for the chat

Version 0.1 (2026-11-05). What a tenant administrator has to create so the chat can connect users to
Microsoft 365 (Outlook, Calendar, Teams) and Azure DevOps through the two MCP servers. Both servers sign
each user in with their own Microsoft account (delegated permissions); the servers never hold a shared
credential, and nothing is granted tenant-wide unless the administrator chooses to.

Screenshots in `images/` were taken while setting up the `gaavi.ai` tenant (`*.jpg`).

## 1. Microsoft 365 connector (app registration `m365-mcp-local`)

1. Entra admin center → **App registrations** → **New registration**.
   - Name: `m365-mcp-<environment>`; supported account types: **Single tenant**.
   - Redirect URI: platform **Public client/native (mobile & desktop)**, value
     `http(s)://<chat host>/api/mcp/m365/oauth/callback` (local: `http://localhost:3080/api/mcp/m365/oauth/callback`).
   (screenshot `m365-01-authentication-redirect.jpg` omitted from the public bundle)
   - No client secret is needed (public client with PKCE). If your policy requires a confidential client,
     use the **Web** platform instead and set `MS365_MCP_CLIENT_SECRET` on the server.
2. **API permissions** → Microsoft Graph → **Delegated**. (The registration only needs `User.Read` configured up front; the server requests the other delegated scopes at sign-in and the user consents to them, as in the screenshot below.)
   (screenshot `m365-02-api-permissions.jpg` omitted from the public bundle)
   (screenshot `m365-07-user-consent-mail-calendar-chat.jpg` omitted from the public bundle) The set depends on which areas are enabled on the server
   (the server prints the exact list with `--list-permissions`). Current areas and the delegated scopes they need:

   | Area | Delegated Graph permissions | Admin consent required (default) |
   |---|---|---|
   | Sign-in | `openid`, `profile`, `offline_access`, `User.Read` | No |
   | Mail (read, drafts, send, move, delete) | `Mail.ReadWrite`, `Mail.Send` | No |
   | People lookup (directory names for To/Cc) | `People.Read` | No |
   | Calendar | `Calendars.ReadWrite` (`Calendars.Read` for read-only) | No |
   | Teams chats | `Chat.ReadWrite`, `ChatMember.Read`, `ChatMessage.Send` | No* |
   | Teams channels | `Team.ReadBasic.All`, `Channel.ReadBasic.All`, `ChannelMessage.Read.All`, `ChannelMessage.Send` | **Yes** for `ChannelMessage.Read.All` |
   | OneDrive files | `Files.ReadWrite` | No |
   | Contacts | `Contacts.ReadWrite` | No |
   | To Do / Planner | `Tasks.ReadWrite` | No |

   *Defaults shown by Entra; a tenant can require admin consent for everything.
3. Consent: with the defaults above, each user consents once at first sign-in from the chat. To avoid
   per-user prompts, an administrator can **Grant admin consent for <tenant>** on the API permissions page.
4. Give the server: `MS365_MCP_CLIENT_ID`, `MS365_MCP_TENANT_ID`, `MS365_MCP_ALLOWED_REDIRECT_URIS=<the callback above>`.
5. Chat host configuration (the host's MCP config file, e.g. `ranger.yaml` / `exalor.yaml` in a branded export):
   ```yaml
   mcpServers:
     m365:
       title: Microsoft 365
       description: Outlook mail, calendar and Teams for the signed-in user through Microsoft Graph. Reads run directly; sending, moving and deleting ask for approval.
       type: streamable-http
       url: http://<m365 server host>:3000/mcp
       requiresOAuth: true
   ```
   Add the server host to `mcpSettings.allowedAddresses`. Approval rules are in `../../tool-policy.md`.

## 2. Azure DevOps connector (app registration `ado-mcp-local`)

1. Entra admin center → **App registrations** → **New registration**: single tenant; redirect URI under
   **Public client/native**: `http(s)://<chat host>/api/mcp/ado/oauth/callback`.
   (screenshot `ado-03-api-permissions-before.jpg` omitted from the public bundle)
2. **API permissions** → **Add a permission** → tab **APIs my organization uses** → search **Azure DevOps**
   (application id `499b84ac-1321-427f-aa17-267ca6975798`).
   (screenshot `ado-04-apis-my-org-azure-devops.jpg` omitted from the public bundle)
3. Choose **Delegated permissions** → tick **user_impersonation** ("Have full access to Visual Studio Team Services REST APIs") → **Add permissions**. Admin consent required: **No** by default.
   (screenshot `ado-05-delegated-permissions.jpg` omitted from the public bundle)
   (screenshot `ado-06-permissions-configured.jpg` omitted from the public bundle)
4. The Azure DevOps organization must be connected to this Entra tenant, and each user must be a member of the
   organization with access to the project (Azure DevOps permissions still apply on top of the sign-in).
5. First sign-in from the chat shows this consent (per user; "Consent on behalf of your organization" is optional):
   (screenshot `ado-07-user-consent.jpg` omitted from the public bundle)
6. Give the server: `ADO_MCP_CLIENT_ID`, `ADO_MCP_TENANT_ID`, `ADO_MCP_ORG=<organization>`,
   `ADO_MCP_PROJECT=<default project>`, `ADO_MCP_TEAM="<default team>"` (quote values with spaces, e.g. `"Dev Team"`),
   `ADO_MCP_ALLOWED_REDIRECT_URIS=<the callback above>`; start with
   `node dist/index.js <organization> --http <host:port> -d core work work-items repositories pipelines test-plans`.
7. Chat configuration:
   ```yaml
   mcpServers:
     ado:
       title: Azure DevOps
       description: Boards, work items, sprints, repos, pipelines and test plans in the <organization> organization (project <project>). Reads run directly; creating and updating ask for approval.
       type: streamable-http
       url: http://<ado server host>:3001/mcp
       requiresOAuth: true
   ```

## 3. Chat-side settings that both connectors need

- `mcpSettings.apps: true` (interactive views) and `mcpAppSandbox.url` on a **different origin** from the chat page,
  with `MCP_SANDBOX_FRAME_ANCESTORS=<chat origin>` on the chat server; `maxPersistedAppBytes: 4194304`.
- `mcpSettings.appsHonorToolApproval: true` so clicks inside the views follow the approval rules.
- `endpoints.agents.toolApproval` with `enabled: true`, `agentModes: true`, and the allow/ask lists from `../../tool-policy.md`.
- Each user signs in to each connector once from **MCP Servers** in the chat; "Revoke OAuth sign-in" removes the stored tokens.

## 4. Verification checklist

1. MCP Servers page: the connector shows **Connected** after sign-in.
2. Microsoft 365: "Show my inbox" opens the inbox view; opening a message needs no prompt; Send shows the approval card.
3. Azure DevOps: "List the team's iterations" answers without a prompt; creating a work item shows the approval card.

## Change log
- 0.1 (2026-11-05): first version; Azure DevOps screenshots captured.
- 0.2 (2026-11-05): Microsoft 365 Entra pages and the user consent screen added.
