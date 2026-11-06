/**
 * Keeps a tool result small enough that the chat host never cuts it blindly.
 *
 * A host truncates an oversized tool result with a head/tail cut and no paging cue, which breaks the
 * JSON and can end the conversation on a context limit. So the server shrinks results itself, and always
 * at a boundary the reader can see:
 *   - a list is cut to the first N complete items, with truncated, returned, total, nextLink and a hint
 *     saying how to get the rest;
 *   - one long string (a message body) is cut with a marker saying how much was left out and where to
 *     read the rest.
 * A result under the cap is returned unchanged, byte for byte.
 */

/** Default cap for one list or read result, in characters. */
export const DEFAULT_RESULT_CAP = 60_000;
/** Longest body kept in a result, in characters; an HTML body (the views ask for it) gets more. */
export const BODY_CAP_TEXT = 20_000;
export const BODY_CAP_HTML = 150_000;
/** What a string shrinks to when even one item is over the cap. */
const TIGHT_STRING_CAP = 2_000;

/** The result cap in characters: MS365_MCP_RESULT_CAP_CHARS, default 60000; 0 turns it off. */
export function resultCapChars(env: Record<string, string | undefined> = process.env): number {
  const raw = env.MS365_MCP_RESULT_CAP_CHARS;
  if (raw === undefined || raw === '') return DEFAULT_RESULT_CAP;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_RESULT_CAP;
}

export interface CapOptions {
  cap: number;
  /** A tool that reads whole bodies, named in the marker of a shortened body. */
  bodyHint?: string;
  /** The caller asked for HTML bodies (an interactive view), which are allowed to be longer. */
  html?: boolean;
}

interface Shrunk {
  value: unknown;
  changed: boolean;
}

/** Shortens every string over limit; returns the new value and whether anything changed. */
function shrinkStrings(value: unknown, limit: number, hint?: string): Shrunk {
  if (typeof value === 'string') {
    if (value.length <= limit) return { value, changed: false };
    const left = value.length - limit;
    const use = hint ? '; use ' + hint : '';
    return {
      value: value.slice(0, limit) + '…[' + left + ' more chars' + use + ']',
      changed: true,
    };
  }
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((item) => {
      const r = shrinkStrings(item, limit, hint);
      changed ||= r.changed;
      return r.value;
    });
    return { value: changed ? next : value, changed };
  }
  if (value && typeof value === 'object') {
    let changed = false;
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      const r = shrinkStrings(item, limit, hint);
      changed ||= r.changed;
      next[key] = r.value;
    }
    return { value: changed ? next : value, changed };
  }
  return { value, changed: false };
}

/** Moves a Graph next link back by the items a cut dropped, when it pages by $skip; else unchanged. */
function adjustedNextLink(nextLink: unknown, dropped: number): unknown {
  if (typeof nextLink !== 'string') return nextLink;
  return nextLink.replace(
    /([?&]\$skip=)(\d+)/i,
    (_m, lead: string, skip: string) => lead + Math.max(0, Number(skip) - dropped)
  );
}

const HINT =
  'The result was too large to return whole. Call again with skiptoken or a smaller top, or narrow the query ($filter, $search, $select).';

/**
 * Returns text capped, or text itself when it is within the cap or is not a JSON object.
 * Never cuts the JSON blindly.
 */
export function capJsonText(text: string, options: CapOptions): string {
  const { cap, bodyHint, html } = options;
  if (cap <= 0) return text;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return text; // not JSON (for example TOON output): nothing safe to cut
  }
  if (!parsed || typeof parsed !== 'object') return text;

  const shrunk = shrinkStrings(parsed, html ? BODY_CAP_HTML : BODY_CAP_TEXT, bodyHint);
  const serialized = shrunk.changed ? JSON.stringify(shrunk.value) : text;
  if (serialized.length <= cap) return serialized;

  const obj = shrunk.value as Record<string, unknown>;
  if (!Array.isArray(obj.value)) {
    // One large object: tighten every long string rather than cut its JSON.
    return JSON.stringify(shrinkStrings(obj, TIGHT_STRING_CAP, bodyHint).value);
  }

  const items = obj.value as unknown[];
  const total = items.length;
  const rest: Record<string, unknown> = { ...obj };
  delete rest.value;
  const build = (n: number, list: unknown[]): string =>
    JSON.stringify({
      ...rest,
      value: list.slice(0, n),
      truncated: true,
      returned: n,
      total,
      nextLink: adjustedNextLink(rest['@odata.nextLink'], total - n) ?? null,
      hint: HINT,
    });

  // The most complete items that fit: binary search on how many to keep.
  let lo = 1;
  let hi = total - 1;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (build(mid, items).length <= cap) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  if (best > 0) return build(best, items);

  // Not even two items fit: keep the first, with its long strings tightened.
  return build(1, shrinkStrings(items, TIGHT_STRING_CAP, bodyHint).value as unknown[]);
}
