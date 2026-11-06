# Security checklist for an HTTP MCP server with per-user OAuth and views

Tokens
- Access/refresh tokens: host-side at rest (encrypted), host→server as `Authorization: Bearer` per request, server keeps
  them only in a per-request async context. Never in view HTML, tool results, `_meta`, logs, URLs, or process globals.
- No session ids (`sessionIdGenerator: undefined` — a fresh server per POST) or, if sessions exist, unguessable and
  bound to the user.
- Bearer check: expiry + (optionally) `aud`/`iss`. The upstream API still validates signature.

OAuth proxy
- Dynamic client registration: redirect URIs validated against `*_ALLOWED_REDIRECT_URIS` (exact match) at registration
  and at `/authorize`; loopback http allowed only when nothing is configured.
- PKCE S256 mandatory at `/authorize`; `code_verifier` mandatory at `/token`; `redirect_uri` mandatory.
- `*_PUBLIC_URL` mandatory off loopback; never build discovery/authorize URLs from the `Host` header; non-loopback
  `Host` gets 421.
- Per-IP rate limits on `/register`, `/token`, `/authorize` (and `/mcp`); `*_TRUST_PROXY_HOPS`; limiter never disabled in prod.
- Any "trust proxy auth" shortcut refuses to start off loopback.

Logging
- Method, path, status, timing only. No bodies, recipients, search terms, headers. Redact metadata objects, not only
  message strings. No verbose flag in prod. Log files 0600.

Views
- Sandbox on its own origin; inner frame opaque (`allow-scripts allow-forms`); CSP `connect-src 'none'`,
  `form-action 'none'`, `frame-src 'none'`; postMessage origin + source checks both ways; `frame-ancestors` validated,
  deny by default.
- Inline JSON escaped; HTML sanitised (allow-list rebuild); remote images blocked; links http/https/mailto/tel only.
- Tool results wrapped in randomised-delimiter markers labelling them untrusted (spotlighting); views strip them;
  opt-out env documented because it changes result bytes for non-UI clients.
- Review token bound to tool + args + expiry, single use, `timingSafeEqual`, secret shared across replicas and distinct
  from the OAuth client secret.

Writes
- Separate read and write tools; writes refuse without the view's confirmation; params that write server disk refused
  over HTTP; no admin-scope tools exposed.

Scale
- No in-process state that must survive a replica change (PKCE store, ticket store, spent-token list) without a shared
  store; refuse to start with a replica count > 1 until one exists.

Production checklist (env): TLS in front; `*_PUBLIC_URL`; `*_CORS_ORIGIN`; `*_ALLOWED_REDIRECT_URIS`; `*_CONFIRM_SECRET`;
client secrets from the secret manager; no verbose logging; redaction on; host sandbox origin + frame ancestors;
host approval policy configured from the register.
