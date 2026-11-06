import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import type { GraphClient } from '../src/graph-client.js';
import { registerGraphTools } from '../src/graph-tools.js';
import { parseEnabledToolsFileContent } from '../src/lib/enabled-tools-file.js';
import {
  BODY_CAP_HTML,
  BODY_CAP_TEXT,
  DEFAULT_RESULT_CAP,
  capJsonText,
  resultCapChars,
} from '../src/lib/result-cap.js';
import { parseToolResult } from '../src/views/mail/api.js';

vi.mock('../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const message = (i: number, bodyChars = 1000) => ({
  id: `M${i}`,
  subject: `Subject ${i}`,
  bodyPreview: 'x'.repeat(bodyChars),
});

describe('capJsonText', () => {
  it('returns a result under the cap byte for byte', () => {
    const text = JSON.stringify({ value: [message(1, 100)] }, null, 2);
    expect(capJsonText(text, { cap: 60_000 })).toBe(text);
  });

  it('cuts a list to the first complete items with the paging facts, never mid-JSON', () => {
    const value = Array.from({ length: 50 }, (_, i) => message(i, 5000));
    const text = JSON.stringify({
      '@odata.context': 'ctx',
      '@odata.nextLink': 'https://graph/v1.0/me/messages?$top=50&$skip=50',
      value,
    });
    expect(text.length).toBeGreaterThan(200_000);
    const out = capJsonText(text, { cap: 60_000 });
    expect(out.length).toBeLessThanOrEqual(60_000);
    const parsed = JSON.parse(out);
    expect(parsed.truncated).toBe(true);
    expect(parsed.total).toBe(50);
    expect(parsed.returned).toBe(parsed.value.length);
    expect(parsed.returned).toBeGreaterThan(5);
    expect(parsed.value.every((m: { id: string }, i: number) => m.id === `M${i}`)).toBe(true);
    expect(parsed.hint).toMatch(/skiptoken|top/);
    // the next link pages from the first dropped item, not past it
    expect(parsed.nextLink).toContain(`$skip=${50 - (50 - parsed.returned)}`);
    expect(parsed['@odata.context']).toBe('ctx');
  });

  it('keeps one oversized item, tightened, rather than returning nothing', () => {
    const fat = (i: number) => ({
      id: 'M' + i,
      a: 'a'.repeat(100_000),
      b: 'b'.repeat(100_000),
      c: 'c'.repeat(100_000),
      d: 'd'.repeat(100_000),
    });
    const text = JSON.stringify({ value: [fat(1), fat(2)] });
    const out = JSON.parse(capJsonText(text, { cap: 60_000 }));
    expect(out.returned).toBe(1);
    expect(out.value[0].a.length).toBeLessThan(5000);
  });

  it('shortens a long body with a marker that says how much and where to read the rest', () => {
    const body = 'y'.repeat(BODY_CAP_TEXT + 500);
    const out = JSON.parse(
      capJsonText(JSON.stringify({ id: 'M1', body: { content: body } }), {
        cap: 60_000,
        bodyHint: 'read-mail-text',
      })
    );
    expect(out.body.content.endsWith('…[500 more chars; use read-mail-text]')).toBe(true);
    expect(out.body.content.length).toBeLessThan(BODY_CAP_TEXT + 100);
  });

  it('lets an HTML body (the views) run longer than a text one', () => {
    const body = 'z'.repeat(BODY_CAP_TEXT * 2);
    const text = JSON.stringify({ id: 'M1', body: { content: body } });
    expect(JSON.parse(capJsonText(text, { cap: 60_000 })).body.content).toContain('more chars');
    expect(capJsonText(text, { cap: 600_000, html: true })).toBe(text);
    expect(BODY_CAP_HTML).toBeGreaterThan(BODY_CAP_TEXT);
  });

  it('leaves non-JSON text and a zero cap alone', () => {
    const toon = 'value[2]{id}:\n  a\n  b\n' + 'q'.repeat(100_000);
    expect(capJsonText(toon, { cap: 60_000 })).toBe(toon);
    const big = JSON.stringify({ value: Array.from({ length: 100 }, (_, i) => message(i, 5000)) });
    expect(capJsonText(big, { cap: 0 })).toBe(big);
  });

  it('reads the cap from the environment', () => {
    expect(resultCapChars({})).toBe(DEFAULT_RESULT_CAP);
    expect(resultCapChars({ MS365_MCP_RESULT_CAP_CHARS: '1000' })).toBe(1000);
    expect(resultCapChars({ MS365_MCP_RESULT_CAP_CHARS: '0' })).toBe(0);
    expect(resultCapChars({ MS365_MCP_RESULT_CAP_CHARS: 'x' })).toBe(DEFAULT_RESULT_CAP);
  });

  it('a capped list still parses as a list for the views, with the next link intact', () => {
    const value = Array.from({ length: 40 }, (_, i) => message(i, 5000));
    const text = capJsonText(
      JSON.stringify({ '@odata.nextLink': 'https://graph/x?$skiptoken=abc', value }),
      { cap: 60_000 }
    );
    const parsed = parseToolResult<{ value: unknown[]; '@odata.nextLink': string }>({
      content: [{ type: 'text', text }],
    });
    expect(Array.isArray(parsed.data?.value)).toBe(true);
    expect(parsed.data?.['@odata.nextLink']).toBe('https://graph/x?$skiptoken=abc');
  });
});

