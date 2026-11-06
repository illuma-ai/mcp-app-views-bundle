import { describe, expect, it, beforeAll, afterAll, afterEach, jest } from "@jest/globals";
import type { Server } from "http";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { HttpAuthConfig, parseListenAddress, loadHttpAuthConfig, ADO_RESOURCE_SCOPE, assertSafePublicBinding, isLoopbackHost } from "../../../src/http/config";
import { request as httpRequest } from "http";
import { startHttpServer } from "../../../src/http/server";
import { getRequestToken } from "../../../src/http/request-context";
import { isAllowedRedirectUri } from "../../../src/http/redirect-uri";
import { buildServerInstructions } from "../../../src/http/start";

jest.mock("../../../src/tools", () => ({ configureAllTools: jest.fn() }));
// The views module pulls in an ESM-only SDK that this CommonJS setup cannot load; it is covered by test/src/views.
jest.mock("../../../src/views/server", () => ({ captureTools: jest.fn(), installViews: jest.fn() }));
jest.mock("../../../src/version", () => ({ packageVersion: "0.0.0-test" }));

const auth: HttpAuthConfig = {
  clientId: "client-123",
  tenantId: "tenant-456",
  allowedRedirectUris: ["http://localhost:3080/api/mcp/ado/oauth/callback"],
  authority: "https://login.example.test",
};
const CALLBACK = "http://localhost:3080/api/mcp/ado/oauth/callback";

/** Test MCP server with one tool that reports which user token the request carried. */
function createStubServer(): McpServer {
  const server = new McpServer({ name: "stub", version: "0.0.0" });
  server.registerTool("whoami", { description: "returns the request token", inputSchema: { delayMs: z.number().optional() } }, async ({ delayMs }) => {
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
    return { content: [{ type: "text", text: getRequestToken() }] };
  });
  return server;
}

let server: Server;
let base: string;
const realFetch = global.fetch;

