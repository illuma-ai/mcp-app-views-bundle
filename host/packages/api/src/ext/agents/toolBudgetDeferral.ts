import { Constants } from 'librechat-data-provider';
import { ToolSearchToolDefinition } from '@librechat/agents';
import type { LCTool, LCToolRegistry } from '@librechat/agents';
import { sanitizeGeminiSchema } from '~/mcp/zod';

/**
 * Keeps tool definitions from crowding out the conversation.
 *
 * Every tool the model may call is sent with each request. A deployment with many connected
 * servers can send more tool text than the model's whole context window, and then no message fits
 * and the turn fails before it starts. Compacting the conversation cannot help: the tool text is
 * not part of it.
 *
 * When the definitions would take more than {@link TOOL_BUDGET_RATIO} of the window, the MCP tools
 * beyond that budget are marked deferred (`defer_loading`). A deferred tool is not sent; the model
 * finds it with the tool search tool and it is loaded on demand. Tools the agent or person attached
 * explicitly stay first, then the most recently used, then the rest in their original order.
 */

/** Share of the context window the tool definitions may take before deferral starts. */
export const TOOL_BUDGET_RATIO = 0.4;

/** Characters per token used to estimate a definition (JSON schema text is token-dense). */
const CHARS_PER_TOKEN = 3.5;

/** One system line telling the model that unlisted tools exist and how to get them. */
export function deferralNotice(deferred: number): string {
  return `${deferred} more tools are available on demand: call ${ToolSearchToolDefinition.name} to find and load a tool that is not listed.`;
}

/** Estimated tokens a tool definition adds to every request. */
export function estimateToolTokens(
  tool: Pick<LCTool, 'name' | 'description' | 'parameters'>,
): number {
  const text = JSON.stringify({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  });
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

const isMcpTool = (name: string): boolean => name.includes(Constants.mcp_delimiter);

export interface ToolDeferralParams {
  toolDefinitions: LCTool[];
  toolRegistry?: LCToolRegistry;
  /** Context tokens available to the request, before the reply is reserved. */
  contextTokens: number;
  /** Whether the deferred-tools capability is on; without it nothing is deferred. */
  deferredToolsEnabled: boolean;
  /** Tools the agent or person attached by name; kept before any others. */
  explicitToolNames?: readonly string[];
  /** Tools used before, most recent first; kept before tools never used. */
  recentToolNames?: readonly string[];
  provider?: string;
}

export interface ToolDeferralResult {
  /** MCP tools newly deferred. */
  deferred: number;
  /** Estimated tokens of all definitions sent, before and after. */
  tokensBefore: number;
  tokensAfter: number;
  /** One line for the model, present when anything was deferred. */
  notice?: string;
}

/**
 * Defers MCP tools beyond the budget, in place, and makes sure the tool search tool is present so
 * the model can load them. Does nothing when the definitions already fit.
 */
export function applyToolDeferral({
  toolDefinitions,
  toolRegistry,
  contextTokens,
  deferredToolsEnabled,
  explicitToolNames = [],
  recentToolNames = [],
  provider,
}: ToolDeferralParams): ToolDeferralResult {
  const sent = toolDefinitions.filter((tool) => tool.defer_loading !== true);
  const tokensBefore = sent.reduce((sum, tool) => sum + estimateToolTokens(tool), 0);
  const budget = Math.floor(contextTokens * TOOL_BUDGET_RATIO);
  if (!deferredToolsEnabled || contextTokens <= 0 || tokensBefore <= budget) {
    return { deferred: 0, tokensBefore, tokensAfter: tokensBefore };
  }

  const explicit = new Set(explicitToolNames);
  const recency = new Map(recentToolNames.map((name, index) => [name, index]));
  const rank = (name: string): number =>
    explicit.has(name) ? -1 : (recency.get(name) ?? Number.MAX_SAFE_INTEGER);

  /** Tools that are never deferred (not MCP) use the budget first. */
  let used = sent
    .filter((tool) => !isMcpTool(tool.name))
    .reduce((sum, tool) => sum + estimateToolTokens(tool), 0);
  const candidates = sent
    .map((tool, order) => ({ tool, order }))
    .filter(({ tool }) => isMcpTool(tool.name))
    .sort((a, b) => rank(a.tool.name) - rank(b.tool.name) || a.order - b.order);

  let deferred = 0;
  for (const { tool } of candidates) {
    const cost = estimateToolTokens(tool);
    if (used + cost <= budget) {
      used += cost;
      continue;
    }
    tool.defer_loading = true;
    const entry = toolRegistry?.get(tool.name);
    if (entry != null) {
      entry.defer_loading = true;
    }
    deferred++;
  }
  if (deferred === 0) {
    return { deferred, tokensBefore, tokensAfter: tokensBefore };
  }

  if (!toolDefinitions.some((tool) => tool.name === ToolSearchToolDefinition.name)) {
    const isGoogle = provider === 'google' || provider === 'vertexai';
    toolDefinitions.push({
      name: ToolSearchToolDefinition.name,
      description: ToolSearchToolDefinition.description,
      parameters: (isGoogle
        ? sanitizeGeminiSchema(ToolSearchToolDefinition.schema as Record<string, unknown>)
        : ToolSearchToolDefinition.schema) as unknown as LCTool['parameters'],
    });
    toolRegistry?.set(ToolSearchToolDefinition.name, {
      name: ToolSearchToolDefinition.name,
      allowed_callers: ['direct'],
    });
  }

  const after = toolDefinitions
    .filter((tool) => tool.defer_loading !== true)
    .reduce((sum, tool) => sum + estimateToolTokens(tool), 0);
  return { deferred, tokensBefore, tokensAfter: after, notice: deferralNotice(deferred) };
}