function fakeGraph(payload: () => string) {
  const graphRequest = vi.fn(async () => ({ content: [{ type: 'text', text: payload() }] }));
  return {
    graph: { graphRequest, serialize: (d: unknown) => JSON.stringify(d) } as unknown as GraphClient,
    graphRequest,
  };
}

async function connect(graph: GraphClient, options: Parameters<typeof registerGraphTools>[2]) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerGraphTools(server, graph, options);
  const client = new Client({ name: 'c', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('list tools are bounded', () => {
  const big = () =>
    JSON.stringify({ value: Array.from({ length: 25 }, (_, i) => message(i, 8000)) });

  it('select light fields and ask for a bounded page unless the caller chooses', async () => {
    const { graph, graphRequest } = fakeGraph(big);
    const client = await connect(graph, { orgMode: true });
    await client.callTool({ name: 'list-mail-messages', arguments: {} });
    const endpoint = decodeURIComponent(String((graphRequest.mock.calls[0] as unknown[])[0]));
    expect(endpoint).toContain(
      '$select=id,subject,from,toRecipients,receivedDateTime,isRead,hasAttachments,bodyPreview,conversationId,webLink'
    );
    expect(endpoint).toContain('$top=25');
    expect(endpoint).not.toMatch(/[,=]body[,&]|\bbody\b(?!Preview)/);

    graphRequest.mockClear();
    await client.callTool({
      name: 'list-mail-messages',
      arguments: { select: 'id,subject', top: 5 },
    });
    const own = decodeURIComponent(String((graphRequest.mock.calls[0] as unknown[])[0]));
    expect(own).toContain('$select=id,subject');
    expect(own).not.toContain('bodyPreview');
    expect(own).toContain('$top=5');
  });

  it('refuses a page bigger than 25 for mail, files and chats', async () => {
    const { graph, graphRequest } = fakeGraph(big);
    const client = await connect(graph, { orgMode: true });
    for (const [name, extra] of [
      ['list-mail-messages', {}],
      ['list-mail-folder-messages', { mailFolderId: 'inbox' }],
      ['list-folder-files', { driveId: 'd', driveItemId: 'i' }],
      ['list-chats', {}],
      ['list-chat-messages', { chatId: 'c' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: { ...extra, top: 26 } });
      expect(result.isError, name).toBe(true);
    }
    expect(graphRequest).not.toHaveBeenCalled();
  });

  it('caps a large list result to complete items with the paging facts', async () => {
    const { graph } = fakeGraph(() =>
      JSON.stringify({ value: Array.from({ length: 25 }, (_, i) => message(i, 8000)) })
    );
    const client = await connect(graph, { orgMode: true });
    const result = await client.callTool({ name: 'list-mail-messages', arguments: {} });
    const text = (result.content as Array<{ text: string }>)[0].text;
    expect(text.length).toBeLessThanOrEqual(60_000);
    const parsed = JSON.parse(text);
    expect(parsed).toMatchObject({ truncated: true, total: 25 });
    expect(parsed.returned).toBeLessThan(25);
  });

  it('shortens a long message body and names read-mail-text', async () => {
    const { graph } = fakeGraph(() =>
      JSON.stringify({ id: 'M1', body: { contentType: 'text', content: 'w'.repeat(50_000) } })
    );
    const client = await connect(graph, { orgMode: true });
    const result = await client.callTool({
      name: 'get-mail-message',
      arguments: { messageId: 'M1' },
    });
    const parsed = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(parsed.body.content).toContain('more chars; use read-mail-text]');
  });

  it('tells the model to use read-mail-text for bodies', async () => {
    const { graph } = fakeGraph(big);
    const client = await connect(graph, { orgMode: true });
    const tools = new Map(
      (await client.listTools()).tools.map((t) => [t.name, t.description ?? ''])
    );
    for (const name of ['list-mail-messages', 'list-mail-folder-messages', 'get-mail-message']) {
      expect(tools.get(name), name).toContain('read-mail-text');
    }
    expect(tools.has('read-mail-text')).toBe(true);
  });
});

describe('the local enabled-tools file', () => {
  it('enables exactly the listed tools, read-mail-text included and no channel tool', async () => {
    const content = readFileSync(
      new URL('../docs/enabled-tools.local.txt', import.meta.url),
      'utf8'
    );
    const pattern = parseEnabledToolsFileContent(content);
    const wanted = content
      .split(/\r?\n/)
      .filter((l) => l.startsWith('^'))
      .map((l) => l.replace(/^\^|\$$/g, ''));
    const { graph } = fakeGraph(() => '{}');
    const client = await connect(graph, { orgMode: true, appViews: true, enabledTools: pattern });
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual([...wanted].sort());
    expect(names).toContain('read-mail-text');
    expect(names.filter((n) => /channel|team/.test(n))).toEqual([]);
  });
});
