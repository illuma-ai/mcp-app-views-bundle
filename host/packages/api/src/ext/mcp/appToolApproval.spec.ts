import { EventEmitter } from 'events';
import type { AgentToolOptions, TToolApprovalPolicy } from 'librechat-data-provider';
import type { RequestHandler, Response } from 'express';
import type { MCPAppsControllerDependencies } from '~/mcp/apps/controller';
import {
  APP_TOOL_DENIED_MESSAGE,
  createAppToolApprovalGate,
  evaluateAppToolApproval,
} from './appToolApproval';
import { createMCPAppsController } from '~/mcp/apps/controller';
import { MCPAppOperationBudget } from '~/mcp/apps/budget';

jest.mock('~/agents/auth', () => ({ getPluginAuthMap: jest.fn() }));

const policy = (overrides: Partial<TToolApprovalPolicy> = {}): TToolApprovalPolicy => ({
  enabled: true,
  mode: 'default',
  ...overrides,
});
const run = (
  p: TToolApprovalPolicy | undefined,
  agentToolOptions?: AgentToolOptions,
  toolName = 'list-mail',
) => evaluateAppToolApproval({ policy: p, serverName: 'm365', toolName, agentToolOptions });

describe('evaluateAppToolApproval', () => {
  it('asks when the policy is missing or disabled', () => {
    expect(run(undefined)).toBe('ask');
    expect(run(policy({ enabled: false, allow: ['*'] }))).toBe('ask');
  });

  it('denies on an admin deny rule, which wins over allow and agent mode', () => {
    const p = policy({ deny: ['*_mcp_m365'], allow: ['*'], agentModes: true });
    expect(run(p, { 'list-mail_mcp_m365': { approval_mode: 'allow' } })).toBe('deny');
  });

  it('allows on an admin allow rule (glob against the combined key)', () => {
    expect(run(policy({ allow: ['list-*_mcp_m365'] }))).toBe('allow');
    expect(run(policy({ allow: ['list-*_mcp_m365'] }), undefined, 'send-mail')).toBe('ask');
  });

  it('an admin ask rule wins over an allow rule and over agent Always-approve', () => {
    const p = policy({ allow: ['*'], ask: ['list-*'], agentModes: true });
    expect(run(p, { 'list-mail_mcp_m365': { approval_mode: 'allow' } })).toBe('ask');
  });

  it('allows when the agent holds the tool in Always-approve mode', () => {
    const p = policy({ agentModes: true });
    expect(run(p, { 'list-mail_mcp_m365': { approval_mode: 'allow' } })).toBe('allow');
    expect(run(p, { 'list-mail_mcp_m365': { approval_mode: 'ask' } })).toBe('ask');
    expect(run(p, { other_mcp_m365: { approval_mode: 'allow' } })).toBe('ask');
  });

  it('ignores agent modes the administrator has not enabled', () => {
    expect(run(policy(), { 'list-mail_mcp_m365': { approval_mode: 'allow' } })).toBe('ask');
  });

  it('keeps asking for unmatched tools in default and dontAsk modes', () => {
    expect(run(policy({ mode: 'default' }))).toBe('ask');
    expect(run(policy({ mode: 'dontAsk' }))).toBe('ask');
  });
});

type Req = EventEmitter & Record<string, unknown>;
const makeRes = () => {
  const res = Object.assign(new EventEmitter(), {
    headersSent: false,
    writableEnded: false,
    destroyed: false,
    status: jest.fn(),
    json: jest.fn(),
  });
  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
};
const makeReq = (
  body: Record<string, unknown>,
  flag: boolean,
  toolApproval?: TToolApprovalPolicy,
) =>
  Object.assign(new EventEmitter(), {
    aborted: false,
    complete: true,
    destroyed: false,
    body,
    user: { id: 'u1', role: 'USER' },
    config: {
      mcpSettings: { apps: true, appsHonorToolApproval: flag },
      mcpConfig: {},
      endpoints: { agents: { toolApproval } },
    },
  }) as unknown as Req;
