import { reserveViewEvictingOldest } from './mcpAppViewEviction';

describe('reserveViewEvictingOldest', () => {
  it('opens without eviction below the limit', () => {
    const { next, evicted } = reserveViewEvictingOldest(new Set(['a', 'b']), 'c', 3);
    expect([...next]).toEqual(['a', 'b', 'c']);
    expect(evicted).toEqual([]);
  });

  it('evicts the oldest view when a fourth is opened with a limit of three', () => {
    const { next, evicted } = reserveViewEvictingOldest(new Set(['a', 'b', 'c']), 'd', 3);
    expect([...next]).toEqual(['b', 'c', 'd']);
    expect(evicted).toEqual(['a']);
  });

  it('evicts in opening order across successive opens', () => {
    let active: ReadonlySet<string> = new Set(['a', 'b', 'c']);
    const order: string[] = [];
    for (const key of ['d', 'e', 'f']) {
      const result = reserveViewEvictingOldest(active, key, 3);
      order.push(...result.evicted);
      active = result.next;
    }
    expect(order).toEqual(['a', 'b', 'c']);
    expect([...active]).toEqual(['d', 'e', 'f']);
  });

  it('keeps an already open view and its age', () => {
    const active = new Set(['a', 'b', 'c']);
    const { next, evicted } = reserveViewEvictingOldest(active, 'a', 3);
    expect(next).toBe(active);
    expect(evicted).toEqual([]);
  });

  it('evicts several when the limit was lowered below the open count', () => {
    const { next, evicted } = reserveViewEvictingOldest(new Set(['a', 'b', 'c']), 'd', 1);
    expect([...next]).toEqual(['d']);
    expect(evicted).toEqual(['a', 'b', 'c']);
  });

  it('does not mutate the input set', () => {
    const active = new Set(['a', 'b', 'c']);
    reserveViewEvictingOldest(active, 'd', 3);
    expect([...active]).toEqual(['a', 'b', 'c']);
  });
});
