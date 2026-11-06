# MCP App views for Microsoft 365 and Azure DevOps — setup bundle

Two MCP servers that render pixel-parity interactive views (ext-apps standard) inside a chat host, plus the
host-side overlay that makes a view's own tool calls follow the administrator approval policy. Reads run silently;
every write (send, create, update, delete, move) opens a review screen in the view and then the host's approval card.

| Folder | What it is | Start with |
| --- | --- | --- |
| `servers/m365/` | Microsoft 365 MCP server (mail, calendar, Teams, OneDrive, People, To Do) with views | `README.md`, `docs/interactive-views.md`, `docs/deployment.md` |
| `servers/azure-devops/` | Azure DevOps MCP server (boards, work items, sprints, repos, pull requests, pipelines, test plans) with views | `docs/GETTINGSTARTED.md`, `docs/http-oauth.md`, `docs/interactive-views.md`, `docs/TRANSFER.md` |
| `host/` | The chat-host overlay: ext files to copy, the seam list, host docs and the four ledger entries | `docs/mcp-ui/TRANSFER.md`, `seams.txt`, `CHANGES-mcp-views.md` |
| `setup/` | Tenant and host setup: app registrations and scopes, the per-tool approval register, the security review, the host config fragment | `admin-setup/ADMIN-SETUP.md`, `tool-policy.md` |

`AGENT-SETUP.md` is the end-to-end procedure for an agent that has to stand this up from zero.

## What the host needs

The host is a chat application that implements the MCP Apps (ext-apps) sandbox and a tool-approval policy
with `allow` / `ask` / `deny` globs per tool. The overlay in `host/` adds, behind a flag, the rule that a tool call
started from a view is checked against that policy before the approval dialog is shown. Everything else is
configuration: the two server entries, the policy globs, a result-size cap and the sandbox frame origin.
`setup/host-config-fragment.yaml` is the exact block in use.

## Security model in one paragraph

Per-user OAuth over streamable HTTP with dynamic client registration and mandatory PKCE; the servers keep tokens
only in the request context and never return them to the browser; views run in a sandbox on a separate origin
with no network; tool results are wrapped as untrusted content; writes refuse unless the view confirms them
(the Azure DevOps server binds a single-use HMAC review token to the exact arguments); rate limits on the auth
endpoints. Details and the checklist: `setup/SECURITY-REVIEW.md`.

## Scopes

Microsoft Graph delegated scopes per area, with the admin-consent flag, are in
`setup/admin-setup/ADMIN-SETUP.md` section 1; the M365 server prints the exact list for its enabled tools with
`--list-permissions`. Azure DevOps uses the Entra delegated scope `user_impersonation` on the Azure DevOps
application, requested as `/.default` (section 2 of the same guide).

## Verification

Each server carries a parity matrix (`docs/parity-matrix.md`) measured against captures of the real product,
an overflow sweep, a dark-theme contrast gate, a frame-height trace, and a brand-neutrality check. Run the
gates named in each server's `package.json` before deploying. The live verification procedure for the chat
host is `servers/*/.claude/skills/mcp-app-views/references/verification.md`.

Generated 2026-11-06 from the committed heads of both server repositories and the host overlay export.
