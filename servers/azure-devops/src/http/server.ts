import { randomUUID } from "crypto";
import { createServer, IncomingMessage, Server, ServerResponse } from "http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { logger } from "../logger.js";
import { ADO_RESOURCE_SCOPE, HttpAuthConfig, ListenAddress, isLoopbackHost } from "./config.js";
import { DEFAULT_RATE_LIMIT, FixedWindowLimiter, type RateLimitConfig, clientIp } from "./rate-limit.js";
import { buildAuthorizeUrl, EntraError, exchangeCode, isJwtExpired, refreshToken } from "./entra.js";
import { isAllowedRedirectUri } from "./redirect-uri.js";
import { requestContext } from "./request-context.js";

export interface HttpServerDeps {
  auth: HttpAuthConfig;
  /** Builds a fresh MCP server per request (stateless mode: any replica serves any request). */
  createMcpServer: () => McpServer;
  /** Origin allowed by CORS; the chat host calls /mcp from its backend, browsers only hit discovery. */
  corsOrigin?: string;
  /** Per-IP limits for the OAuth endpoints and /mcp; on by default. */
  rateLimit?: RateLimitConfig;
}

const MAX_BODY_BYTES = 1_000_000;

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", ...headers });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new Error("Request body too large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** Parses a JSON or form-encoded body into a flat string map (token endpoint) or the JSON value (MCP). */
function parseBody(raw: string, contentType: string | undefined): unknown {
  if (!raw) return undefined;
  if (contentType?.includes("application/x-www-form-urlencoded")) return Object.fromEntries(new URLSearchParams(raw));
  return JSON.parse(raw);
}

/** Origin the browser/client should use to reach this server. */
function baseUrl(req: IncomingMessage, cfg: HttpAuthConfig): string {
  if (cfg.publicUrl) return cfg.publicUrl;
  return `http://${req.headers.host ?? "localhost"}`;
}

function wwwAuthenticate(base: string, description: string): string {
  return `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource", error="invalid_token", error_description="${description}"`;
}

/**
 * Creates the request listener for the HTTP transport.
 *
 * Endpoints: /mcp (streamable HTTP, bearer required), /authorize and /token (proxy to Entra),
 * the two RFC 8414 / RFC 9728 well-known documents, /health.
 */
