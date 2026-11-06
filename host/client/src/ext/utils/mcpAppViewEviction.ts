/**
 * Open-view bookkeeping for MCP App views.
 *
 * The host keeps at most `maxActiveViews` views open per conversation. Rather than ignoring
 * a request to open one more, the oldest open view is closed to make room, so the view the
 * person just asked for always opens.
 */

/** Result of reserving a view slot. */
export interface ViewReservation {
  /** Keys open after the reservation, oldest first. */
  next: ReadonlySet<string>;
  /** Keys closed to make room, oldest first. */
  evicted: string[];
}

/**
 * Reserves a slot for `key`, evicting the oldest open views while the set is at capacity.
 * A `Set` iterates in insertion order, so the first entries are the oldest; re-reserving an
 * open key is a no-op and keeps its age.
 *
 * @param active - Keys currently open, oldest first.
 * @param key - The view being opened.
 * @param max - Maximum number of simultaneously open views (at least 1).
 */
export function reserveViewEvictingOldest(
  active: ReadonlySet<string>,
  key: string,
  max: number,
): ViewReservation {
  if (active.has(key)) {
    return { next: active, evicted: [] };
  }
  const limit = Math.max(1, max);
  const next = new Set(active);
  const evicted: string[] = [];
  while (next.size >= limit) {
    const oldest = next.values().next().value as string;
    next.delete(oldest);
    evicted.push(oldest);
  }
  next.add(key);
  return { next, evicted };
}
