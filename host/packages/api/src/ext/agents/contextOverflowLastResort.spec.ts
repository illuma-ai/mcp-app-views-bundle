import type { PromptMessage } from './contextOverflowLastResort';
import {
  LAST_RESORT_MAX_ATTEMPTS,
  isContextOverflowFailure,
  runWithContextOverflowLastResort,
  stubLargestToolResults,
  toolResultStub,
} from './contextOverflowLastResort';

const tool = (chars: number, id: string): PromptMessage => ({
  type: 'tool',
  tool_call_id: id,
  content: 'x'.repeat(chars),
});
const human = (text: string): PromptMessage => ({ type: 'human', content: text });
const overflow = () =>
  Object.assign(new Error(JSON.stringify({ type: 'final_context_overflow' })), {
    name: 'ContextOverflowError',
  });

describe('isContextOverflowFailure', () => {
  it.each([
    [overflow()],
    [new Error(JSON.stringify({ type: 'empty_messages', info: 'x' }))],
    [new Error(JSON.stringify({ type: 'input_length', info: '10/5' }))],
    [new Error("This model's maximum context length is 8192 tokens")],
    [new Error('prompt is too long: 250000 tokens > 200000 maximum')],
  ])('recognises %p', (error) => {
    expect(isContextOverflowFailure(error)).toBe(true);
  });

  it.each([[new Error('rate limited')], [new Error('{"type":"moderation"}')], [null], ['text']])(
    'ignores %p',
    (error) => {
      expect(isContextOverflowFailure(error)).toBe(false);
    },
  );
});

describe('stubLargestToolResults', () => {
  it('replaces the largest results with the stub text and leaves the rest', () => {
    const messages = [human('hi'), tool(5000, 'a'), tool(9000, 'b'), tool(100, 'c')];
    const stubbed = stubLargestToolResults(messages, 1);
    expect(stubbed).toEqual([{ index: 2, chars: 9000 }]);
    expect(messages[2].content).toBe(
      'result removed: 9000 chars, re-run the tool with a narrower query',
    );
    expect((messages[1].content as string).length).toBe(5000);
    expect((messages[3].content as string).length).toBe(100);
  });

  it('does nothing when no result is large enough to matter', () => {
    expect(stubLargestToolResults([tool(100, 'a')], 3)).toEqual([]);
  });
});

describe('runWithContextOverflowLastResort', () => {
  it('recovers after dropping the largest tool result when recovery had failed', async () => {
    const messages = [human('q'), tool(5000, 'a'), tool(90000, 'b')];
    const seen: number[] = [];
    const run = jest.fn(async (prompt: PromptMessage[]) => {
      seen.push((prompt[2].content as string).length);
      if (run.mock.calls.length === 1) throw overflow();
    });

    await runWithContextOverflowLastResort({ run, messages });

    expect(run).toHaveBeenCalledTimes(2);
    expect(seen[0]).toBe(90000);
    expect(messages[2].content).toBe(toolResultStub(90000));
    expect((messages[1].content as string).length).toBe(5000);
  });

  it('keeps dropping on the next attempt and succeeds on the last one', async () => {
    const messages = [tool(5000, 'a'), tool(6000, 'b'), tool(90000, 'c')];
    const run = jest.fn(async () => {
      if (run.mock.calls.length <= LAST_RESORT_MAX_ATTEMPTS) throw overflow();
    });
    await runWithContextOverflowLastResort({ run, messages });
    expect(run).toHaveBeenCalledTimes(LAST_RESORT_MAX_ATTEMPTS + 1);
    // Attempt 1 dropped the largest result, attempt 2 the larger of the two left.
    expect(messages[2].content).toBe(toolResultStub(90000));
    expect(messages[1].content).toBe(toolResultStub(6000));
    expect((messages[0].content as string).length).toBe(5000);
  });

  it('shows the error only after the last attempt', async () => {
    const messages = [tool(5000, 'a'), tool(6000, 'b'), tool(90000, 'c'), tool(7000, 'd')];
    const failure = overflow();
    const run = jest.fn(async () => {
      throw failure;
    });
    await expect(runWithContextOverflowLastResort({ run, messages })).rejects.toBe(failure);
    expect(run).toHaveBeenCalledTimes(LAST_RESORT_MAX_ATTEMPTS + 1);
  });

  it('throws at once when there is nothing left to drop', async () => {
    const failure = overflow();
    const run = jest.fn(async () => {
      throw failure;
    });
    await expect(
      runWithContextOverflowLastResort({ run, messages: [human('q'), tool(50, 'a')] }),
    ).rejects.toBe(failure);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('does not retry an unrelated failure', async () => {
    const run = jest.fn(async () => {
      throw new Error('rate limited');
    });
    await expect(
      runWithContextOverflowLastResort({ run, messages: [tool(5000, 'a')] }),
    ).rejects.toThrow('rate limited');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('lowers the token count of a replaced result', async () => {
    const messages = [tool(5000, 'a')];
    const indexTokenCountMap: Record<string, number | undefined> = { '0': 1500 };
    const run = jest.fn(async () => {
      if (run.mock.calls.length === 1) throw overflow();
    });
    await runWithContextOverflowLastResort({ run, messages, indexTokenCountMap });
    expect(indexTokenCountMap['0']).toBeLessThan(100);
  });
});
