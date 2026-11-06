import { ToolSearchToolDefinition } from '@librechat/agents';
import type { LCTool, LCToolRegistry } from '@librechat/agents';
import {
  TOOL_BUDGET_RATIO,
  applyToolDeferral,
  deferralNotice,
  estimateToolTokens,
} from './toolBudgetDeferral';

/** A definition whose schema alone is about `tokens` tokens. */
const mcpTool = (name: string, tokens = 2400): LCTool => ({
  name: `${name}_mcp_server`,
  description: 'does a thing',
  parameters: {
    type: 'object',
    properties: { text: { type: 'string', description: 'x'.repeat(tokens * 3) } },
  },
});
const registryOf = (tools: LCTool[]): LCToolRegistry =>
  new Map(tools.map((tool) => [tool.name, { ...tool }])) as unknown as LCToolRegistry;
const sentTokens = (tools: LCTool[]) =>
  tools.filter((t) => t.defer_loading !== true).reduce((sum, t) => sum + estimateToolTokens(t), 0);

describe('applyToolDeferral', () => {
  it('does nothing when the definitions fit', () => {
    const tools = [mcpTool('a', 500), mcpTool('b', 500)];
    const result = applyToolDeferral({
      toolDefinitions: tools,
      contextTokens: 129200,
      deferredToolsEnabled: true,
    });
    expect(result.deferred).toBe(0);
    expect(tools.some((t) => t.defer_loading)).toBe(false);
  });

  it('keeps a window with 64 tools (more than the whole window of schema text) usable', () => {
    const contextTokens = 129200;
    const tools = Array.from({ length: 64 }, (_, i) => mcpTool(`t${i}`));
    expect(sentTokens(tools)).toBeGreaterThan(contextTokens);
    const registry = registryOf(tools);

    const result = applyToolDeferral({
      toolDefinitions: tools,
      toolRegistry: registry,
      contextTokens,
      deferredToolsEnabled: true,
    });

    expect(result.deferred).toBeGreaterThan(0);
    expect(result.tokensAfter).toBeLessThanOrEqual(
      Math.floor(contextTokens * TOOL_BUDGET_RATIO) +
        estimateToolTokens(ToolSearchToolDefinition as never),
    );
    expect(sentTokens(tools)).toBeLessThan(contextTokens * 0.5);
    expect(tools.some((t) => t.name === ToolSearchToolDefinition.name)).toBe(true);
    expect(registry.get(ToolSearchToolDefinition.name)).toBeDefined();
    expect(result.notice).toBe(deferralNotice(result.deferred));
    expect(result.notice).toContain(`${result.deferred} more tools`);
  });

  it('keeps explicitly attached tools first, then recently used ones', () => {
    const contextTokens = 50000;
    const tools = Array.from({ length: 12 }, (_, i) => mcpTool(`t${i}`));
    applyToolDeferral({
      toolDefinitions: tools,
      contextTokens,
      deferredToolsEnabled: true,
      explicitToolNames: ['t11_mcp_server'],
      recentToolNames: ['t7_mcp_server', 't3_mcp_server'],
    });
    const kept = (n: number) =>
      tools.find((t) => t.name === `t${n}_mcp_server`)?.defer_loading !== true;
    expect(kept(11)).toBe(true);
    expect(kept(7)).toBe(true);
    expect(kept(3)).toBe(true);
    expect(kept(0)).toBe(true);
    expect(kept(10)).toBe(false);
  });

  it('never defers a tool that is not an MCP tool', () => {
    const own: LCTool = {
      name: 'execute_code',
      description: 'run',
      parameters: { type: 'object' },
    };
    const tools = [own, ...Array.from({ length: 20 }, (_, i) => mcpTool(`t${i}`))];
    applyToolDeferral({ toolDefinitions: tools, contextTokens: 40000, deferredToolsEnabled: true });
    expect(own.defer_loading).not.toBe(true);
  });

  it('does nothing when the deferred-tools capability is off', () => {
    const tools = Array.from({ length: 64 }, (_, i) => mcpTool(`t${i}`));
    const result = applyToolDeferral({
      toolDefinitions: tools,
      contextTokens: 129200,
      deferredToolsEnabled: false,
    });
    expect(result.deferred).toBe(0);
  });
});
