import { ADO_RESOURCE_SCOPE, HttpAuthConfig, OFFLINE_ACCESS_SCOPE } from "./config.js";

/** Subset of the Entra token response passed back to the MCP client unchanged. */
export interface EntraTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  refresh_token?: string;
}

export class EntraError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: Record<string, unknown>
  ) {
    super(String(body.error_description ?? body.error ?? "Entra request failed"));
  }
}

const FORWARDED_AUTHORIZE_PARAMS = ["response_type", "redirect_uri", "state", "response_mode", "prompt", "login_hint", "domain_hint", "code_challenge", "code_challenge_method"];
const REQUEST_SCOPE = `${ADO_RESOURCE_SCOPE} ${OFFLINE_ACCESS_SCOPE}`;

/**
 * Builds the Entra authorize URL for a client request. The client's PKCE
 * challenge is forwarded as-is, so Entra itself verifies the client's verifier
 * at the token step and the proxy keeps no per-flow state (any replica can
 * answer /token). Scopes are fixed to Azure DevOps whatever the client asked for.
 */
export function buildAuthorizeUrl(cfg: HttpAuthConfig, query: URLSearchParams): string {
  const url = new URL(`${cfg.authority}/${cfg.tenantId}/oauth2/v2.0/authorize`);
  for (const name of FORWARDED_AUTHORIZE_PARAMS) {
    const value = query.get(name);
    if (value) url.searchParams.set(name, value);
  }
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("scope", REQUEST_SCOPE);
  return url.toString();
}

async function postToken(cfg: HttpAuthConfig, params: URLSearchParams): Promise<EntraTokenResponse> {
  params.set("client_id", cfg.clientId);
  if (cfg.clientSecret) params.set("client_secret", cfg.clientSecret);
  params.set("scope", REQUEST_SCOPE);
  const res = await fetch(`${cfg.authority}/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  const text = await res.text();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { error: "server_error", error_description: "Unexpected response from the identity provider" };
  }
  if (!res.ok) throw new EntraError(res.status, parsed);
  return parsed as unknown as EntraTokenResponse;
}

export function exchangeCode(cfg: HttpAuthConfig, code: string, redirectUri: string, codeVerifier?: string): Promise<EntraTokenResponse> {
  const params = new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: redirectUri });
  if (codeVerifier) params.set("code_verifier", codeVerifier);
  return postToken(cfg, params);
}

export function refreshToken(cfg: HttpAuthConfig, token: string): Promise<EntraTokenResponse> {
  return postToken(cfg, new URLSearchParams({ grant_type: "refresh_token", refresh_token: token }));
}

/** True for a JWT whose exp is in the past; opaque tokens pass through for the API to judge. */
export function isJwtExpired(token: string, now: number = Date.now()): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.exp === "number" && payload.exp * 1000 < now;
  } catch {
    return false;
  }
}
