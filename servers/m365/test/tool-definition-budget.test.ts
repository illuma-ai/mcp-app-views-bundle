import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { measureTools } from '../bin/tools-size.js';
import type { GraphClient } from '../src/graph-client.js';
import { registerGraphTools } from '../src/graph-tools.js';

vi.mock('../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/**
 * Tokens are characters / 4 times the live calibration (1.4: the host counted 143k for what is 103k by
 * characters / 4), the way docs/tool-definition-size.md counts. A host that cannot fit the definitions
 * tells the user their messages do not fit, so the set must stay far below the model's window.
 */
const PER_TOOL_BUDGET = 600;
const TOTAL_BUDGET = 25_000;

afterEach(() => {
  delete process.env.MS365_MCP_TOOL_DEFINITION_BUDGET;
});

describe('tool definition budget', () => {
  it('keeps every enabled tool within its budget, and the set within the total', async () => {
    const sizes = await measureTools();
    expect(sizes.length).toBeGreaterThanOrEqual(45);
    const over = sizes
      .filter((t) => t.tokens > PER_TOOL_BUDGET)
      .map((t) => `${t.name}: ${t.tokens}`);
    expect(over, `tools over ${PER_TOOL_BUDGET} tokens`).toEqual([]);
    const total = sizes.reduce((sum, t) => sum + t.tokens, 0);
    expect(total, 'total tokens').toBeLessThanOrEqual(TOTAL_BUDGET);
  });

  it('keeps the documented 51-tool set (channel tools included) within the same budgets', async () => {
    const doc = readFileSync(new URL('../docs/interactive-views.md', import.meta.url), 'utf8');
    const pattern = /--enabled-tools '([^']+)'/.exec(doc)?.[1];
    expect(pattern).toBeTruthy();
    const sizes = await measureTools({ pattern });
    expect(sizes.length).toBeGreaterThanOrEqual(50);
    expect(sizes.filter((t) => t.tokens > PER_TOOL_BUDGET).map((t) => t.name)).toEqual([]);
    expect(sizes.reduce((sum, t) => sum + t.tokens, 0)).toBeLessThanOrEqual(TOTAL_BUDGET);
  });

  it('is much smaller than the generated definitions, which it can still reproduce', async () => {
    const compact = (await measureTools()).reduce((sum, t) => sum + t.tokens, 0);
    const generated = (await measureTools({ compact: false })).reduce(
      (sum, t) => sum + t.tokens,
      0
    );
    expect(generated).toBeGreaterThan(compact * 4);
  });

  it('still accepts what the views send: loose bodies and every query option, advertised or not', async () => {
    const calls: unknown[][] = [];
    const graph = {
      graphRequest: vi.fn(async (...args: unknown[]) => {
        calls.push(args);
        return { content: [{ type: 'text', text: '{}' }] };
      }),
      serialize: JSON.stringify,
    } as unknown as GraphClient;
    const server = new McpServer({ name: 't', version: '0' });
    registerGraphTools(server, graph, { orgMode: true, appViews: true, httpMode: true });
    const client = new Client({ name: 'c', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);

    const tools = new Map((await client.listTools()).tools.map((t) => [t.name, t]));
    const props = (name: string) =>
      Object.keys((tools.get(name)?.inputSchema as { properties?: object }).properties ?? {});
    // advertised: what a model needs
    expect(props('list-mail-messages')).toEqual(
      expect.arrayContaining(['select', 'filter', 'top', 'search', 'skiptoken'])
    );
    // not advertised: rare options
    for (const rare of ['skip', 'count', 'fetchAllPages', 'includeHeaders', 'excludeResponse']) {
      expect(props('list-mail-messages'), rare).not.toContain(rare);
    }
    // a body is one described object
    const body = (
      tools.get('create-todo-task')?.inputSchema as {
        properties: Record<string, { description?: string }>;
      }
    ).properties.body;
    expect(body.description).toContain('title');
    // and the calls the views make still go through: a write with its own body shape, a list with expand
    const todo = await client.callTool({
      name: 'create-todo-task',
      arguments: { todoTaskListId: 'l1', body: { title: 'x' }, confirm: true },
    });
    expect(todo.isError).toBeFalsy();
    const list = await client.callTool({
      name: 'list-chats',
      arguments: {
        expand: 'members,lastMessagePreview',
        top: 25,
        orderby: 'lastMessagePreview/createdDateTime desc',
      },
    });
    expect(list.isError).toBeFalsy();
    expect(calls.length).toBe(2);
  });

  it('turns off with MS365_MCP_TOOL_DEFINITION_BUDGET=0', async () => {
    process.env.MS365_MCP_TOOL_DEFINITION_BUDGET = '0';
    const total = (await measureTools()).reduce((sum, t) => sum + t.tokens, 0);
    expect(total).toBeGreaterThan(TOTAL_BUDGET);
  });
});
