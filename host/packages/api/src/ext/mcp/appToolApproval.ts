import { Constants } from 'librechat-data-provider';
import type { AgentToolOptions, TToolApprovalPolicy } from 'librechat-data-provider';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { isHITLEnabled, isToolDeniedByApprovalPolicy } from '~/agents/hitl/policy';

/**
 * Whether an app-initiated (MCP App View) tool call may skip the host's confirmation dialog.
 * - `deny`: an administrator deny rule matches; the call is blocked, no dialog.
 * - `allow`: an administrator allow rule matches, or the active agent holds the tool in
 *   Always-approve mode and no administrator ask rule matches.
 * - `ask`: everything else; the host keeps its dialog.
 */
export type AppToolApprovalVerdict = 'deny' | 'allow' | 'ask';

/** Message returned when an administrator rule blocks an app-initiated call. */
export const APP_TOOL_DENIED_MESSAGE =
  'This tool is blocked by the administrator tool-approval policy and cannot be run from an app.';

/** Anchored glob match, identical to the agent runtime's tool-policy semantics. */
function matchesAny(patterns: readonly string[] | undefined, name: string): boolean {
  return (
    patterns?.some((pattern) => {
      const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp('^' + escaped.replace(/\*/g, '.*') + '$').test(name);
    }) === true
  );
}

/**
 * Every spelling an administrator may have written a rule against: the combined key
 * (`tool_mcp_server`) the runtime uses, and the bare tool name.
 */
function toolSpellings(serverName: string, toolName: string): string[] {
  return [`${toolName}${Constants.mcp_delimiter}${serverName}`, toolName];
}

export interface EvaluateAppToolApprovalInput {
  /** `endpoints.agents.toolApproval`. */
  policy: TToolApprovalPolicy | undefined;
  serverName: string;
  toolName: string;
  /** The conversation's active agent `tool_options`, when it is known and viewable. */
  agentToolOptions?: AgentToolOptions;
}

/**
 * Single decision point for app-initiated tool calls. Reuses the agent runtime's policy
 * predicates; deny wins, then an ask rule, then allow (administrator, then agent mode).
 */
export function evaluateAppToolApproval({
  policy,
  serverName,
  toolName,
  agentToolOptions,
}: EvaluateAppToolApprovalInput): AppToolApprovalVerdict {
  if (!isHITLEnabled(policy)) {
    return 'ask';
  }
  const names = toolSpellings(serverName, toolName);
  if (names.some((name) => isToolDeniedByApprovalPolicy(policy, name))) {
    return 'deny';
  }
  if (names.some((name) => matchesAny(policy.ask, name))) {
    return 'ask';
  }
  if (matchesAny(policy.allow, names[0])) {
    return 'allow';
  }
  // Agent modes only apply when the administrator turned them on.
  if (policy.agentModes === true && agentToolOptions?.[names[0]]?.approval_mode === 'allow') {
    return 'allow';
  }
  return 'ask';
}

interface GateBody {
  serverName?: unknown;
  toolName?: unknown;
  agentId?: unknown;
  verdictOnly?: unknown;
}

interface GateRequest {
  user?: { id?: string; role?: string };
  body?: GateBody;
  config?: {
    mcpSettings?: { appsHonorToolApproval?: boolean };
    endpoints?: { agents?: { toolApproval?: TToolApprovalPolicy } };
  };
}

export interface AppToolApprovalGateDependencies {
  /** Returns `tool_options` of an agent the user may view, else undefined. */
  getAgentToolOptions?: (
    agentId: string,
    user: { id: string; role?: string },
  ) => Promise<AgentToolOptions | undefined>;
}

/**
 * Wraps the app tool-call handler. Flag off: passes straight through. Flag on:
 * - `verdictOnly` bodies answer `{ verdict }` without calling the tool (the client asks
 *   before it shows its dialog);
 * - a call whose tool an administrator denies is rejected here, whatever the client did.
 */
export function createAppToolApprovalGate(
  dependencies: AppToolApprovalGateDependencies,
): (proceed: RequestHandler) => RequestHandler {
  return (proceed) => async (baseRequest: Request, response: Response, next: NextFunction) => {
    const request = baseRequest as unknown as GateRequest;
    if (request.config?.mcpSettings?.appsHonorToolApproval !== true) {
      return proceed(baseRequest, response, next);
    }
    const user = request.user;
    const body = request.body ?? {};
    if (!user?.id) {
      response.status(401).json({ error: 'Unauthorized' });
      return;
    }
    if (typeof body.serverName !== 'string' || typeof body.toolName !== 'string') {
      return proceed(baseRequest, response, next);
    }
    const policy = request.config?.endpoints?.agents?.toolApproval;
    const input = { policy, serverName: body.serverName, toolName: body.toolName };
    try {
      let verdict = evaluateAppToolApproval(input);
      if (body.verdictOnly === true) {
        if (verdict === 'ask' && typeof body.agentId === 'string' && body.agentId) {
          const agentToolOptions = await dependencies.getAgentToolOptions?.(body.agentId, {
            id: user.id,
            role: user.role,
          });
          verdict = evaluateAppToolApproval({ ...input, agentToolOptions });
        }
        response.json({ verdict });
        return;
      }
      if (verdict === 'deny') {
        response.status(403).json({ error: APP_TOOL_DENIED_MESSAGE });
        return;
      }
    } catch {
      // Fail safe: an evaluation fault never skips the dialog; the call proceeds as before.
      if (body.verdictOnly === true) {
        response.json({ verdict: 'ask' });
        return;
      }
    }
    return proceed(baseRequest, response, next);
  };
}
