/**
 * Host theme plumbing. The views are drawn with the Fluent theme (light, dark or high contrast);
 * only the outer frame takes colours from the host's style variables, so the view blends into the
 * surrounding chat. Variables arrive as bare "R G B" triplets from the chat host and as colour
 * strings from others; both are accepted.
 */
import type { CSSProperties } from 'react';

const TRIPLET = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/;

/**
 * Normalises a colour to "R G B". Accepts a triplet, #rgb / #rrggbb and rgb()/rgba() with comma or
 * space separators; anything else returns undefined and the Fluent default stays.
 */
export function toTriplet(value: string): string | undefined {
  const v = value.trim();
  if (TRIPLET.test(v)) return v.replace(/\s+/g, ' ');
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const s = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join('') : hex[1];
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).join(' ');
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(v);
  return rgb ? `${rgb[1]} ${rgb[2]} ${rgb[3]}` : undefined;
}

/**
 * Which Fluent theme to use. Forced colours (high contrast) win over the host's light/dark. When the
 * host sends no theme, `hostSignalsDark` (the page's data-theme or prefers-color-scheme) decides, so a
 * dark host never gets light-theme text on its dark surface.
 */
export function themeKind(
  hostTheme: string | undefined,
  forcedColors: boolean,
  hostSignalsDark = false
): 'light' | 'dark' | 'highContrast' {
  if (forcedColors) return 'highContrast';
  if (hostTheme === undefined) return hostSignalsDark ? 'dark' : 'light';
  return hostTheme === 'dark' ? 'dark' : 'light';
}

/** The darkest surface a dark view may sit on: the Fluent web dark palette's deepest layer (#141414). */
export const DARKEST_SURFACE = 20;

/** True when the page itself says it is dark (data-theme on the root, or prefers-color-scheme). */
export function pageSignalsDark(doc: Document = document): boolean {
  const root = doc.documentElement.getAttribute('data-theme');
  if (root) return root === 'dark';
  return doc.defaultView?.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

/**
 * Border and background of the outer frame from the host's variables (undefined parts are omitted,
 * and the frame then uses the Fluent theme's own surface). In dark mode a host colour darker than
 * #141414 is not used for the background: dark views sit on dark greys, never on black.
 */
export function frameStyle(vars: Record<string, unknown> | undefined, dark = false): CSSProperties {
  const color = (name: string, floor = -1): string | undefined => {
    const raw = vars?.[name];
    const t = typeof raw === 'string' ? toTriplet(raw) : undefined;
    if (!t) return undefined;
    // Rec. 709 luma is enough to tell black-class from grey: all three channels under the floor.
    if (t.split(' ').every((n) => Number(n) <= floor)) return undefined;
    return `rgb(${t})`;
  };
  return {
    backgroundColor: color('--color-background-secondary', dark ? DARKEST_SURFACE : -1),
    borderColor: color('--color-border-secondary'),
  };
}
