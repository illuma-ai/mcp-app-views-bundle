/**
 * A message body flowing in its card. HTML is sanitised (lib/sanitize.ts rebuilds it node by node
 * from an allowlist) and mounted as DOM nodes, never as markup strings. When something was actually
 * blocked, a bar says so, as the reference client does.
 */
import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarActions,
  MessageBarBody,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { ChevronDown16Regular, ShieldError20Regular } from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { splitQuoted } from '../lib/quoted.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { useApi } from './shared.js';

const useStyles = makeStyles({
  body: {
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: '64px',
    paddingRight: tokens.spacingHorizontalXL,
    overflowWrap: 'anywhere',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    color: tokens.colorNeutralForeground1,
    '& img': { maxWidth: '100%' },
    '& table': { maxWidth: '100%', borderCollapse: 'collapse' },
    '& td': { padding: '2px 6px', verticalAlign: 'top' },
    '& blockquote': {
      marginTop: tokens.spacingVerticalS,
      marginBottom: tokens.spacingVerticalS,
      marginLeft: 0,
      paddingLeft: tokens.spacingHorizontalM,
      borderLeft: `3px solid ${tokens.colorNeutralStroke2}`,
      color: tokens.colorNeutralForeground2,
    },
    '& a': { color: tokens.colorBrandForegroundLink, textDecoration: 'underline' },
    '& pre': {
      whiteSpace: 'pre-wrap',
      fontFamily: tokens.fontFamilyMonospace,
      fontSize: tokens.fontSizeBase200,
    },
    '& p': { marginTop: 0, marginBottom: tokens.spacingVerticalM },
    '& .k-blocked-image': {
      display: 'inline-block',
      paddingLeft: tokens.spacingHorizontalS,
      paddingRight: tokens.spacingHorizontalS,
      border: `1px dashed ${tokens.colorNeutralStroke1}`,
      color: tokens.colorNeutralForeground3,
      fontSize: tokens.fontSizeBase200,
    },
  },
  plain: { whiteSpace: 'pre-wrap' },
  compact: { paddingLeft: 0, paddingRight: 0 },
  pill: {
    marginLeft: '64px',
    marginBottom: tokens.spacingVerticalS,
    minHeight: '16px',
    height: '16px',
    minWidth: '28px',
    paddingTop: 0,
    paddingBottom: 0,
    lineHeight: '12px',
  },
});

/** Mounts a detached DOM node. */
function DomNode({
  node,
  className,
  onLink,
}: {
  node: HTMLElement;
  className: string;
  onLink: (url: string) => void;
}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    ref.current?.replaceChildren(node);
  }, [node]);
  return (
    <div
      ref={ref}
      className={className}
      onClick={(e) => {
        const a = (e.target as Element).closest?.('a[href]');
        if (!a) return;
        e.preventDefault();
        onLink(a.getAttribute('href') ?? '');
      }}
    />
  );
}

export interface MessageBodyProps {
  body?: { contentType?: string; content?: string };
  preview?: string;
  /** Moves the message to junk; offered under Report in the blocked-content bar. */
  onReportJunk?: () => void;
  /** No left inset (outside a message card, where there is no avatar column). */
  compact?: boolean;
}

export function MessageBody({
  body,
  preview,
  onReportJunk,
  compact,
}: MessageBodyProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [explained, setExplained] = useState(false);
  const [showQuoted, setShowQuoted] = useState(false);
  const html =
    body && typeof body.content === 'string' && String(body.contentType).toLowerCase() === 'html'
      ? body.content
      : undefined;

  const parts = useMemo(() => {
    if (html === undefined) return null;
    const split = splitQuoted(html);
    const top = sanitizeHtml(split ? split.top : html);
    const quoted = split ? sanitizeHtml(split.quoted) : null;
    return { top, quoted };
  }, [html]);

  if (parts) {
    const notable =
      parts.top.stats.blockedImages +
        parts.top.stats.blockedActive +
        (parts.quoted?.stats.blockedImages ?? 0) +
        (parts.quoted?.stats.blockedActive ?? 0) >
      0;
    return (
      <div>
        {notable && (
          <MessageBar intent="info" shape="square">
            <MessageBarBody>
              {explained
                ? 'Remote images and scripts stay blocked in this view. Open the message in your mail client to see them.'
                : 'Images and scripts have been blocked.'}
            </MessageBarBody>
            <MessageBarActions>
              {!explained && (
                <Button size="small" onClick={() => setExplained(true)}>
                  Show content
                </Button>
              )}
              <Menu>
                <MenuTrigger disableButtonEnhancement>
                  <Button size="small" iconPosition="after" icon={<ChevronDown16Regular />}>
                    Report
                  </Button>
                </MenuTrigger>
                <MenuPopover>
                  <MenuList>
                    <MenuItem
                      icon={<ShieldError20Regular />}
                      disabled={!onReportJunk}
                      onClick={onReportJunk}
                    >
                      Report as junk
                    </MenuItem>
                  </MenuList>
                </MenuPopover>
              </Menu>
            </MessageBarActions>
          </MessageBar>
        )}
        <DomNode
          node={parts.top.node}
          className={mergeClasses(s.body, compact && s.compact)}
          onLink={(u) => api.openLink(u)}
        />
        {parts.quoted && (
          <>
            <Button
              className={s.pill}
              size="small"
              aria-expanded={showQuoted}
              aria-label="Show quoted text"
              onClick={() => setShowQuoted(!showQuoted)}
            >
              {'…'}
            </Button>
            {showQuoted && (
              <DomNode
                node={parts.quoted.node}
                className={mergeClasses(s.body, compact && s.compact)}
                onLink={(u) => api.openLink(u)}
              />
            )}
          </>
        )}
      </div>
    );
  }
  const text = typeof body?.content === 'string' ? body.content : preview;
  return (
    <div className={mergeClasses(s.body, s.plain, compact && s.compact)}>
      {text || 'This message has no body content.'}
    </div>
  );
}
