/**
 * One stable frame for every view. The host resizes the view's iframe to whatever height the view
 * reports, so a screen that unmounts and mounts nearly empty (list to conversation) would collapse the
 * frame and grow it again, jumping the host page. This wrapper
 *
 * - holds the tallest height it has shown (up to the cap) as a minimum, so navigating never reports a
 *   smaller size while the next screen loads;
 * - caps the frame at MAX_FRAME_PX and scrolls inside it (the one scroller: the page itself never
 *   scrolls, so there is never a second scrollbar beside it);
 * - keeps headers fixed and the composer at the bottom: an element marked data-sticky="top" (headers,
 *   toolbars, in document order) or data-sticky="bottom" (a composer) sticks to the edge of the one
 *   scroller, stacked after the ones before it, so only the body scrolls; and
 * - always reports the height it wants, min(content, cap), whatever size the host's iframe has now
 *   (a host starts the frame small and grows it to what the view reports). Only a host that SHRINKS the
 *   frame below a size it had already given lowers the cap to it; the initial size never does.
 */
import { useEffect, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';

/** The tallest the frame gets; taller content scrolls inside it. */
export const MAX_FRAME_PX = 720;

/** A host frame below this is never taken as a cap. */
const MIN_HOST_FRAME_PX = 200;

/**
 * Makes every [data-sticky] element inside `root` stick to the top (stacked in document order) or the
 * bottom (stacked from the end) of the frame's scroller. Sticky needs an opaque background and no
 * clipping ancestor between the element and the scroller: ancestors that clip with overflow hidden
 * (the views' rounded outer boxes) are switched to overflow clip, which looks the same but is not a
 * scroll container.
 */
function applyStickies(root: HTMLElement, scroller: HTMLElement): void {
  const place = (els: HTMLElement[], edge: 'top' | 'bottom'): void => {
    let offset = 0;
    for (const el of els) {
      el.style.position = 'sticky';
      el.style[edge] = `${offset}px`;
      el.style.zIndex = '5';
      if (!el.style.backgroundColor) el.style.backgroundColor = 'var(--colorNeutralBackground1)';
      for (let p = el.parentElement; p && p !== scroller; p = p.parentElement) {
        if (getComputedStyle(p).overflow === 'hidden') p.style.overflow = 'clip';
      }
      offset += el.getBoundingClientRect().height;
    }
  };
  const all = (kind: string): HTMLElement[] =>
    Array.from(root.querySelectorAll<HTMLElement>(`[data-sticky="${kind}"]`));
  place(all('top'), 'top');
  place(all('bottom').reverse(), 'bottom');
}

export function StableFrame({ children }: { children: ReactNode }): ReactElement {
  const inner = useRef<HTMLDivElement>(null);
  const outer = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(0);
  const [limit, setLimit] = useState(MAX_FRAME_PX);
  useEffect(() => {
    const el = inner.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const grow = (): void => {
      const h = Math.min(Math.ceil(el.getBoundingClientRect().height), MAX_FRAME_PX);
      setHeld((cur) => (h > cur ? h : cur));
      if (outer.current) applyStickies(el, outer.current);
    };
    grow();
    const observer = new ResizeObserver(grow);
    observer.observe(el);
    // A header that appears without changing the height still needs placing.
    let frame = 0;
    const mutations = new MutationObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(grow);
    });
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      mutations.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);
  // The host's answer to what we reported: when it makes the frame SMALLER than it was (and smaller than
  // what we show), that is the host capping us, so follow it. Growth, and the size the host starts at,
  // never lower the cap; a frame taller than the cap lifts it again.
  useEffect(() => {
    let previous = window.innerHeight;
    const onResize = (): void => {
      const frame = window.innerHeight;
      const shown = outer.current?.getBoundingClientRect().height ?? 0;
      if (frame < previous - 2 && frame >= MIN_HOST_FRAME_PX && frame < shown - 2) setLimit(frame);
      else if (frame > previous + 2) setLimit(MAX_FRAME_PX);
      previous = frame;
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return (
    <div
      ref={outer}
      data-frame="stable"
      style={{
        minHeight: Math.min(held, limit),
        maxHeight: limit,
        overflowY: 'auto',
        overscrollBehavior: 'contain',
      }}
    >
      <div ref={inner}>{children}</div>
    </div>
  );
}
