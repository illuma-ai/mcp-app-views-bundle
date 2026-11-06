/**
 * Last resort for a run that still overflows the model's context after the agent runtime's own
 * recovery (summarise and retry, at most twice).
 *
 * Tool results are by far the largest items in a long history, and the model can simply ask for
 * them again. So when the run fails with a context overflow, the largest tool results in the
 * prompt are replaced with a one-line stub and the run is retried, up to
 * {@link LAST_RESORT_MAX_ATTEMPTS} more times. Together with the runtime's two attempts the run
 * gets four tries before the person ever sees an error.
 */

/** Extra attempts made here; the runtime's own two make four in total. */
export const LAST_RESORT_MAX_ATTEMPTS = 2;

/** Results at or below this many characters are not worth stubbing: the stub would not be smaller. */
export const MIN_STUBBABLE_CHARS = 400;

/** Token count recorded for a replaced result (the stub is one short line). */
const STUB_TOKEN_COUNT = 24;

/** Error `type` values the runtime throws for an overflow it could not recover from. */
const OVERFLOW_ERROR_TYPES = new Set(['final_context_overflow', 'empty_messages', 'input_length']);

/** Provider wording for "the prompt is too long", for errors that arrive as plain provider text. */
const OVERFLOW_TEXT =
  /context[ _]length|context window|maximum context|prompt is too long|input is too long|too many tokens|exceeds? the (?:context|maximum|max)|reduce the length of the messages/i;

/** Text that replaces a removed tool result. */
export function toolResultStub(chars: number): string {
  return `result removed: ${chars} chars, re-run the tool with a narrower query`;
}

/** A prompt message as far as this module cares: tool results carry `tool_call_id`. */
export interface PromptMessage {
  content: unknown;
  tool_call_id?: unknown;
  getType?: () => string;
  _getType?: () => string;
  type?: unknown;
}

/** Whether the failure is a context overflow the runtime gave up on. Never throws. */
export function isContextOverflowFailure(error: unknown): boolean {
  if (error == null || typeof error !== 'object') {
    return false;
  }
  let name = '';
  let message = '';
  try {
    name = String((error as { name?: unknown }).name ?? '');
    message = String((error as { message?: unknown }).message ?? '');
  } catch {
    return false;
  }
  if (name === 'ContextOverflowError') {
    return true;
  }
  try {
    const parsed = JSON.parse(message) as { type?: unknown };
    if (typeof parsed?.type === 'string' && OVERFLOW_ERROR_TYPES.has(parsed.type)) {
      return true;
    }
  } catch {
    /* plain text */
  }
  return OVERFLOW_TEXT.test(message);
}

function isToolMessage(message: PromptMessage): boolean {
  try {
    const kind = message.getType?.() ?? message._getType?.() ?? message.type;
    return kind === 'tool' || (kind == null && message.tool_call_id != null);
  } catch {
    return message.tool_call_id != null;
  }
}

/** Characters of text a message's content carries. */
function contentChars(content: unknown): number {
  if (typeof content === 'string') {
    return content.length;
  }
  if (!Array.isArray(content)) {
    return 0;
  }
  return content.reduce((total: number, part: unknown) => {
    if (typeof part === 'string') {
      return total + part.length;
    }
    const text = (part as { text?: unknown } | null)?.text;
    return total + (typeof text === 'string' ? text.length : 0);
  }, 0);
}

export interface StubbedResult {
  /** Index in the prompt. */
  index: number;
  /** Characters the removed result held. */
  chars: number;
}

function stubbable(messages: PromptMessage[]): StubbedResult[] {
  const candidates: StubbedResult[] = [];
  messages.forEach((message, index) => {
    if (!isToolMessage(message)) return;
    const chars = contentChars(message.content);
    if (chars > MIN_STUBBABLE_CHARS) {
      candidates.push({ index, chars });
    }
  });
  return candidates.sort((a, b) => b.chars - a.chars);
}

/**
 * Replaces the largest tool results with a stub, in place.
 *
 * @param messages - The prompt; tool messages are edited in place.
 * @param count - How many of the largest results to replace.
 * @returns What was replaced, largest first; empty when no result is large enough to matter.
 */
export function stubLargestToolResults(messages: PromptMessage[], count: number): StubbedResult[] {
  const chosen = stubbable(messages).slice(0, Math.max(0, count));
  for (const { index, chars } of chosen) {
    messages[index].content = toolResultStub(chars);
  }
  return chosen;
}

export interface LastResortOptions<M extends PromptMessage> {
  /** Runs the agent over the prompt. */
  run: (messages: M[]) => Promise<void>;
  /** The prompt; edited in place between attempts. */
  messages: M[];
  /** Per-message token counts the run uses for pruning; entries of replaced results are lowered. */
  indexTokenCountMap?: Record<string, number | undefined>;
  /** Called before each extra attempt, for logging. */
  onAttempt?: (attempt: number, stubbed: StubbedResult[]) => void;
}

/**
 * Runs the agent; on a context overflow, replaces the largest tool results with a stub and runs
 * again, at most {@link LAST_RESORT_MAX_ATTEMPTS} more times. Attempt 1 replaces the largest result,
 * attempt 2 the larger half of those left. Any other failure, and the overflow after the last
 * attempt, is thrown as it was, so the person sees an error only when nothing more can be done.
 */
export async function runWithContextOverflowLastResort<M extends PromptMessage>({
  run,
  messages,
  indexTokenCountMap,
  onAttempt,
}: LastResortOptions<M>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= LAST_RESORT_MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) {
      const count = attempt === 1 ? 1 : Math.max(1, Math.ceil(stubbable(messages).length / 2));
      const stubbed = stubLargestToolResults(messages, count);
      if (stubbed.length === 0) {
        throw lastError;
      }
      if (indexTokenCountMap != null) {
        for (const { index } of stubbed) {
          if (indexTokenCountMap[String(index)] != null) {
            indexTokenCountMap[String(index)] = STUB_TOKEN_COUNT;
          }
        }
      }
      onAttempt?.(attempt, stubbed);
    }
    try {
      return await run(messages);
    } catch (error) {
      if (!isContextOverflowFailure(error)) {
        throw error;
      }
      lastError = error;
    }
  }
  throw lastError;
}