const call = (handler: RequestHandler, req: Req, res: ReturnType<typeof makeRes>) =>
  handler(req as never, res as unknown as Response, jest.fn());

const body = { serverName: 'm365', toolName: 'list-mail' };

describe('createAppToolApprovalGate', () => {
  it('passes straight through when the flag is off', async () => {
    const proceed = jest.fn();
    const res = makeRes();
    await call(
      createAppToolApprovalGate({})(proceed),
      makeReq(body, false, policy({ deny: ['*'] })),
      res,
    );
    expect(proceed).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it('rejects a denied tool with a clear error and never proceeds', async () => {
    const proceed = jest.fn();
    const res = makeRes();
    await call(
      createAppToolApprovalGate({})(proceed),
      makeReq(body, true, policy({ deny: ['list-*_mcp_m365'] })),
      res,
    );
    expect(proceed).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: APP_TOOL_DENIED_MESSAGE });
  });

  it('proceeds for a non-denied call', async () => {
    const proceed = jest.fn();
    await call(
      createAppToolApprovalGate({})(proceed),
      makeReq(body, true, policy({ allow: ['*'] })),
      makeRes(),
    );
    expect(proceed).toHaveBeenCalledTimes(1);
  });

  it('answers a verdict-only request without proceeding, using the agent mode', async () => {
    const proceed = jest.fn();
    const getAgentToolOptions = jest.fn(async () => ({
      'list-mail_mcp_m365': { approval_mode: 'allow' as const },
    }));
    const res = makeRes();
    await call(
      createAppToolApprovalGate({ getAgentToolOptions })(proceed),
      makeReq(
        { ...body, verdictOnly: true, agentId: 'agent_1' },
        true,
        policy({ agentModes: true }),
      ),
      res,
    );
    expect(proceed).not.toHaveBeenCalled();
    expect(getAgentToolOptions).toHaveBeenCalledWith('agent_1', { id: 'u1', role: 'USER' });
    expect(res.json).toHaveBeenCalledWith({ verdict: 'allow' });
  });

  it('falls back to ask when the agent lookup fails', async () => {
    const res = makeRes();
    await call(
      createAppToolApprovalGate({
        getAgentToolOptions: jest.fn(async () => {
          throw new Error('db down');
        }),
      })(jest.fn()),
      makeReq({ ...body, verdictOnly: true, agentId: 'a' }, true, policy({ agentModes: true })),
      res,
    );
    expect(res.json).toHaveBeenCalledWith({ verdict: 'ask' });
  });
});

describe('appToolCall route (controller)', () => {
  const callBody = { ...body, serverBinding: 'b', arguments: {} };
  const makeController = () => {
    const getOperationBudget = jest.fn(() => new MCPAppOperationBudget());
    const dependencies = {
      logger: { error: jest.fn() },
      getOperationBudget,
      getManager: jest.fn(),
    } as unknown as MCPAppsControllerDependencies;
    return { handlers: createMCPAppsController(dependencies), getOperationBudget };
  };

  it('enforces deny server-side even for a call that skipped the dialog', async () => {
    const { handlers, getOperationBudget } = makeController();
    const res = makeRes();
    await call(
      handlers.appToolCall,
      makeReq(callBody, true, policy({ deny: ['*_mcp_m365'] })),
      res,
    );
    expect(res.status).toHaveBeenCalledWith(403);
    expect(getOperationBudget).not.toHaveBeenCalled();
  });

  it('reaches the proxy when the flag is off, whatever the policy says', async () => {
    const { handlers, getOperationBudget } = makeController();
    await call(
      handlers.appToolCall,
      makeReq(callBody, false, policy({ deny: ['*_mcp_m365'] })),
      makeRes(),
    );
    expect(getOperationBudget).toHaveBeenCalled();
  });
});
