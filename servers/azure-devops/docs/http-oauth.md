# HTTP transport with per-user Entra sign-in

Besides the default stdio mode, the server can run as a streamable HTTP MCP server where every user signs in with their own Microsoft (Entra) account and every Azure DevOps call is made as that user. The code is additive (`src/http/**`); the stdio and interactive-broker paths are unchanged.

## Start

```bash
export ADO_MCP_CLIENT_ID=<app registration client id>
export ADO_MCP_TENANT_ID=<tenant id>
# optional: ADO_MCP_CLIENT_SECRET, ADO_MCP_ALLOWED_REDIRECT_URIS, ADO_MCP_PROJECT, ADO_MCP_TEAM

node dist/index.js gaavi --http 127.0.0.1:3001 -d core work work-items repositories pipelines test-plans
```

`--http` takes an optional `[host:port]` (default `127.0.0.1:3001`). The organization may also come from `ADO_MCP_ORG` instead of the first argument. Build first with `npm ci && npm run build`.

Quote values that contain spaces. `ADO_MCP_TEAM=Dev Team` in a shell or an env file sets the team to `Dev` (the rest is parsed as a command or dropped); write `ADO_MCP_TEAM="Dev Team"`. When only `ADO_MCP_PROJECT` is set the team defaults to `<project> Team`, which hides this mistake for the default team but not for any other.

## Security properties

- **PKCE is mandatory.** `/authorize` refuses a request without `code_challenge` and `code_challenge_method=S256`, and `/token` refuses an authorization code exchange without `code_verifier`. The server holds the client secret, so it never forwards a request that Entra itself could not bind to the client's verifier.
- **No Host-derived URLs outside loopback.** Without `ADO_MCP_PUBLIC_URL` the server answers only for loopback host names (`localhost`, `127.0.0.1`, `::1`) and refuses other `Host` headers with 421, and it refuses to start when told to listen on a non-loopback address (`--http 0.0.0.0:3001`) unless `ADO_MCP_PUBLIC_URL` is set. Discovery and authorize URLs therefore never come from a header an attacker can choose.
- **Rate limits per IP:** 30 requests per minute for `/authorize`, `/token` and `/register` (one shared window), 120 per minute for `/mcp`; over the limit the answer is 429 with `Retry-After`. `ADO_MCP_TRUST_PROXY_HOPS=<n>` trusts the last n `X-Forwarded-For` entries (default: use the socket address); `ADO_MCP_RATE_LIMIT_DISABLED=true` turns it off. The counters are per process, so with N replicas the effective limit is N times higher; put a shared limiter (ALB, WAF) in front for a hard cap.
- **Review tokens** for create and save writes are bound to the exact arguments, the user, one view document, an expiry and a single use; see `docs/TRANSFER.md`. They are keyed by `ADO_MCP_CONFIRM_SECRET`, never by the Entra client secret. Set the same value on every replica; without it a per-process random key is used and a warning is logged at start.

## Endpoints

