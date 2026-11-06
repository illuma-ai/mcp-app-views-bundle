/**
 * The HTTP/OAuth hardening: refusals at startup for configurations that are only safe on one machine,
 * and the OAuth proxy's PKCE, redirect-URI and registration checks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import MicrosoftGraphServer from '../src/server.js';
import type AuthManager from '../src/auth.js';
import { clearSecretsCache } from '../src/secrets.js';

const expressMocks = vi.hoisted(() => {
  type Handler = (req: Record<string, unknown>, res: Record<string, unknown>) => unknown;
  const routes = new Map<string, Handler>();
  const app: Record<string, ReturnType<typeof vi.fn>> = {};
  app.set = vi.fn(() => app);
  app.use = vi.fn(() => app);
  app.get = vi.fn((path: string, handler: Handler) => {
    routes.set(`GET ${path}`, handler);
    return app;
  });
  app.post = vi.fn((path: string, ...handlers: Handler[]) => {
    routes.set(`POST ${path}`, handlers[handlers.length - 1]);
    return app;
  });
  app.listen = vi.fn((...args: unknown[]) => {
    const callback = args.find((arg): arg is () => void => typeof arg === 'function');
    callback?.();
    return {
      close: vi.fn(),
      closeIdleConnections: vi.fn(),
      once: vi.fn(),
      address: vi.fn(() => ({ address: '127.0.0.1', family: 'IPv4', port: 3000 })),
    };
  });
  const express = Object.assign(
    vi.fn(() => app),
    {
      json: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
      urlencoded: vi.fn(() => (_req: unknown, _res: unknown, next: () => void) => next()),
    }
  );
  return { app, express, routes };
});

vi.mock('express', () => ({ default: expressMocks.express }));
vi.mock('../src/graph-tools.js', () => ({
  registerDiscoveryTools: vi.fn(),
  registerGraphTools: vi.fn(),
}));
vi.mock('../src/logger.js', () => ({
  default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
  enableConsoleLogging: vi.fn(),
}));

const authManager = {
  isOAuthModeEnabled: () => false,
  isMultiAccount: async () => false,
  listAccounts: async () => [],
  hasExpectedAccount: () => false,
} as unknown as AuthManager;

const ENV_KEYS = [
  'MS365_MCP_CLIENT_ID',
  'MS365_MCP_TENANT_ID',
  'MS365_MCP_PUBLIC_URL',
  'MS365_MCP_BASE_URL',
  'MS365_MCP_REPLICA_COUNT',
  'MS365_MCP_ALLOWED_REDIRECT_URIS',
];

async function start(options: Record<string, unknown>): Promise<void> {
  const server = new MicrosoftGraphServer(authManager, options);
  await server.initialize('0.0.0-test');
  await server.start();
}

type Res = {
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
  redirect: ReturnType<typeof vi.fn>;
};
function mockRes(): Res {
  const res = {} as Res;
  res.status = vi.fn(() => res);
  res.json = vi.fn(() => res);
  res.redirect = vi.fn(() => res);
  return res;
}

describe('HTTP startup refusals', () => {
  beforeEach(() => {
    clearSecretsCache();
    process.env.MS365_MCP_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    process.env.MS365_MCP_TENANT_ID = 'common';
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    expressMocks.routes.clear();
  });

  it('refuses --trust-proxy-auth on a non-loopback bind', async () => {
    await expect(
      start({ http: '0.0.0.0:3000', trustProxyAuth: true, publicUrl: 'https://mcp.example.com' })
    ).rejects.toThrow(/--trust-proxy-auth requires --http bound to a loopback host/);
    await expect(start({ http: '3000', trustProxyAuth: true })).rejects.toThrow(/loopback/);
  });

  it('allows --trust-proxy-auth on a loopback bind', async () => {
    await expect(start({ http: '127.0.0.1:3000', trustProxyAuth: true })).resolves.toBeUndefined();
  });

  it('refuses a non-loopback bind with no public URL, so discovery never comes from the Host header', async () => {
    await expect(start({ http: '0.0.0.0:3000' })).rejects.toThrow(/MS365_MCP_PUBLIC_URL/);
    await expect(start({ http: true })).rejects.toThrow(/MS365_MCP_PUBLIC_URL/);
    await expect(
      start({ http: '0.0.0.0:3000', publicUrl: 'https://mcp.example.com' })
    ).resolves.toBeUndefined();
  });

  it('refuses to run as more than one replica, whose PKCE and ticket stores are per process', async () => {
    process.env.MS365_MCP_REPLICA_COUNT = '2';
    await expect(start({ http: '127.0.0.1:3000' })).rejects.toThrow(/MS365_MCP_REPLICA_COUNT=2/);
  });
});

describe('OAuth proxy checks', () => {
  const redirect = 'http://localhost:6274/oauth/callback';
  const req = (url: string, body?: Record<string, unknown>) => ({
    url,
    body,
    protocol: 'https',
    get: () => 'relay.example',
  });

  beforeEach(async () => {
    clearSecretsCache();
    process.env.MS365_MCP_CLIENT_ID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    process.env.MS365_MCP_TENANT_ID = 'common';
    await start({ http: '127.0.0.1:3000', enableDynamicRegistration: true });
  });
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
    expressMocks.routes.clear();
  });

  const authorize = async (query: string): Promise<Res> => {
    const res = mockRes();
    await expressMocks.routes.get('GET /authorize')!(
      req(`/authorize?response_type=code&state=abcdefgh${query}`),
      res as never
    );
    return res;
  };

  it('/authorize requires an S256 code_challenge and a redirect_uri', async () => {
    const ok = await authorize(
      `&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=abc&code_challenge_method=S256`
    );
    expect(ok.redirect).toHaveBeenCalled();

    for (const query of [
      `&redirect_uri=${encodeURIComponent(redirect)}`,
      `&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=abc`,
      `&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=abc&code_challenge_method=plain`,
      '&code_challenge=abc&code_challenge_method=S256',
    ]) {
      const res = await authorize(query);
      expect(res.status, query).toHaveBeenCalledWith(400);
      expect(res.redirect, query).not.toHaveBeenCalled();
    }
  });

  it('/token refuses an authorization_code exchange without code, redirect_uri or code_verifier', async () => {
    for (const body of [
      { grant_type: 'authorization_code', code: 'c', redirect_uri: redirect },
      { grant_type: 'authorization_code', code: 'c', code_verifier: 'v' },
      { grant_type: 'authorization_code', redirect_uri: redirect, code_verifier: 'v' },
    ]) {
      const res = mockRes();
      await expressMocks.routes.get('POST /token')!(req('/token', body), res as never);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: 'invalid_request' }));
    }
  });

  it('/register accepts an allowed redirect URI and refuses the rest', async () => {
    const register = async (body: Record<string, unknown>): Promise<Res> => {
      const res = mockRes();
      await expressMocks.routes.get('POST /register')!(req('/register', body), res as never);
      return res;
    };
    const good = await register({ redirect_uris: [redirect], client_name: 'c' });
    expect(good.status).toHaveBeenCalledWith(201);

    for (const body of [
      {},
      { redirect_uris: [] },
      { redirect_uris: ['https://evil.example/cb'] },
      { redirect_uris: [redirect, 'javascript:alert(1)'] },
      { redirect_uris: 'not-a-list' },
    ]) {
      const res = await register(body);
      expect(res.status, JSON.stringify(body)).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: 'invalid_redirect_uri' })
      );
    }
  });

  it('/register honours MS365_MCP_ALLOWED_REDIRECT_URIS', async () => {
    process.env.MS365_MCP_ALLOWED_REDIRECT_URIS = 'https://claude.ai/api/mcp/auth_callback';
    const res = mockRes();
    await expressMocks.routes.get('POST /register')!(
      req('/register', { redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] }),
      res as never
    );
    expect(res.status).toHaveBeenCalledWith(201);
    const other = mockRes();
    await expressMocks.routes.get('POST /register')!(
      req('/register', { redirect_uris: [redirect] }),
      other as never
    );
    expect(other.status).toHaveBeenCalledWith(400);
  });
});
