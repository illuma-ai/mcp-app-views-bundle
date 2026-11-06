import { beforeEach, describe, expect, it, vi } from 'vitest';
import logger from '../src/logger.js';
import GraphClient from '../src/graph-client.js';
import type { AuthManager } from '../src/auth.js';
import type { AppSecrets } from '../src/secrets.js';

vi.mock('../src/logger.js', () => ({
  default: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

const TOKEN = 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.super-secret-token-value';

describe('graphRequest logging (#601)', () => {
  let client: GraphClient;

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ value: [] }),
      text: async () => '{"value":[]}',
      arrayBuffer: async () => new TextEncoder().encode('{"value":[]}').buffer,
    }) as unknown as typeof fetch;

    client = new GraphClient(
      { getToken: vi.fn().mockResolvedValue(TOKEN) } as unknown as AuthManager,
      { cloudType: 'global' } as unknown as AppSecrets
    );
  });

  function loggedLines(): string[] {
    return (logger.info as ReturnType<typeof vi.fn>).mock.calls.map((c) => String(c[0]));
  }

  it('never writes a per-request access token to the log', async () => {
    await client.graphRequest('/me/todo/lists', { method: 'GET', accessToken: TOKEN });

    const lines = loggedLines();
    expect(lines.some((l) => l.includes('/me/todo/lists'))).toBe(true);
    for (const line of lines) {
      expect(line).not.toContain(TOKEN);
    }
  });

  it('marks the redaction so the log still shows a token was passed', async () => {
    await client.graphRequest('/me/todo/lists', { method: 'GET', accessToken: TOKEN });

    const line = loggedLines().find((l) => l.startsWith('Calling GET /me/todo/lists'));
    expect(line).toContain('[accessToken=REDACTED]');
  });

  it('leaves the message unmarked when no token was passed', async () => {
    await client.graphRequest('/me/todo/lists', { method: 'GET' });

    const line = loggedLines().find((l) => l.startsWith('Calling GET /me/todo/lists'));
    expect(line).not.toContain('REDACTED');
    expect(line).toBe('Calling GET /me/todo/lists');
  });

  it('logs method and path only: no query text, body or recipients', async () => {
    await client.graphRequest(
      "/me/contacts?$search=%22merger%20plan%22&$filter=from/emailAddress/address%20eq%20'cfo@example.test'",
      {
        method: 'POST',
        body: JSON.stringify({
          subject: 'Secret subject',
          toRecipients: [{ emailAddress: { address: 'ceo@example.test' } }],
        }),
      }
    );
    const all = [...(logger.info as ReturnType<typeof vi.fn>).mock.calls]
      .map((c) => JSON.stringify(c))
      .join(' | ');
    for (const leaked of [
      'merger',
      'cfo@example.test',
      'ceo@example.test',
      'Secret subject',
      '$search',
      '$filter',
    ]) {
      expect(all, leaked).not.toContain(leaked);
    }
    expect(all).toContain('POST /me/contacts');
    // and the status of the call
    expect(all).toContain('POST /v1.0/me/contacts -> 200');
  });
});