| Path                                          | Purpose                                                                                                                                                               |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /mcp`                                   | Streamable HTTP MCP endpoint (stateless, JSON replies). Requires `Authorization: Bearer <Entra access token>`; 401 otherwise.                                         |
| `GET /.well-known/oauth-protected-resource`   | Resource metadata; authorization server is this server.                                                                                                               |
| `GET /.well-known/oauth-authorization-server` | Authorization server metadata: `/authorize`, `/token`, S256 PKCE.                                                                                                     |
| `POST /register`                              | RFC 7591 dynamic client registration (stateless; every client maps to the one Entra app; redirect URIs are checked against the allowlist). The chat host requires it. |
| `GET /authorize`                              | Validates `redirect_uri`, then redirects to Entra with our client id and the Azure DevOps scope.                                                                      |
| `POST /token`                                 | `authorization_code` and `refresh_token` grants, proxied to Entra (adds the client secret when one is configured).                                                    |
| `GET /health`                                 | Liveness.                                                                                                                                                             |

The client's PKCE challenge is forwarded to Entra unchanged, so Entra verifies the verifier and the server keeps no per-flow state: any replica can answer any request (no sticky sessions needed). Scopes are always `499b84ac-1321-427f-aa17-267ca6975798/.default offline_access` (Azure DevOps, with a refresh token) whatever the client asks for.

Each `/mcp` request builds its own MCP server and runs inside an `AsyncLocalStorage` context holding that user's token; both the token provider and the connection provider that the upstream tools use read from it. Nothing is cached across requests, so concurrent users cannot see each other's data (covered by a test).

## Environment

| Variable                                                  | Required | Meaning                                                                                                                                                  |
| --------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `ADO_MCP_CLIENT_ID`                                       | yes      | Entra app registration (client) id.                                                                                                                      |
| `ADO_MCP_TENANT_ID`                                       | yes      | Entra tenant id (or `organizations`).                                                                                                                    |
| `ADO_MCP_CLIENT_SECRET`                                   | no       | Only if the app is registered as a confidential client.                                                                                                  |
| `ADO_MCP_ORG`                                             | no       | Organization (e.g. `gaavi`) when not passed as the first argument.                                                                                       |
| `ADO_MCP_ALLOWED_REDIRECT_URIS`                           | no       | Comma-separated exact-match allowlist for `/authorize`. Without it: https anywhere, http on loopback only. Set to the chat callback in any shared setup. |
| `ADO_MCP_PROJECT`, `ADO_MCP_TEAM`                         | no       | Defaults advertised to the model in the server instructions so users need not name them (for example `Dev` / `Dev Team`).                                |
| `ADO_MCP_CONFIRM_SECRET`                                  | prod     | Key for review tokens. Same value on every replica. Without it a per-process random key is used (single instance only).                                  |
| `ADO_MCP_REVIEW_TTL_MINUTES`                              | no       | How long a view document can write after it was read; default 30.                                                                                        |
| `ADO_MCP_TRUST_PROXY_HOPS`, `ADO_MCP_RATE_LIMIT_DISABLED` | no       | Client address for rate limiting behind proxies; switch the limiter off.                                                                                 |
| `ADO_MCP_PUBLIC_URL`                                      | no       | Externally visible origin when behind a proxy; otherwise derived from the Host header.                                                                   |
| `ADO_MCP_CORS_ORIGIN`                                     | no       | CORS origin, default `http://localhost:3080`.                                                                                                            |

## Entra prerequisites

1. App registrations, new registration, single tenant.
2. Authentication, add platform **Mobile and desktop applications** (public client) or **Web** with redirect URI `http://localhost:3080/api/mcp/ado/oauth/callback`. Add the production callback the same way later. Set "Allow public client flows" to Yes if you do not use a secret.
3. API permissions, add a permission, **Azure DevOps**, delegated, **user_impersonation**. Grant admin consent if the tenant restricts user consent.
4. Secret: optional. A public client needs none. If the registration is a confidential Web client, create a secret and set `ADO_MCP_CLIENT_SECRET`; do not set a secret that the registration will not accept.
5. The signing-in users must be members of the Azure DevOps organization (and the organization must be connected to this tenant).

The Azure DevOps scope is requested with `/.default`, so whatever is consented for the app (user_impersonation) is what the token carries.

## Chat host

```yaml
mcpServers:
  ado:
    type: streamable-http
    url: http://localhost:3001/mcp
    requiresOAuth: true
```

## Tools exposed with the suggested domain filter

`-d core work work-items repositories pipelines test-plans` exposes these 37 tools (upstream 2.11.0 groups operations behind an `action` parameter):

core: `core_list_project_teams`, `core_list_projects`, `core_get_identity_ids`, `core_get_current_user`

work: `work`, `work_iteration_write`, `work_capacity_write`

pipelines: `pipelines_build`, `pipelines_build_log`, `pipelines_definition`, `pipelines_run`, `pipelines_artifact`, `pipelines_write`

repositories: `repo_repository`, `repo_pull_request`, `repo_pull_request_org`, `repo_pull_request_thread`, `repo_branch`, `repo_file`, `repo_file_write`, `repo_search_commits`, `repo_pull_request_write`, `repo_pull_request_thread_write`, `repo_create_branch`

work items: `wit_work_item`, `wit_query`, `wit_backlog`, `wit_work_item_attachment`, `wit_work_item_attachment_upload`, `wit_work_item_attachment_link`, `wit_work_item_write`, `wit_work_item_comment_write`, `wit_work_item_link_write`

test plans: `testplan`, `testplan_show_test_results_from_build_id`, `testplan_test_plan_write`, `testplan_test_suite_write`, `testplan_test_case_write`

Drop `repositories` / `pipelines` to shrink the list further. Read tools are the ones without a `_write` suffix; the `_write` tools are the ones to put behind confirmation.

## Logging

Every request except `/health` is logged at info level with method, path, status and duration. Headers, query strings and bodies are never logged, so tokens and authorization codes stay out of the log.

## Tests

`test/src/http/http-server.test.ts` covers the discovery documents, authorize redirect and validation, code exchange and refresh with Entra mocked, bearer enforcement on `/mcp`, and per-user context isolation under concurrent requests.
