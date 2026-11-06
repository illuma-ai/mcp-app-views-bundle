/** Renders untrusted work item HTML (description, comments) through the allowlist sanitiser. */
import { makeStyles, tokens } from "@fluentui/react-components";
import type { ReactElement } from "react";
import { useEffect, useRef } from "react";
import { sanitizeHtml } from "../lib/sanitize";

const useStyles = makeStyles({
  body: {
    "fontSize": tokens.fontSizeBase300,
    "lineHeight": tokens.lineHeightBase300,
    "overflowWrap": "anywhere",
    "& p": { margin: "0 0 6px" },
    "& ul, & ol": { margin: "0 0 6px", paddingLeft: "22px" },
    "& a": { color: tokens.colorBrandForegroundLink },
    "& blockquote": { margin: "0 0 6px", paddingLeft: "10px", borderLeft: `3px solid ${tokens.colorNeutralStroke2}` },
    "& table": { borderCollapse: "collapse" },
    "& td, & th": { border: `1px solid ${tokens.colorNeutralStroke2}`, padding: "2px 6px" },
    "& img": { maxWidth: "100%" },
    "& .k-blocked-image": { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
  },
});

/**
 * The sanitiser builds a fresh DOM tree (nothing from the input reaches innerHTML); links open
 * through the host because the view itself may not navigate.
 */
export function RichHtml({ html, onLink }: { html: string; onLink?: (url: string) => void }): ReactElement {
  const s = useStyles();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = ref.current;
    if (!target) return;
    const { node } = sanitizeHtml(html);
    target.replaceChildren(...Array.from(node.childNodes));
  }, [html]);
  return (
    <div
      ref={ref}
      className={s.body}
      onClick={(e) => {
        const a = (e.target as HTMLElement).closest("a");
        if (a?.href) {
          e.preventDefault();
          onLink?.(a.href);
        }
      }}
    />
  );
}
