/**
 * The outer frame of every view. Border and background come from the host's style variables so the
 * view blends into the surrounding chat; everything inside is the Fluent theme.
 */
import { makeStyles, shorthands, tokens } from "@fluentui/react-components";
import type { CSSProperties, ReactElement, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

const useStyles = makeStyles({
  frame: {
    overflow: "hidden",
    borderRadius: tokens.borderRadiusLarge,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    color: tokens.colorNeutralForeground1,
  },
  padded: { padding: tokens.spacingHorizontalS },
});

export function Frame({ style, padded, children }: { style: CSSProperties; padded?: boolean; children: ReactNode }): ReactElement {
  const s = useStyles();
  return (
    <div className={`${s.frame}${padded ? ` ${s.padded}` : ""}`} style={style}>
      {children}
    </div>
  );
}

/** The tallest a view's main region grows: past it the region scrolls inside the frame, so the frame (and the page around it) stays put. */
export const MAX_VIEW_HEIGHT = 720;

/** How long the content must hold still, with nothing loading, before the held height is released. */
const SETTLE_MS = 400;

/**
 * Keeps the height the host sees stable while a view navigates. A new screen mounts nearly empty and would
 * report a tiny size (the host then shrinks the frame and grows it again: the page shakes). The region keeps
 * the previous height as its minimum until the new screen has content (nothing marked loading) and has held
 * still for a moment; it never grows past MAX_VIEW_HEIGHT, and scrolls inside instead.
 */
export function StableViewport({ children }: { children: ReactNode }): ReactElement {
  const inner = useRef<HTMLDivElement>(null);
  const [held, setHeld] = useState(0);
  useEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const settle = (): void => {
      if (el.querySelector("[data-k-loading]")) return;
      setHeld(Math.min(MAX_VIEW_HEIGHT, Math.ceil(el.getBoundingClientRect().height)));
    };
    const onChange = (): void => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(settle, SETTLE_MS);
    };
    onChange();
    const observer = new ResizeObserver(onChange);
    observer.observe(el);
    const mutations = new MutationObserver(onChange);
    mutations.observe(el, { childList: true, subtree: true });
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);
  return (
    <div style={{ minHeight: held, maxHeight: MAX_VIEW_HEIGHT, overflowY: "auto" }} data-k-viewport="">
      <div ref={inner}>{children}</div>
    </div>
  );
}
