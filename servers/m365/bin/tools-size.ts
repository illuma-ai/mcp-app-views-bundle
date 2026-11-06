/**
 * Prints what each enabled tool's definition costs the model: the tool as `tools/list` serves it
 * (name, description and input schema), in characters and in tokens (characters / 4).
 *
 *   npm run tools:size                       the local set (docs/enabled-tools.local.txt)
 *   npm run tools:size -- --all              every tool for the org surface
 *   npm run tools:size -- --markdown         a table for docs/tool-definition-size.md
 *
 * Only the definitions count here; they are sent on every request, whatever the user asks.
 */
import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GraphClient } from '../src/graph-client.js';
import { registerGraphTools } from '../src/graph-tools.js';
import { parseEnabledToolsFileContent } from '../src/lib/enabled-tools-file.js';

/**
 * Tokens per (characters / 4). Measured live: the host's tokenizer counted 143k tokens for 46 definitions
 * that are 103k by characters / 4, so JSON schema text costs about 1.4x the rough estimate. Every budget
 * here uses the calibrated figure.
 */
export const TOKEN_CALIBRATION = 1.4;

export interface ToolSize {
  name: string;
  chars: number;
  tokens: number;
  descriptionChars: number;
  schemaChars: number;
}

/** Registers the tools the way the HTTP server does and measures each served definition. */
export async function measureTools(
  options: { all?: boolean; compact?: boolean; pattern?: string } = {}
): Promise<ToolSize[]> {
  // Compact is the default over HTTP; 0 measures the generated definitions as they were.
  const before = process.env.MS365_MCP_TOOL_DEFINITION_BUDGET;
  if (options.compact === false) process.env.MS365_MCP_TOOL_DEFINITION_BUDGET = '0';
  try {
    return await measure(options);
  } finally {
    if (before === undefined) delete process.env.MS365_MCP_TOOL_DEFINITION_BUDGET;
    else process.env.MS365_MCP_TOOL_DEFINITION_BUDGET = before;
  }
}

async function measure(options: { all?: boolean; pattern?: string }): Promise<ToolSize[]> {
  const enabledTools = options.pattern
    ? options.pattern
    : options.all
      ? undefined
      : parseEnabledToolsFileContent(
          readFileSync(new URL('../docs/enabled-tools.local.txt', import.meta.url), 'utf8')
        );
  const server = new McpServer({ name: 'size', version: '0.0.0' });
  const graph = {
    graphRequest: async () => ({ content: [] }),
    serialize: JSON.stringify,
  } as unknown as GraphClient;
  registerGraphTools(server, graph, {
    orgMode: true,
    appViews: true,
    httpMode: true,
    enabledTools,
  });
  const client = new Client({ name: 'c', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  const { tools } = await client.listTools();
  return tools
    .map((t) => {
      const chars = JSON.stringify(t).length;
      return {
        name: t.name,
        chars,
        tokens: Math.round((chars / 4) * TOKEN_CALIBRATION),
        descriptionChars: (t.description ?? '').length,
        schemaChars: JSON.stringify(t.inputSchema).length,
      };
    })
    .sort((x, y) => y.chars - x.chars);
}

async function main(): Promise<void> {
  const all = process.argv.includes('--all');
  const after = await measureTools({ all });
  const total = after.reduce((sum, t) => sum + t.tokens, 0);
  if (process.argv.includes('--markdown')) {
    const before = new Map((await measureTools({ all, compact: false })).map((t) => [t.name, t]));
    const beforeTotal = [...before.values()].reduce((sum, t) => sum + t.tokens, 0);
    console.log('| Tool | Before (tokens) | After (tokens) |');
    console.log('| --- | ---: | ---: |');
    for (const t of after)
      console.log(`| ${t.name} | ${before.get(t.name)?.tokens ?? ''} | ${t.tokens} |`);
    console.log(`| **Total (${after.length} tools)** | **${beforeTotal}** | **${total}** |`);
    return;
  }
  for (const t of after) {
    console.log(
      `${String(t.tokens).padStart(6)} tok  ${String(t.descriptionChars).padStart(6)} desc  ${String(t.schemaChars).padStart(6)} schema  ${t.name}`
    );
  }
  console.log(
    `${String(total).padStart(6)} tok  total for ${after.length} tools (avg ${Math.round(total / after.length)})`
  );
}

if (process.argv[1] && /tools-size/.test(process.argv[1])) {
  main().catch((e) => {
    console.error(e);
    process.exitCode = 1;
  });
}
