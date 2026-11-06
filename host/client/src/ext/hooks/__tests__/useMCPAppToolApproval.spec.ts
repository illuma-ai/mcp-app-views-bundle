import type { MCPAppAction } from '~/hooks/MCP/approval';
import { createAppToolApprovalPreflight, fetchAppToolVerdict } from '../useMCPAppToolApproval';

jest.mock('librechat-data-provider', () => ({
  ...jest.requireActual('librechat-data-provider'),
  apiBaseUrl: () => '',
}));

const tool: MCPAppAction = {
  kind: 'tool',
  serverName: 'm365',
  toolName: 'list-mail',
  argumentsText: '{}',
};
const message: MCPAppAction = { kind: 'message', serverName: 'm365', text: 'hi' };
const signal = () => new AbortController().signal;

describe('createAppToolApprovalPreflight', () => {
  it('returns the original request untouched when the flag is off', () => {
    const requestAction = jest.fn().mockResolvedValue(true);
    const getVerdict = jest.fn();
    const wrapped = createAppToolApprovalPreflight({ enabled: false, requestAction, getVerdict });
    expect(wrapped).toBe(requestAction);
    expect(getVerdict).not.toHaveBeenCalled();
  });

  it('skips the dialog when the server allows the tool', async () => {
    const requestAction = jest.fn().mockResolvedValue(false);
    const getVerdict = jest.fn().mockResolvedValue('allow');
    const wrapped = createAppToolApprovalPreflight({
      enabled: true,
      agentId: 'agent_1',
      requestAction,
      getVerdict,
    });
    await expect(wrapped(tool, signal())).resolves.toBe(true);
    expect(getVerdict).toHaveBeenCalledWith('m365', 'list-mail', 'agent_1', expect.anything());
    expect(requestAction).not.toHaveBeenCalled();
  });

  it('shows the dialog when the verdict is ask and returns the user decision', async () => {
    const requestAction = jest.fn().mockResolvedValue(true);
    const wrapped = createAppToolApprovalPreflight({
      enabled: true,
      requestAction,
      getVerdict: jest.fn().mockResolvedValue('ask'),
    });
    await expect(wrapped(tool, signal())).resolves.toBe(true);
    expect(requestAction).toHaveBeenCalledTimes(1);
  });

  it('blocks a denied tool without the dialog and reports it', async () => {
    const requestAction = jest.fn();
    const onDenied = jest.fn();
    const wrapped = createAppToolApprovalPreflight({
      enabled: true,
      requestAction,
      onDenied,
      getVerdict: jest.fn().mockResolvedValue('deny'),
    });
    await expect(wrapped(tool, signal())).resolves.toBe(false);
    expect(onDenied).toHaveBeenCalled();
    expect(requestAction).not.toHaveBeenCalled();
  });

  it('keeps the dialog for app messages without asking the server', async () => {
    const requestAction = jest.fn().mockResolvedValue(true);
    const getVerdict = jest.fn().mockResolvedValue('allow');
    const wrapped = createAppToolApprovalPreflight({ enabled: true, requestAction, getVerdict });
    await expect(wrapped(message, signal())).resolves.toBe(true);
    expect(getVerdict).not.toHaveBeenCalled();
    expect(requestAction).toHaveBeenCalledWith(message, expect.anything());
  });

  it('does not allow after the request was aborted while asking', async () => {
    const controller = new AbortController();
    const wrapped = createAppToolApprovalPreflight({
      enabled: true,
      requestAction: jest.fn(),
      getVerdict: jest.fn(async () => {
        controller.abort();
        return 'allow' as const;
      }),
    });
    await expect(wrapped(tool, controller.signal)).resolves.toBe(false);
  });
});

describe('fetchAppToolVerdict', () => {
  const ok = (verdict: string) =>
    ({ ok: true, json: async () => ({ verdict }) }) as unknown as Response;
  const failed = { ok: false, json: async () => ({}) } as unknown as Response;
  const noDelay = jest.fn(async () => undefined);
  const call = (fetch: jest.Mock, signal = new AbortController().signal) =>
    fetchAppToolVerdict('ado', 'wit_work_item', 'agent_1', signal, {
      fetch: fetch as never,
      delay: noDelay,
    });

  beforeEach(() => noDelay.mockClear());

  it('returns the server verdict on the first answer without retrying', async () => {
    const fetch = jest.fn().mockResolvedValue(ok('allow'));
    await expect(call(fetch)).resolves.toBe('allow');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(noDelay).not.toHaveBeenCalled();
    const body = JSON.parse(fetch.mock.calls[0][1].body);
    expect(body).toEqual({
      serverName: 'ado',
      toolName: 'wit_work_item',
      agentId: 'agent_1',
      verdictOnly: true,
    });
  });

  it('retries once after a failed response and uses the second answer', async () => {
    const fetch = jest.fn().mockResolvedValueOnce(failed).mockResolvedValueOnce(ok('allow'));
    await expect(call(fetch)).resolves.toBe('allow');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(noDelay).toHaveBeenCalledTimes(1);
  });

  it('retries once after a network fault', async () => {
    const fetch = jest
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok('deny'));
    await expect(call(fetch)).resolves.toBe('deny');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('falls back to ask when both attempts fail', async () => {
    const fetch = jest.fn().mockResolvedValue(failed);
    await expect(call(fetch)).resolves.toBe('ask');
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry an aborted request', async () => {
    const controller = new AbortController();
    const fetch = jest.fn(async () => {
      controller.abort();
      throw new DOMException('aborted', 'AbortError');
    });
    await expect(call(fetch, controller.signal)).resolves.toBe('ask');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(noDelay).not.toHaveBeenCalled();
  });

  it('treats an unknown verdict as ask without retrying', async () => {
    const fetch = jest.fn().mockResolvedValue(ok('maybe'));
    await expect(call(fetch)).resolves.toBe('ask');
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
