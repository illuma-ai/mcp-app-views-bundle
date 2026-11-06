import { useCallback, useContext } from 'react';
import { useToastContext } from '@librechat/client';
import { apiBaseUrl, request } from 'librechat-data-provider';
import type { MCPAppAction } from '~/hooks/MCP/approval';
import { useMCPAppsHost } from '~/Providers/MCPAppsPolicyContext';
import { ChatContext } from '~/Providers/ChatContext';
import { useLocalize } from '~/hooks';

/** What the server decided for one app-initiated tool call. */
export type AppToolVerdict = 'deny' | 'allow' | 'ask';

type RequestAction = (action: MCPAppAction, signal: AbortSignal) => Promise<boolean>;

/** A verdict request that did not get an answer (network fault, non-2xx); distinct from a real `ask`. */
const VERDICT_FAULT = 'fault';

/** Pause before the single retry of a faulted verdict request (ms); long enough for a token refresh. */
export const VERDICT_RETRY_DELAY_MS = 400;

type VerdictFetch = typeof request.authenticatedFetch;

/** Injectable transport for tests. */
export interface FetchAppToolVerdictDependencies {
  fetch?: VerdictFetch;
  delay?: (ms: number, signal: AbortSignal) => Promise<void>;
}

function defaultDelay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

async function requestVerdict(
  body: { serverName: string; toolName: string; agentId?: string },
  signal: AbortSignal,
  fetch: VerdictFetch,
): Promise<AppToolVerdict | typeof VERDICT_FAULT> {
  try {
    const response = await fetch(`${apiBaseUrl()}/api/mcp/app-tool-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, verdictOnly: true }),
      signal,
    });
    if (!response.ok) return VERDICT_FAULT;
    const { verdict } = (await response.json()) as { verdict?: unknown };
    return verdict === 'allow' || verdict === 'deny' ? verdict : 'ask';
  } catch {
    return VERDICT_FAULT;
  }
}

/**
 * Asks the server (the single owner of the approval policy) for a verdict. A request that
 * gets no answer (a network fault or a non-2xx, e.g. during a token refresh right after the
 * page loaded) is retried once after a short pause; a second fault means ask, so a transient
 * failure never lets a call through, and only rarely shows the dialog for an allowed tool.
 */
export async function fetchAppToolVerdict(
  serverName: string,
  toolName: string,
  agentId: string | undefined,
  signal: AbortSignal,
  {
    fetch = request.authenticatedFetch,
    delay = defaultDelay,
  }: FetchAppToolVerdictDependencies = {},
): Promise<AppToolVerdict> {
  const body = { serverName, toolName, agentId };
  const first = await requestVerdict(body, signal, fetch);
  if (first !== VERDICT_FAULT || signal.aborted) return first === VERDICT_FAULT ? 'ask' : first;
  await delay(VERDICT_RETRY_DELAY_MS, signal);
  if (signal.aborted) return 'ask';
  const second = await requestVerdict(body, signal, fetch);
  return second === VERDICT_FAULT ? 'ask' : second;
}

export interface AppToolApprovalPreflightOptions {
  enabled: boolean;
  agentId?: string;
  requestAction: RequestAction;
  getVerdict?: typeof fetchAppToolVerdict;
  onDenied?: () => void;
}

/**
 * Wraps the host's approval request: a tool call the server auto-allows runs without the
 * dialog, a denied one is blocked without it, everything else (and every message action)
 * keeps the dialog. Disabled, it returns the original request unchanged.
 */
export function createAppToolApprovalPreflight({
  enabled,
  agentId,
  requestAction,
  getVerdict = fetchAppToolVerdict,
  onDenied,
}: AppToolApprovalPreflightOptions): RequestAction {
  if (!enabled) return requestAction;
  return async (action, signal) => {
    if (action.kind !== 'tool' || signal.aborted) return requestAction(action, signal);
    const verdict = await getVerdict(action.serverName, action.toolName, agentId, signal);
    if (signal.aborted) return false;
    if (verdict === 'allow') return true;
    if (verdict === 'deny') {
      onDenied?.();
      return false;
    }
    return requestAction(action, signal);
  };
}

/** Hook form: reads the published flag and the conversation's active agent. */
export default function useMCPAppToolApproval(requestAction: RequestAction): RequestAction {
  const { policy } = useMCPAppsHost();
  const localize = useLocalize();
  const { showToast } = useToastContext();
  const agentId = useContext(ChatContext)?.conversation?.agent_id ?? undefined;
  const onDenied = useCallback(
    () => showToast({ message: localize('com_ui_mcp_app_tool_denied'), status: 'error' }),
    [localize, showToast],
  );
  return createAppToolApprovalPreflight({
    enabled: policy.honorToolApproval === true,
    agentId,
    requestAction,
    onDenied,
  });
}