export function createRequestHandler(deps: HttpServerDeps): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  const { auth } = deps;
  const corsOrigin = deps.corsOrigin ?? "http://localhost:3080";
  const limits = deps.rateLimit ?? DEFAULT_RATE_LIMIT;
  const authLimiter = new FixedWindowLimiter(limits.authMax, limits.windowMs);
  const mcpLimiter = new FixedWindowLimiter(limits.mcpMax, limits.windowMs);

  return async (req, res) => {
    // Request log (method, path, status; never headers, query strings or bodies, so no tokens or codes).
    const startedAt = Date.now();
    res.on("finish", () => {
      const path = (req.url ?? "/").split("?")[0];
      if (path !== "/health") logger.info("http request", { method: req.method, path, status: res.statusCode, ms: Date.now() - startedAt });
    });
    res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, mcp-protocol-version, mcp-session-id");
    res.setHeader("Access-Control-Expose-Headers", "WWW-Authenticate");
    if (req.method === "OPTIONS") {
      res.writeHead(204).end();
      return;
    }

    // Without a configured public URL every URL is built from the Host header, which is then only
    // trusted for loopback names (a request for any other name is refused, which also stops DNS rebinding).
    if (!auth.publicUrl && !isLoopbackHost(req.headers.host)) {
      sendJson(res, 421, { error: "misdirected_request", error_description: "Set ADO_MCP_PUBLIC_URL to serve this host name" });
      return;
    }
    const base = baseUrl(req, auth);
    const url = new URL(req.url ?? "/", base);
    const path = url.pathname;

    if (!limits.disabled) {
      const limiter = path === "/authorize" || path === "/token" || path === "/register" ? authLimiter : path === "/mcp" ? mcpLimiter : undefined;
      const wait = limiter?.hit(clientIp(req, limits.trustProxyHops)) ?? 0;
      if (wait > 0) {
        sendJson(res, 429, { error: "rate_limited", error_description: "Too many requests; try again shortly" }, { "Retry-After": String(wait) });
        return;
      }
    }

    try {
      if (req.method === "GET" && path === "/health") {
        sendJson(res, 200, { status: "ok" });
        return;
      }

      if (req.method === "GET" && path === "/.well-known/oauth-authorization-server") {
        sendJson(res, 200, {
          issuer: base,
          authorization_endpoint: `${base}/authorize`,
          token_endpoint: `${base}/token`,
          registration_endpoint: `${base}/register`,
          response_types_supported: ["code"],
          response_modes_supported: ["query"],
          grant_types_supported: ["authorization_code", "refresh_token"],
          token_endpoint_auth_methods_supported: ["none"],
          code_challenge_methods_supported: ["S256"],
          scopes_supported: [ADO_RESOURCE_SCOPE],
        });
        return;
      }

      if (req.method === "GET" && (path === "/.well-known/oauth-protected-resource" || path.startsWith("/.well-known/oauth-protected-resource/"))) {
        sendJson(res, 200, {
          resource: `${base}/mcp`,
          authorization_servers: [base],
          scopes_supported: [ADO_RESOURCE_SCOPE],
          bearer_methods_supported: ["header"],
        });
        return;
      }

      if (req.method === "POST" && path === "/register") {
        // RFC 7591 dynamic client registration. Stateless on purpose: every registered client maps to
        // the single Entra app (/authorize and /token substitute our client id), so nothing is stored
        // and any replica can answer. Redirect URIs are still checked against the allowlist.
        const body = (parseBody(await readBody(req), req.headers["content-type"]) ?? {}) as Record<string, unknown>;
        const redirectUris = Array.isArray(body.redirect_uris) ? body.redirect_uris.filter((u): u is string => typeof u === "string") : [];
        if (redirectUris.length === 0 || !redirectUris.every((u) => isAllowedRedirectUri(u, auth.allowedRedirectUris))) {
          sendJson(res, 400, { error: "invalid_redirect_uri", error_description: "redirect_uris are missing or not allowed" });
          return;
        }
        sendJson(res, 201, {
          client_id: `mcp-client-${randomUUID()}`,
          client_id_issued_at: Math.floor(Date.now() / 1000),
          redirect_uris: redirectUris,
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
          token_endpoint_auth_method: "none",
          client_name: typeof body.client_name === "string" ? body.client_name : "MCP Client",
        });
        return;
      }

      if (req.method === "GET" && path === "/authorize") {
        const redirectUri = url.searchParams.get("redirect_uri");
        if (!isAllowedRedirectUri(redirectUri, auth.allowedRedirectUris)) {
          logger.warn("Rejected /authorize with disallowed redirect_uri", { redirect_uri: redirectUri });
          sendJson(res, 400, { error: "invalid_request", error_description: "redirect_uri is not allowed" });
          return;
        }
        // PKCE is mandatory: the server holds the client secret, so a request without a challenge must not be forwarded.
        if (!url.searchParams.get("code_challenge") || url.searchParams.get("code_challenge_method") !== "S256") {
          sendJson(res, 400, { error: "invalid_request", error_description: "code_challenge with code_challenge_method=S256 is required" });
          return;
        }
        res.writeHead(302, { Location: buildAuthorizeUrl(auth, url.searchParams) }).end();
        return;
      }

      if (req.method === "POST" && path === "/token") {
        const body = (parseBody(await readBody(req), req.headers["content-type"]) ?? {}) as Record<string, string>;
        try {
          if (body.grant_type === "authorization_code") {
            if (!body.code || !body.redirect_uri || !body.code_verifier) {
              sendJson(res, 400, { error: "invalid_request", error_description: "code, redirect_uri and code_verifier are required" });
              return;
            }
            sendJson(res, 200, await exchangeCode(auth, body.code, body.redirect_uri, body.code_verifier));
          } else if (body.grant_type === "refresh_token") {
            if (!body.refresh_token) {
              sendJson(res, 400, { error: "invalid_request", error_description: "refresh_token is required" });
              return;
            }
            sendJson(res, 200, await refreshToken(auth, body.refresh_token));
          } else {
            sendJson(res, 400, { error: "unsupported_grant_type", error_description: `Grant type '${body.grant_type}' is not supported` });
          }
        } catch (error) {
          if (error instanceof EntraError) {
            logger.warn("Token endpoint: identity provider error", { status: error.status, error: error.body.error });
            sendJson(res, error.status, error.body);
          } else {
            throw error;
          }
        }
        return;
      }

      if (path === "/mcp") {
        if (req.method !== "POST") {
          sendJson(res, 405, { jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed." }, id: null }, { Allow: "POST" });
          return;
        }
        const header = req.headers.authorization;
        if (!header || !header.startsWith("Bearer ") || header.length <= 7) {
          sendJson(
            res,
            401,
            { error: "invalid_token", error_description: "Missing or malformed Authorization header" },
            { "WWW-Authenticate": wwwAuthenticate(base, "Missing or malformed Authorization header") }
          );
          return;
        }
        const accessToken = header.slice(7);
        if (isJwtExpired(accessToken)) {
          sendJson(res, 401, { error: "invalid_token", error_description: "The access token has expired" }, { "WWW-Authenticate": wwwAuthenticate(base, "The access token has expired") });
          return;
        }
        const parsed = parseBody(await readBody(req), req.headers["content-type"]);
        await requestContext.run({ accessToken }, async () => {
          const server = deps.createMcpServer();
          const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
          res.on("close", () => {
            void transport.close();
            void server.close();
          });
          await server.connect(transport);
          await transport.handleRequest(req, res, parsed);
        });
        return;
      }

      sendJson(res, 404, { error: "not_found" });
    } catch (error) {
      logger.error("HTTP request failed", error);
      if (!res.headersSent) {
        sendJson(res, 500, { jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
      } else {
        res.end();
      }
    }
  };
}

/** Starts listening and resolves once bound, with the actual address (useful with port 0). */
export function startHttpServer(deps: HttpServerDeps, listen: ListenAddress): Promise<{ server: Server; port: number }> {
  // One handler for the life of the server: the rate limiter counts across requests.
  const handler = createRequestHandler(deps);
  const server = createServer((req, res) => void handler(req, res));
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listen.port, listen.host, () => {
      const address = server.address();
      resolve({ server, port: typeof address === "object" && address ? address.port : listen.port });
    });
  });
}
