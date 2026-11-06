# Security review — chat host ↔ MCP servers ↔ Microsoft (2026-11-05)

Version 0.1. Static read-only review of the data path browser ↔ chat host ↔ `softeria-ms-365-mcp` (ms365) /
`azure-devops-mcp` (ado) ↔ Microsoft Graph / Azure DevOps, plus a live network capture of the chat tab during the
OneDrive, People, To Do and calendar flows. No secret values appear in this document.

## Live capture (lead, Chrome)
- During all view flows the browser spoke only to `localhost:3090` (chat API: `/api/mcp/app-tool-call`, `/api/mcp/app/validate`,
  `/api/mcp/servers`, …) and `localhost:3080/api/mcp/sandbox` (the view sandbox on its own origin). No request to any Microsoft host
  from the browser; no token in any URL.
- The three local logs (`m365-mcp.log`, `ado-mcp.log`, `backend-3080.log`) contain no bearer, access or refresh token (grep for
  `Bearer …`, `access_token`, `refresh_token`, JWT prefixes, `code_verifier`, `client_secret`). ms365 logs the client id (truncated)
  and tenant id at start-up — identifiers, not secrets.

## Where tokens live (verified in code)
| Place | Microsoft / Azure DevOps tokens |
|---|---|
| Browser | never — the host calls the servers; the view iframe calls the host (`/api/mcp/app-tool-call`). One upstream host route (`GET /api/mcp/oauth/tokens/:flowId`, owner-gated, unused by the client) can return the owner's own tokens — finding 10 |
| Host at rest | encrypted (`encryptV2`, `packages/api/src/mcp/oauth/tokens.ts`) |
| Host → server | `Authorization: Bearer` on `POST /mcp` |
| Servers | per-request `AsyncLocalStorage` only; no session ids (`sessionIdGenerator: undefined`); nothing persisted in HTTP mode |
| View HTML / tool results / `_meta` | no token; view config carries org/project/team, tool names and the ado review token (not a Microsoft token) |

## Findings (ranked) and owners
| # | Sev | Repo | Finding | Fix | Owner |
|---|---|---|---|---|---|
| 1 | High (config) | ms365 | `--trust-proxy-auth` skips the bearer check and uses the server's cached account — anyone reaching the port acts as that user | refuse the flag on a non-loopback bind; never in prod | ms365 dev |
| 2 | Medium | ms365 | info logs write full Graph request options (mail bodies, recipients, `$search`) | log method + path only | ms365 dev |
| 3 | Medium | ms365 | `-v` console transport prints log metadata unredacted (`{ body }` on token/register errors can contain code, refresh token, PKCE verifier) | drop `{ body }`; redact metadata | ms365 dev |
| 4 | Medium | ms365 | PKCE store and attachment-ticket store are in-process (holds a raw Graph token) — breaks with >1 replica | Redis (encrypted) or pin | ms365 dev |
| 5 | Medium | ms365 | attachment URL is an unsigned one-shot bearer capability inside a tool result | require `MS365_MCP_ATTACHMENT_URL_KEY`; internal port | ms365 dev |
| 6 | Medium | both | PKCE optional at the proxy; `/token` adds the confidential secret, so an intercepted code is redeemable; ms365 skips the redirect check when `redirect_uri` absent | require `code_challenge=S256` + `code_verifier`; require `redirect_uri` | both |
| 7 | Medium | ado | review token = HMAC(oid) with no args/time binding → replayable by the same user; shown in raw args on the card | bind to hash(args)+expiry+nonce; mask on the card | ado dev |
| 8 | Medium | ms365 | no spotlighting of untrusted tool text (ado has it) | wrap read results with randomised markers | ms365 dev |
| 9 | Medium | both | discovery/authorize URLs built from `Host` when public URL unset | make `*_PUBLIC_URL` mandatory outside loopback | both |
| 10 | Low | host (upstream) | `GET /api/mcp/oauth/tokens/:flowId` returns raw tokens to the owner's browser; unused by the client | remove / return expiry only (ext overlay or upstream issue) | lead |
| 11 | Low | ado | no rate limit on `/register`, `/token`, `/authorize` | per-IP limiter | ado dev |
| 12 | Low | ms365 | `/register` accepts any `redirect_uris` | reject disallowed URIs at registration (as ado does) | ms365 dev |
| 13 | Low | ms365 | dead `verifyAccessToken` path writes a token to a process global | delete | ms365 dev |
| 14 | Low | ms365 | `mcpAuthRouter` still mounted (`/revoke` reachable) | mount only what is needed | ms365 dev |
| 15 | Info | both | bearer checked for expiry only (Microsoft rejects forged tokens downstream) | optional `aud`/`iss` check | — |
| 16 | Info | ado | without `ADO_MCP_CONFIRM_SECRET` a random per-process key is used (fine single-replica; not shared) | set the secret in prod | deploy |

## Verified safe
- Per-user token context per request in both servers; no cross-user maps.
- View iframe: separate origin, opaque inner frame (`allow-scripts allow-forms`), CSP `connect-src 'none'`, `form-action 'none'`,
  `frame-src 'none'`; postMessage source + origin checked both ways; nonce attestation; `frame-ancestors` validated, deny by default.
- Host app-tool gate: deny → 403; any evaluation fault → "ask" dialog; 401 without user; agent tool options only with VIEW permission.
- HTML sanitiser (both repos): allow-list DOM rebuild, no `innerHTML` of input, `href` limited to http/https/mailto/tel, remote images blocked.
- Host `openLink` refuses non-http(s) and undeclared domains (fail-safe; link buttons in views are therefore inert).
- ado refuses `savePath`/`destinationPath` over HTTP; request log has no headers/bodies; ms365 log files 0600.

## Production checklist (from the review)
TLS in front of both servers; `MS365_MCP_PUBLIC_URL`, `ADO_MCP_PUBLIC_URL`; `*_CORS_ORIGIN`; `*_ALLOWED_REDIRECT_URIS` (exact);
`ADO_MCP_CONFIRM_SECRET` (shared across replicas, distinct from the client secret); Entra client secrets from the secret manager;
`MS365_MCP_TRUST_PROXY_HOPS`; `MS365_MCP_RATE_LIMIT_DISABLED` unset; `MS365_MCP_ATTACHMENT_URL_BASE` (https) + `_KEY`;
`MS365_MCP_REDACT_PII` not false; no `-v`; `--trust-proxy-auth` off; host `MCP_SANDBOX_FRAME_ANCESTORS`, sandbox on its own origin,
`CREDS_KEY` from the secret store, `appsHonorToolApproval: true`, `toolApproval` policy from `tool-policy.md`.

## Not verified
Host `/api/mcp/sandbox` CSP at runtime (controller only), the host's state check on the MCP OAuth callback, whether any ms365 route
reaches `verifyAccessToken`. Agile/Scrum work item types (Feature, User Story, PBI, Bug) are not security items but are also unverified.

## Change log
- 0.1 (2026-11-05): first review; fixes dispatched to both developers.
