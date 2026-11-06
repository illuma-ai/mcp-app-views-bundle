/**
 * Configuration for the streamable HTTP transport and its Entra sign-in proxy.
 * Everything is read from the environment so deployments inject values and
 * nothing is hardcoded. This module is additive: it does not alter the stdio path.
 */

/** Resource scope of the Azure DevOps REST API (delegated, all granted permissions). */
export const ADO_RESOURCE_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";
/** Requested alongside the resource scope so Entra issues a refresh token. */
export const OFFLINE_ACCESS_SCOPE = "offline_access";
export const ENTRA_AUTHORITY = "https://login.microsoftonline.com";

export interface HttpAuthConfig {
  clientId: string;
  tenantId: string;
  clientSecret?: string;
  /** Exact-match redirect URI allowlist; null means "https anywhere, http on loopback only". */
  allowedRedirectUris: string[] | null;
  /** Externally visible origin (no trailing slash) when behind a proxy; otherwise derived per request. */
  publicUrl?: string;
  /** Overridable for tests. */
  authority: string;
}

export interface ListenAddress {
  host: string;
  port: number;
}

export const DEFAULT_HTTP_HOST = "127.0.0.1";
export const DEFAULT_HTTP_PORT = 3001;

function toPort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Invalid port '${raw}' for --http`);
  }
  return port;
}

/**
 * Parses the value of `--http`: empty / `true` => defaults, `3001`, `host`, or `host:port`.
 * @throws Error when the port is not a valid number.
 */
export function parseListenAddress(value: string | boolean | undefined): ListenAddress {
  if (value === undefined || value === true || value === "" || value === "true") {
    return { host: DEFAULT_HTTP_HOST, port: DEFAULT_HTTP_PORT };
  }
  const raw = String(value);
  if (/^\d+$/.test(raw)) return { host: DEFAULT_HTTP_HOST, port: toPort(raw) };
  const idx = raw.lastIndexOf(":");
  if (idx === -1) return { host: raw, port: DEFAULT_HTTP_PORT };
  const host = raw.slice(0, idx).replace(/^\[|\]$/g, "") || DEFAULT_HTTP_HOST;
  return { host, port: toPort(raw.slice(idx + 1)) };
}

export function parseAllowlist(raw: string | undefined | null): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

/**
 * Reads the sign-in configuration from the environment.
 * @throws Error naming the missing variable when a required one is absent.
 */
export function loadHttpAuthConfig(env: NodeJS.ProcessEnv = process.env): HttpAuthConfig {
  const clientId = env.ADO_MCP_CLIENT_ID?.trim();
  const tenantId = env.ADO_MCP_TENANT_ID?.trim();
  if (!clientId) throw new Error("ADO_MCP_CLIENT_ID is required for --http");
  if (!tenantId) throw new Error("ADO_MCP_TENANT_ID is required for --http");
  const publicUrl = env.ADO_MCP_PUBLIC_URL?.trim().replace(/\/+$/, "");
  return {
    clientId,
    tenantId,
    clientSecret: env.ADO_MCP_CLIENT_SECRET?.trim() || undefined,
    allowedRedirectUris: parseAllowlist(env.ADO_MCP_ALLOWED_REDIRECT_URIS),
    publicUrl: publicUrl || undefined,
    authority: ENTRA_AUTHORITY,
  };
}

const LOOPBACK_NAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** True for a loopback host name or address, with or without a port (a Host header or a bind address). */
export function isLoopbackHost(hostWithPort: string | undefined): boolean {
  if (!hostWithPort) return false;
  const colons = (hostWithPort.match(/:/g) ?? []).length;
  // "[::1]:3001" and "host:3001" carry a port; a bare "::1" is an address.
  const host = hostWithPort.startsWith("[") ? hostWithPort.slice(0, hostWithPort.indexOf("]") + 1) : colons === 1 ? hostWithPort.replace(/:\d+$/, "") : hostWithPort;
  return LOOPBACK_NAMES.has(host.toLowerCase());
}

/**
 * Discovery and authorize URLs must not be built from a Host header an attacker controls. Outside
 * loopback the externally visible origin therefore has to be configured.
 * @throws Error when the server would listen beyond loopback without `ADO_MCP_PUBLIC_URL`.
 */
export function assertSafePublicBinding(listen: ListenAddress, cfg: HttpAuthConfig): void {
  if (!cfg.publicUrl && !isLoopbackHost(listen.host)) {
    throw new Error(`ADO_MCP_PUBLIC_URL is required when listening on ${listen.host}: it names the origin clients use, so OAuth discovery and authorize URLs are never built from the Host header.`);
  }
}