beforeAll(async () => {
  const started = await startHttpServer({ auth, createMcpServer: createStubServer }, { host: "127.0.0.1", port: 0 });
  server = started.server;
  base = `http://127.0.0.1:${started.port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
afterEach(() => {
  global.fetch = realFetch;
});

/** A fake unsigned JWT; the server only inspects `exp`. */
function jwt(sub: string, expSecondsFromNow = 3600): string {
  const enc = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "none" })}.${enc({ sub, exp: Math.floor(Date.now() / 1000) + expSecondsFromNow })}.sig`;
}

async function rpc(token: string | undefined, body: object): Promise<Response> {
  return realFetch(`${base}/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json, text/event-stream", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

const callWhoami = (delayMs?: number) => ({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "whoami", arguments: { delayMs } } });

describe("discovery documents", () => {
  it("advertises this server as the authorization server", async () => {
    const meta = await (await realFetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(meta.authorization_endpoint).toBe(`${base}/authorize`);
    expect(meta.token_endpoint).toBe(`${base}/token`);
    expect(meta.code_challenge_methods_supported).toEqual(["S256"]);
    expect(meta.scopes_supported).toEqual([ADO_RESOURCE_SCOPE]);
  });

  it("points the protected resource at /mcp and this server", async () => {
    for (const path of ["/.well-known/oauth-protected-resource", "/.well-known/oauth-protected-resource/mcp"]) {
      const meta = await (await realFetch(`${base}${path}`)).json();
      expect(meta.resource).toBe(`${base}/mcp`);
      expect(meta.authorization_servers).toEqual([base]);
    }
  });
});

describe("dynamic client registration", () => {
  const register = (body: object) => realFetch(`${base}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

  it("is advertised in the authorization server metadata", async () => {
    const meta = await (await realFetch(`${base}/.well-known/oauth-authorization-server`)).json();
    expect(meta.registration_endpoint).toBe(`${base}/register`);
  });

  it("returns a client id for an allowed redirect URI", async () => {
    const res = await register({ redirect_uris: [CALLBACK], client_name: "chat" });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.client_id).toMatch(/^mcp-client-/);
    expect(body.redirect_uris).toEqual([CALLBACK]);
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("rejects missing or disallowed redirect URIs", async () => {
    expect((await register({})).status).toBe(400);
    expect((await register({ redirect_uris: ["http://evil.example/cb"] })).status).toBe(400);
  });
});

describe("public URL derivation", () => {
  it("builds metadata from the Host header the caller used", async () => {
    const viaLocalhost = base.replace("127.0.0.1", "localhost");
    const meta = await (await realFetch(`${viaLocalhost}/.well-known/oauth-authorization-server`)).json();
    expect(meta.issuer).toBe(viaLocalhost);
    expect(meta.authorization_endpoint).toBe(`${viaLocalhost}/authorize`);
  });

  it("uses the configured public URL when set", async () => {
    const started = await startHttpServer({ auth: { ...auth, publicUrl: "https://mcp.example" }, createMcpServer: createStubServer }, { host: "127.0.0.1", port: 0 });
    try {
      const meta = await (await realFetch(`http://127.0.0.1:${started.port}/.well-known/oauth-protected-resource`)).json();
      expect(meta.resource).toBe("https://mcp.example/mcp");
      expect(meta.authorization_servers).toEqual(["https://mcp.example"]);
    } finally {
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
    }
  });
});

describe("/authorize", () => {
  const authorize = (params: Record<string, string>) => realFetch(`${base}/authorize?${new URLSearchParams(params)}`, { redirect: "manual" });

  it("redirects to Entra with our client id, fixed scopes and the client's PKCE challenge", async () => {
    const res = await authorize({ response_type: "code", redirect_uri: CALLBACK, state: "s1", code_challenge: "abc", code_challenge_method: "S256", scope: "something else", client_id: "ignored" });
    expect(res.status).toBe(302);
    const location = new URL(res.headers.get("location") ?? "");
    expect(location.origin + location.pathname).toBe("https://login.example.test/tenant-456/oauth2/v2.0/authorize");
    expect(location.searchParams.get("client_id")).toBe("client-123");
    expect(location.searchParams.get("scope")).toBe(`${ADO_RESOURCE_SCOPE} offline_access`);
    expect(location.searchParams.get("code_challenge")).toBe("abc");
    expect(location.searchParams.get("state")).toBe("s1");
    expect(location.searchParams.get("redirect_uri")).toBe(CALLBACK);
  });

  it("rejects redirect URIs outside the allowlist", async () => {
    const res = await authorize({ response_type: "code", redirect_uri: "http://evil.example/cb" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_request");
  });

  it("rejects a missing redirect_uri", async () => {
    expect((await authorize({ response_type: "code" })).status).toBe(400);
  });
});

describe("/token", () => {
  function mockEntra(responseBody: object, status = 200) {
    const mock = jest.fn(async (input: any, init?: any) => {
      if (String(input).startsWith("https://login.example.test")) return new Response(JSON.stringify(responseBody), { status });
      return realFetch(input, init);
    });
    global.fetch = mock as unknown as typeof fetch;
    return mock;
  }
  const postToken = (body: Record<string, string>) => realFetch(`${base}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(body) });

  it("exchanges an authorization code with Entra, forwarding the verifier", async () => {
    const entra = mockEntra({ access_token: "at", refresh_token: "rt", expires_in: 3599, token_type: "Bearer" });
    const res = await postToken({ grant_type: "authorization_code", code: "c1", redirect_uri: CALLBACK, code_verifier: "ver" });
    expect(res.status).toBe(200);
    expect((await res.json()).refresh_token).toBe("rt");
    const call = entra.mock.calls.find((c) => String(c[0]).includes("login.example.test"));
    if (!call) throw new Error("no Entra call");
    expect(String(call[0])).toBe("https://login.example.test/tenant-456/oauth2/v2.0/token");
    const sent = new URLSearchParams((call[1] as RequestInit).body as URLSearchParams);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code_verifier")).toBe("ver");
    expect(sent.get("client_id")).toBe("client-123");
    expect(sent.get("client_secret")).toBeNull();
    expect(sent.get("scope")).toBe(`${ADO_RESOURCE_SCOPE} offline_access`);
  });

  it("refreshes tokens", async () => {
    const entra = mockEntra({ access_token: "at2", refresh_token: "rt2", expires_in: 3599, token_type: "Bearer" });
    const res = await postToken({ grant_type: "refresh_token", refresh_token: "rt" });
    expect(res.status).toBe(200);
    expect((await res.json()).access_token).toBe("at2");
    const call = entra.mock.calls.find((c) => String(c[0]).includes("login.example.test"));
    if (!call) throw new Error("no Entra call");
    expect(new URLSearchParams((call[1] as RequestInit).body as URLSearchParams).get("refresh_token")).toBe("rt");
  });

  it("passes Entra errors through with their status", async () => {
    mockEntra({ error: "invalid_grant", error_description: "expired" }, 400);
    const res = await postToken({ grant_type: "authorization_code", code: "c", redirect_uri: CALLBACK, code_verifier: "ver" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("invalid_grant");
  });

  it("rejects unsupported grants and missing fields", async () => {
    expect((await postToken({ grant_type: "password" })).status).toBe(400);
    expect((await postToken({ grant_type: "authorization_code" })).status).toBe(400);
    expect((await postToken({ grant_type: "refresh_token" })).status).toBe(400);
  });
});

describe("/mcp bearer enforcement", () => {
  it("returns 401 with a resource_metadata challenge when no bearer is sent", async () => {
    const res = await rpc(undefined, callWhoami());
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(`resource_metadata="${base}/.well-known/oauth-protected-resource"`);
  });

  it("returns 401 for an expired token", async () => {
    expect((await rpc(jwt("old", -60), callWhoami())).status).toBe(401);
  });

  it("rejects GET on /mcp", async () => {
    expect((await realFetch(`${base}/mcp`)).status).toBe(405);
  });

  it("serves tools/list with a valid bearer", async () => {
    const res = await rpc(jwt("u1"), { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
    expect(res.status).toBe(200);
    expect((await res.json()).result.tools.map((t: { name: string }) => t.name)).toContain("whoami");
  });
});

describe("per-user context isolation", () => {
  it("keeps concurrent users' tokens apart", async () => {
    const tokens = [jwt("alice"), jwt("bob"), jwt("carol")];
    const results = await Promise.all(tokens.map((t, i) => rpc(t, callWhoami(30 - i * 10)).then((r) => r.json())));
    results.forEach((r, i) => expect(r.result.content[0].text).toBe(tokens[i]));
  });

  it("has no token outside a request", () => {
    expect(() => getRequestToken()).toThrow(/sign in required/);
  });
});

describe("configuration helpers", () => {
  it("parses --http values", () => {
    expect(parseListenAddress("")).toEqual({ host: "127.0.0.1", port: 3001 });
    expect(parseListenAddress(undefined)).toEqual({ host: "127.0.0.1", port: 3001 });
    expect(parseListenAddress("3005")).toEqual({ host: "127.0.0.1", port: 3005 });
    expect(parseListenAddress("0.0.0.0:8080")).toEqual({ host: "0.0.0.0", port: 8080 });
    expect(parseListenAddress("[::1]:9000")).toEqual({ host: "::1", port: 9000 });
    expect(() => parseListenAddress("host:abc")).toThrow(/Invalid port/);
  });

  it("requires client and tenant ids and reads the optional ones", () => {
    expect(() => loadHttpAuthConfig({})).toThrow(/ADO_MCP_CLIENT_ID/);
    expect(() => loadHttpAuthConfig({ ADO_MCP_CLIENT_ID: "c" })).toThrow(/ADO_MCP_TENANT_ID/);
    const cfg = loadHttpAuthConfig({
      ADO_MCP_CLIENT_ID: "c",
      ADO_MCP_TENANT_ID: "t",
      ADO_MCP_CLIENT_SECRET: "s",
      ADO_MCP_ALLOWED_REDIRECT_URIS: "https://a/cb, https://b/cb",
      ADO_MCP_PUBLIC_URL: "https://mcp.example/",
    });
    expect(cfg).toMatchObject({ clientId: "c", tenantId: "t", clientSecret: "s", allowedRedirectUris: ["https://a/cb", "https://b/cb"], publicUrl: "https://mcp.example" });
  });

  it("validates redirect URIs", () => {
    expect(isAllowedRedirectUri("javascript:alert(1)", null)).toBe(false);
    expect(isAllowedRedirectUri("http://example.com/cb", null)).toBe(false);
    expect(isAllowedRedirectUri("http://localhost:3080/cb", null)).toBe(true);
    expect(isAllowedRedirectUri("https://example.com/cb", null)).toBe(true);
    expect(isAllowedRedirectUri("https://example.com/cb", ["https://other/cb"])).toBe(false);
  });

  it("derives default project/team instructions from the environment", () => {
    expect(buildServerInstructions({})).toBeUndefined();
    expect(buildServerInstructions({ ADO_MCP_PROJECT: "Dev", ADO_MCP_TEAM: "Dev Team" })).toMatch(/"Dev".*"Dev Team"/);
  });
});

describe("security hardening", () => {
  it("requires PKCE (S256) at /authorize and a verifier at /token", async () => {
    const authorize = (params: Record<string, string>) => realFetch(`${base}/authorize?${new URLSearchParams({ response_type: "code", redirect_uri: CALLBACK, ...params })}`, { redirect: "manual" });
    expect((await authorize({})).status).toBe(400);
    expect((await authorize({ code_challenge: "abc" })).status).toBe(400);
    expect((await authorize({ code_challenge: "abc", code_challenge_method: "plain" })).status).toBe(400);
    expect((await authorize({ code_challenge: "abc", code_challenge_method: "S256" })).status).toBe(302);

    const noVerifier = await realFetch(`${base}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code: "c", redirect_uri: CALLBACK }),
    });
    expect(noVerifier.status).toBe(400);
    expect((await noVerifier.json()).error_description).toMatch(/code_verifier/);
  });

  it("only serves loopback host names when no public URL is configured", async () => {
    const status = (host: string): Promise<number> =>
      new Promise((resolve, reject) => {
        const port = Number(new URL(base).port);
        const req = httpRequest({ host: "127.0.0.1", port, path: "/.well-known/oauth-authorization-server", headers: { Host: host } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on("error", reject);
        req.end();
      });
    expect(await status(`localhost:${new URL(base).port}`)).toBe(200);
    expect(await status("evil.example")).toBe(421);
    expect(await status("evil.example:3001")).toBe(421);
  });

  it("refuses to listen beyond loopback without ADO_MCP_PUBLIC_URL", () => {
    expect(() => assertSafePublicBinding({ host: "0.0.0.0", port: 3001 }, auth)).toThrow(/ADO_MCP_PUBLIC_URL/);
    expect(() => assertSafePublicBinding({ host: "10.0.0.5", port: 3001 }, auth)).toThrow(/ADO_MCP_PUBLIC_URL/);
    expect(() => assertSafePublicBinding({ host: "0.0.0.0", port: 3001 }, { ...auth, publicUrl: "https://mcp.example" })).not.toThrow();
    for (const host of ["127.0.0.1", "localhost", "::1"]) expect(() => assertSafePublicBinding({ host, port: 3001 }, auth)).not.toThrow();
    expect([isLoopbackHost("localhost:3001"), isLoopbackHost("[::1]:3001"), isLoopbackHost("evil.example"), isLoopbackHost(undefined)]).toEqual([true, true, false, false]);
  });

  it("limits requests per IP on the OAuth endpoints and on /mcp", async () => {
    const started = await startHttpServer(
      { auth, createMcpServer: createStubServer, rateLimit: { authMax: 2, mcpMax: 3, windowMs: 60_000, disabled: false, trustProxyHops: 0 } },
      { host: "127.0.0.1", port: 0 }
    );
    const url = `http://127.0.0.1:${started.port}`;
    try {
      const codes: number[] = [];
      for (let i = 0; i < 4; i++)
        codes.push((await realFetch(`${url}/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ redirect_uris: [CALLBACK] }) })).status);
      expect(codes).toEqual([201, 201, 429, 429]);
      // The three OAuth endpoints share one window per IP; /mcp has its own.
      const token = await realFetch(`${url}/token`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "x" }) });
      expect(token.status).toBe(429);
      expect(Number(token.headers.get("retry-after"))).toBeGreaterThan(0);
      const mcp: number[] = [];
      for (let i = 0; i < 4; i++) mcp.push((await realFetch(`${url}/mcp`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
      expect(mcp).toEqual([401, 401, 401, 429]);
    } finally {
      await new Promise<void>((resolve) => started.server.close(() => resolve()));
    }
  });
});
