import { createToolPolicyHook } from '@librechat/agents';
import type { TToolApprovalPolicy } from 'librechat-data-provider';
import { mapToolApprovalPolicy } from '../../agents/hitl/policy';

/** Message for an inner call whose tool an administrator rule denies. */
export const INNER_CALL_DENIED_MESSAGE = 'Administrator policy blocks this tool.';
/** Message for an inner call whose tool an administrator rule asks about. */
export const INNER_CALL_NEEDS_APPROVAL_MESSAGE =
  'This tool needs approval and cannot run from code. Run it in the foreground.';

/**
 * Checks a tool call made from code (programmatic tool calling) against the administrator
 * allow/ask/deny rules. Such a call carries no tool-call id or agent identity, so the
 * foreground approval flow never saw it; without this check an administrator deny or ask rule
 * would be bypassed whenever the tool runs from a program. Deny refuses, ask refuses with a
 * "needs approval" message (there is nobody to ask mid-program), anything else proceeds.
 *
 * @param policy - Reads the current administrator policy; absent means no rules.
 * @param toolName - Combined tool key, as matched by the rules.
 * @throws When the verdict is deny or ask.
 */
export async function assertInnerCallPolicy(
  policy: (() => TToolApprovalPolicy) | undefined,
  toolName: string,
): Promise<void> {
  if (!policy) return;
  const verdict = await createToolPolicyHook(mapToolApprovalPolicy(policy()) ?? {})(
    {
      hook_event_name: 'PreToolUse',
      runId: '',
      toolName,
      toolInput: {},
      toolUseId: '',
    },
    new AbortController().signal,
  );
  if (verdict?.decision === 'deny') throw new Error(INNER_CALL_DENIED_MESSAGE);
  if (verdict?.decision === 'ask') throw new Error(INNER_CALL_NEEDS_APPROVAL_MESSAGE);
}
