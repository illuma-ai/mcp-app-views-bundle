/**
 * Inbox view: command bar, folder picker, Focused/Other tabs, date-grouped three-line rows,
 * conversation expansion, read/flag/delete on hover, selection, sort/filter and paging. Opening a
 * row replaces the list with the reading view (with a back button). Folder switches, paging,
 * opening and every action are App-initiated tool calls, so the host confirms each with its full
 * arguments.
 */
import {
  Avatar,
  Button,
  Checkbox,
  Menu,
  MenuDivider,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  Toolbar,
  ToolbarButton,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Archive20Regular,
  ArrowSync20Regular,
  ArrowReply16Regular,
  ArrowSortDown20Regular,
  Attach16Regular,
  Attach20Regular,
  ChevronDown16Regular,
  ChevronDown20Regular,
  ChevronRight16Regular,
  Compose20Regular,
  Delete20Regular,
  Filter20Regular,
  Flag20Filled,
  Flag20Regular,
  Folder20Regular,
  FolderArrowRight20Regular,
  Important16Filled,
  MailRead20Regular,
  MailUnread20Regular,
  MoreHorizontal20Regular,
  ShieldError20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatListTime, formatNumericDate } from '../lib/format.js';
import { LIST_SELECT, PAGE_SIZE } from '../mail/api.js';
import { type Conversation, buildConversation, groupByConversation } from '../mail/conversation.js';
import { dateGroup } from '../mail/dates.js';
import { person } from '../mail/people.js';
import type { MailMessage, Page } from '../mail/types.js';
import { Composer } from './Composer.js';
import { ReadingView } from './ReadingView.js';
import { IconButton, SplitAction, useApi } from './shared.js';

const WELL_KNOWN: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'inbox', name: 'Inbox' },
  { id: 'drafts', name: 'Drafts' },
  { id: 'sentitems', name: 'Sent Items' },
  { id: 'archive', name: 'Archive' },
  { id: 'deleteditems', name: 'Deleted Items' },
  { id: 'junkemail', name: 'Junk Email' },
];

type SortKey = 'date' | 'from' | 'subject';
const SORT_LABEL: Record<SortKey, string> = {
  date: 'By Date',
  from: 'By From',
  subject: 'By Subject',
};
const SORT_FIELD: Record<SortKey, string> = {
  date: 'receivedDateTime',
  from: 'from/emailAddress/address',
  subject: 'subject',
};

const useStyles = makeStyles({
  app: {
    overflow: 'hidden',
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  pane: { padding: tokens.spacingHorizontalS, backgroundColor: tokens.colorNeutralBackground2 },
  cmdbar: {
    display: 'flex',
    alignItems: 'center',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    minHeight: '44px',
    gap: tokens.spacingHorizontalXXS,
  },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '44px',
    padding: `0 ${tokens.spacingHorizontalS} 0 ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  folder: { fontWeight: tokens.fontWeightSemibold },
  grow: { flexGrow: 1, minWidth: 0 },
  group: {
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    width: '100%',
    height: '37px',
    padding: '0 24px 0 12px',
    border: 'none',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: 0,
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
    textAlign: 'left',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground3Hover },
  },
  list: { listStyle: 'none', margin: 0, padding: 0 },
  row: {
    boxSizing: 'border-box',
    position: 'relative',
    display: 'grid',
    gridTemplateColumns: '12px 20px 32px 8px minmax(0, 1fr)',
    alignItems: 'start',
    minHeight: '81px',
    padding: '10px 24px 10px 0',
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    backgroundColor: tokens.colorNeutralBackground1,
    cursor: 'pointer',
    outlineOffset: '-2px',
  },
  rowHover: { backgroundColor: tokens.colorNeutralBackground1Hover },
  rowSelected: {
    backgroundColor: tokens.colorBrandBackground2Hover,
    boxShadow: `inset 0 0 0 1px ${tokens.colorBrandStroke1}`,
  },
  rowUnread: { boxShadow: `inset 3px 0 0 ${tokens.colorBrandForeground1}` },
  rowUnreadSelected: {
    boxShadow: `inset 0 0 0 1px ${tokens.colorBrandStroke1}, inset 3px 0 0 ${tokens.colorBrandForeground1}`,
  },
  chev: {
    gridColumn: 2,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '20px',
    height: '32px',
    minWidth: '20px',
    padding: 0,
    color: tokens.colorNeutralForeground2,
  },
  lead: {
    gridColumn: 3,
    position: 'relative',
    width: '32px',
    height: '32px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { gridColumn: 5, minWidth: 0 },
  bodyChild: { paddingLeft: tokens.spacingHorizontalL },
  line: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minWidth: 0,
    height: '20px',
  },
  ellipsis: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
    flexGrow: 1,
  },
  subject: { color: tokens.colorNeutralForeground1 },
  subjectUnread: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  preview: { color: tokens.colorNeutralForeground3 },
  time: {
    flexShrink: 0,
    paddingLeft: tokens.spacingHorizontalL,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground1,
    whiteSpace: 'nowrap',
  },
  timeUnread: { color: tokens.colorBrandForeground1, fontWeight: tokens.fontWeightSemibold },
  actions: { display: 'inline-flex', flexShrink: 0 },
  mark: { display: 'inline-flex', flexShrink: 0, color: tokens.colorNeutralForeground3 },
  flagged: { color: tokens.colorPaletteRedForeground1 },
  chipRow: { display: 'flex', height: '15px' },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    height: '15px',
    padding: `0 ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase100,
    lineHeight: '13px',
    color: tokens.colorNeutralForeground2,
  },
  tag: {
    flexShrink: 0,
    padding: `0 ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    lineHeight: '18px',
    color: tokens.colorNeutralForeground2,
  },
  state: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
  foot: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    padding: tokens.spacingHorizontalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

interface RowSpec {
  key: string;
  who: string;
  subject: string;
  preview?: string;
  time: string;
  unread: boolean;
  flagged: boolean;
  attachment: boolean;
  important: boolean;
  draft: boolean;
  count: number;
  nested: boolean;
  folder?: string;
  glyph?: boolean;
  messages: MailMessage[];
  expanded?: boolean;
  onToggle?: () => void;
  onOpen: () => void;
}

interface RowProps {
  spec: RowSpec;
  selected: boolean;
  onSelect: (on: boolean) => void;
  onAction: (task: () => Promise<void>, failure: string) => void;
  onRemove: (m: MailMessage) => void;
  disabled: boolean;
}

function Row({ spec, selected, onSelect, onAction, onRemove, disabled }: RowProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [hover, setHover] = useState(false);
  const only = spec.messages.length === 1 ? spec.messages[0] : undefined;
  const showCheck = spec.nested || hover || selected;
  const rowClass = mergeClasses(
    s.row,
    hover && !selected && s.rowHover,
    selected && s.rowSelected,
    spec.unread && !selected && s.rowUnread,
    spec.unread && selected && s.rowUnreadSelected
  );
  return (
    <li
      role="option"
      aria-selected={selected}
      aria-label={`${spec.unread ? 'Unread. ' : ''}${spec.who}. ${spec.subject}`}
      tabIndex={0}
      className={rowClass}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setHover(false)}
      onClick={spec.onOpen}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter') spec.onOpen();
        else if (e.key === ' ') {
          e.preventDefault();
          onSelect(!selected);
        } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const sib =
            e.key === 'ArrowDown'
              ? e.currentTarget.nextElementSibling
              : e.currentTarget.previousElementSibling;
          (sib as HTMLElement | null)?.focus();
        }
      }}
    >
      {spec.onToggle ? (
        <Button
          appearance="transparent"
          className={s.chev}
          aria-label={spec.expanded ? 'Collapse conversation' : 'Expand conversation'}
          aria-expanded={spec.expanded}
          icon={spec.expanded ? <ChevronDown16Regular /> : <ChevronRight16Regular />}
          onClick={(e) => {
            e.stopPropagation();
            spec.onToggle?.();
          }}
        />
      ) : (
        <span />
      )}
      <span className={s.lead}>
        {showCheck ? (
          <Checkbox
            aria-label={`Select ${spec.subject}`}
            checked={selected}
            onChange={(_, d) => onSelect(Boolean(d.checked))}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Avatar size={32} name={spec.who} color="colorful" aria-hidden />
        )}
      </span>
      <div className={mergeClasses(s.body, spec.nested && s.bodyChild)}>
        <div className={s.line}>
          {spec.draft && <span className={s.tag}>Draft</span>}
          <span className={mergeClasses(s.ellipsis)}>{spec.who}</span>
          {spec.count > 1 && <span className={s.tag}>{spec.count}</span>}
          {spec.nested && spec.glyph && (
            <span className={s.mark} title="Replied">
              <ArrowReply16Regular />
            </span>
          )}
          {spec.nested && spec.attachment && (
            <span className={s.mark} title="Has attachments">
              <Attach16Regular />
            </span>
          )}
          {hover && only && (
            <span className={s.actions}>
              <IconButton
                size="small"
                appearance="transparent"
                label={spec.unread ? 'Mark as read' : 'Mark as unread'}
                icon={spec.unread ? <MailRead20Regular /> : <MailUnread20Regular />}
                disabled={disabled || !api.can('update') || !only.id}
                onClick={() =>
                  onAction(async () => {
                    await api.update(only.id ?? '', { isRead: spec.unread });
                    only.isRead = spec.unread;
                  }, 'Could not change read state')
                }
              />
              <IconButton
                size="small"
                appearance="transparent"
                label={spec.flagged ? 'Remove flag' : 'Flag'}
                icon={spec.flagged ? <Flag20Filled /> : <Flag20Regular />}
                disabled={disabled || !api.can('update') || !only.id}
                onClick={() =>
                  onAction(async () => {
                    const status = spec.flagged ? 'notFlagged' : 'flagged';
                    await api.update(only.id ?? '', { flag: { flagStatus: status } });
                    only.flag = { flagStatus: status };
                  }, 'Could not change the flag')
                }
              />
              <IconButton
                size="small"
                appearance="transparent"
                label="Delete"
                icon={<Delete20Regular />}
                disabled={disabled || !api.can('discard') || !only.id}
                onClick={() =>
                  onAction(async () => {
                    await api.call('discard', { messageId: only.id, confirm: true });
                    onRemove(only);
                  }, 'Could not delete the message')
                }
              />
            </span>
          )}
        </div>
        {spec.nested ? (
          <>
            <div className={s.line}>
              <span className={mergeClasses(s.ellipsis, s.preview)}>
                {(spec.preview ?? '').replace(/\s+/g, ' ')}
              </span>
              <span className={mergeClasses(s.time, spec.unread && s.timeUnread)}>{spec.time}</span>
            </div>
            <div className={s.line}>
              <span className={s.ellipsis} />
              {spec.folder && <span className={s.tag}>{spec.folder}</span>}
            </div>
          </>
        ) : (
          <>
            <div className={s.line}>
              <span className={mergeClasses(s.ellipsis, s.subject, spec.unread && s.subjectUnread)}>
                {spec.subject}
              </span>
              {spec.important && (
                <span className={mergeClasses(s.mark, s.flagged)} title="High importance">
                  <Important16Filled />
                </span>
              )}
              {spec.flagged && (
                <span className={mergeClasses(s.mark, s.flagged)} title="Flagged">
                  <Flag20Filled />
                </span>
              )}
              <span className={mergeClasses(s.time, spec.unread && s.timeUnread)}>{spec.time}</span>
            </div>
            <div className={s.line}>
              <span className={mergeClasses(s.ellipsis, s.preview)}>
                {(spec.preview ?? '').replace(/\s+/g, ' ')}
              </span>
            </div>
            {spec.attachment && (
              <div className={s.chipRow}>
                <span className={s.chip}>
                  <Attach16Regular />
                  Attachment
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </li>
  );
}

export interface InboxViewProps {
  args: Record<string, unknown>;
  result?: Page<MailMessage>;
  error?: string;
  received: boolean;
}

/** Narrow container: the command bar collapses to New mail and "…". */
function useNarrow(limit: number): [React.RefObject<HTMLDivElement | null>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setNarrow(el.getBoundingClientRect().width <= limit));
    ro.observe(el);
    return () => ro.disconnect();
  }, [limit]);
  return [ref, narrow];
}

export function InboxView({
  args,
  result,
  error: resultError,
  received,
}: InboxViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [rootRef, narrow] = useNarrow(720);
  const [items, setItems] = useState<MailMessage[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [folder, setFolder] = useState<string | null>(
    typeof args.mailFolderId === 'string' ? args.mailFolderId : null
  );
  const [folderName, setFolderName] = useState<string>(
    () => WELL_KNOWN.find((f) => f.id === args.mailFolderId)?.name ?? 'Messages'
  );
  const [queryArgs, setQueryArgs] = useState<Record<string, unknown>>(args);
  const [tab, setTab] = useState<'focused' | 'other' | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: 'date', desc: true });
  const [filter, setFilter] = useState<'all' | 'unread' | 'flagged'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [foldersLoaded, setFoldersLoaded] = useState(false);
  const [detail, setDetail] = useState<
    | null
    | { kind: 'read'; conv: Conversation; focus?: MailMessage }
    | { kind: 'compose'; draft: MailMessage }
    | { kind: 'opening' }
  >(null);
  const [, force] = useState(0);
  const seen = useRef(new Set<string>());

  const ingest = (page: Page<MailMessage>, replace: boolean): void => {
    if (replace) {
      seen.current.clear();
      setSelected(new Set());
    }
    const fresh = (page.value ?? []).filter((m) => {
      if (!m || typeof m !== 'object') return false;
      if (m.id) {
        if (seen.current.has(m.id)) return false;
        seen.current.add(m.id);
      }
      return true;
    });
    setItems((cur) => (replace ? fresh : [...cur, ...fresh]));
    setNext(page['@odata.nextLink'] ?? null);
  };

  // The tool result that created this view.
  useEffect(() => {
    if (!received) return;
    setFolder(typeof args.mailFolderId === 'string' ? args.mailFolderId : null);
    setQueryArgs(args);
    const known = WELL_KNOWN.find((f) => f.id === args.mailFolderId)?.name;
    if (known) setFolderName(known);
    if (resultError) {
      setError(resultError);
      setItems([]);
    } else if (result && Array.isArray(result.value)) {
      setError(null);
      ingest(result, true);
    } else if (result && (result as MailMessage).id) {
      setError(null);
      ingest({ value: [result as MailMessage] }, true);
    } else {
      setError('The result is not a message list.');
    }
  }, [result, resultError, received]);

  const busyRef = useRef(false);
  const guard = (task: () => Promise<void>, failure: string): void => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoading(true);
    setError(null);
    task()
      .catch((e: Error) => setError(failure ? `${failure}: ${e.message}` : e.message))
      .finally(() => {
        busyRef.current = false;
        setLoading(false);
        force((n) => n + 1);
      });
  };

  const loadFolder = (
    id: string,
    name: string,
    nextTab: 'focused' | 'other' | null,
    nextSort = sort
  ): void =>
    guard(async () => {
      const query: Record<string, unknown> = {
        mailFolderId: id,
        select: LIST_SELECT,
        top: PAGE_SIZE,
      };
      // Graph rejects an ordering that does not start with a filtered property, so a tab filter
      // keeps the default (newest first) order.
      if (nextTab) query.filter = `inferenceClassification eq '${nextTab}'`;
      else query.orderby = `${SORT_FIELD[nextSort.key]} ${nextSort.desc ? 'desc' : 'asc'}`;
      const page = await api.call<Page<MailMessage>>('listFolder', query);
      setQueryArgs(query);
      setFolder(id);
      setFolderName(name);
      setTab(nextTab);
      setSort(nextSort);
      ingest(page, true);
    }, '');

  const loadMore = (): void =>
    guard(async () => {
      const page = await api.call<Page<MailMessage>>(folder ? 'listFolder' : 'list', {
        ...queryArgs,
        skiptoken: next,
      });
      ingest(page, false);
    }, '');

  const loadFolders = (): void =>
    guard(async () => {
      await api.ensureFolders();
      setFoldersLoaded(true);
    }, '');

  const selectedMessages = items.filter((m) => m.id && selected.has(m.id));
  /** Runs `task` for each selected message in turn (each is a host-approved call). */
  const bulk = (task: (m: MailMessage) => Promise<void>, drop: boolean, failure: string): void => {
    const targets = selectedMessages;
    if (!targets.length) return;
    guard(async () => {
      for (const m of targets) {
        await task(m);
        if (drop) setItems((cur) => cur.filter((x) => x.id !== m.id));
      }
      setSelected(new Set());
    }, failure);
  };
  const markAllRead = (): void => {
    const targets = (selectedMessages.length ? selectedMessages : items).filter(
      (m) => m.isRead === false
    );
    guard(async () => {
      for (const m of targets) {
        await api.update(m.id ?? '', { isRead: true });
        m.isRead = true;
      }
    }, 'Could not mark as read');
  };

  const commands: Array<{ label: string; icon: ReactElement; disabled: boolean; run: () => void }> =
    [
      {
        label: 'Delete',
        icon: <Delete20Regular />,
        disabled: !selectedMessages.length || !api.can('discard'),
        run: () =>
          bulk(
            (m) => api.call('discard', { messageId: m.id, confirm: true }).then(() => undefined),
            true,
            'Could not delete'
          ),
      },
      {
        label: 'Archive',
        icon: <Archive20Regular />,
        disabled: !selectedMessages.length || !api.can('move'),
        run: () =>
          bulk(
            (m) => api.move(m.id ?? '', 'archive').then(() => undefined),
            true,
            'Could not archive'
          ),
      },
      {
        label: 'Report junk',
        icon: <ShieldError20Regular />,
        disabled: !selectedMessages.length || !api.can('move'),
        run: () =>
          bulk(
            (m) => api.move(m.id ?? '', 'junkemail').then(() => undefined),
            true,
            'Could not report'
          ),
      },
      {
        label: 'Mark all as read',
        icon: <MailRead20Regular />,
        disabled: !api.can('update') || !items.some((m) => m.isRead === false),
        run: markAllRead,
      },
    ];

  const newMail = (): void =>
    guard(async () => {
      const draft = await api.call<MailMessage>('compose', {
        body: { subject: '', body: { contentType: 'text', content: '' } },
        confirm: true,
      });
      setDetail({ kind: 'compose', draft });
    }, 'Could not start a new message');

  const openConversation = (conv: Conversation, focus?: MailMessage): void => {
    const target = focus ?? conv.latest;
    if (
      target.isDraft ||
      typeof target.body?.content === 'string' ||
      !target.id ||
      !api.can('get')
    ) {
      setDetail({ kind: 'read', conv, focus });
      return;
    }
    setDetail({ kind: 'opening' });
    api
      .getMessage(target.id)
      .then((full) => Object.assign(target, full))
      .catch((e: Error) => setError(`Could not open the message: ${e.message}`))
      .finally(() => setDetail({ kind: 'read', conv, focus }));
  };

  const removeItem = (m: MailMessage): void => setItems((cur) => cur.filter((x) => x !== m));

  const groups = useMemo(() => {
    return groupByConversation(items).filter((g) =>
      g.messages.some(
        (m) =>
          (filter !== 'unread' || m.isRead === false) &&
          (filter !== 'flagged' || m.flag?.flagStatus === 'flagged')
      )
    );
  }, [items, filter, loading]);

  const ids = items.map((m) => m.id).filter(Boolean) as string[];
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));

  if (detail) {
    return (
      <div ref={rootRef} className={s.app}>
        <div className={s.pane}>
          {detail.kind === 'opening' && <Spinner label="Opening message…" />}
          {detail.kind === 'compose' && (
            <Composer draft={detail.draft} onClose={() => setDetail(null)} />
          )}
          {detail.kind === 'read' && (
            <ReadingView
              initial={detail.conv.messages}
              focusId={detail.focus?.id}
              autoLoadConversation={detail.conv.messages.length > 1 && api.can('list')}
              onBack={() => setDetail(null)}
              onChange={(next) => {
                for (const m of next.messages) {
                  const own = items.find((x) => x.id === m.id);
                  if (own && own !== m) Object.assign(own, m);
                }
              }}
              onDeleted={(m) => setItems((cur) => cur.filter((x) => x.id !== m.id))}
            />
          )}
        </div>
      </div>
    );
  }

  const rows: ReactElement[] = [];
  let lastGroup = '';
  for (const conv of groups) {
    const group = dateGroup(conv.latest.receivedDateTime);
    if (group !== lastGroup) {
      lastGroup = group;
      const collapsed = collapsedGroups.has(group);
      rows.push(
        <li key={`g-${group}`} role="presentation">
          <button
            type="button"
            className={s.group}
            aria-expanded={!collapsed}
            onClick={() =>
              setCollapsedGroups((cur) => {
                const nextSet = new Set(cur);
                if (collapsed) nextSet.delete(group);
                else nextSet.add(group);
                return nextSet;
              })
            }
          >
            {collapsed ? <ChevronRight16Regular /> : <ChevronDown16Regular />}
            {group}
          </button>
        </li>
      );
    }
    if (collapsedGroups.has(group)) continue;
    rows.push(...conversationRows(conv));
  }

  function conversationRows(conv: Conversation): ReactElement[] {
    const many = conv.messages.length > 1;
    const open = expanded.has(conv.key);
    const convIds = conv.messages.map((m) => m.id).filter(Boolean) as string[];
    const spec: RowSpec = {
      key: conv.key,
      who: many
        ? conv.participants.slice(0, 3).join(', ') +
          (conv.participants.length > 3 ? ` +${conv.participants.length - 3}` : '')
        : conv.participants[0],
      subject: conv.subject,
      preview: conv.latest.bodyPreview,
      time: formatListTime(conv.latest.receivedDateTime),
      unread: conv.unread,
      flagged: conv.flagged,
      attachment: conv.attachments,
      important: conv.important,
      draft: !many && Boolean(conv.latest.isDraft),
      count: conv.messages.length,
      nested: false,
      messages: conv.messages,
      expanded: open,
      onToggle: many
        ? () => {
            setExpanded((cur) => {
              const nextSet = new Set(cur);
              if (open) nextSet.delete(conv.key);
              else nextSet.add(conv.key);
              return nextSet;
            });
            if (!open && !foldersLoaded)
              void api.ensureFolders().then(() => setFoldersLoaded(true));
          }
        : undefined,
      onOpen: () => openConversation(conv),
    };
    const out = [
      <Row
        key={conv.key}
        spec={spec}
        selected={convIds.length > 0 && convIds.every((id) => selected.has(id))}
        onSelect={(on) =>
          setSelected((cur) => {
            const n = new Set(cur);
            for (const id of convIds) {
              if (on) n.add(id);
              else n.delete(id);
            }
            return n;
          })
        }
        onAction={guard}
        onRemove={removeItem}
        disabled={loading}
      />,
    ];
    if (many && open) {
      for (const m of [...conv.messages].reverse()) {
        const mid = m.id ?? '';
        out.push(
          <Row
            key={`${conv.key}-${mid}`}
            spec={{
              key: mid,
              who: person(m.from ?? m.sender).label,
              subject: m.subject || '(no subject)',
              preview: m.bodyPreview,
              time: formatNumericDate(m.receivedDateTime),
              unread: m.isRead === false,
              flagged: m.flag?.flagStatus === 'flagged',
              attachment: Boolean(m.hasAttachments),
              important: m.importance === 'high',
              draft: Boolean(m.isDraft),
              count: 1,
              nested: true,
              folder: api.folderName(m.parentFolderId),
              glyph: /^\s*re\s*:/i.test(m.subject ?? ''),
              messages: [m],
              onOpen: () => openConversation(buildConversation(conv.key, conv.messages), m),
            }}
            selected={selected.has(mid)}
            onSelect={(on) =>
              setSelected((cur) => {
                const n = new Set(cur);
                if (on) n.add(mid);
                else n.delete(mid);
                return n;
              })
            }
            onAction={guard}
            onRemove={removeItem}
            disabled={loading}
          />
        );
      }
    }
    return out;
  }

  const overflow = (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <ToolbarButton aria-label="More commands" icon={<MoreHorizontal20Regular />} />
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {commands.map((c) => (
            <MenuItem key={c.label} icon={c.icon} disabled={c.disabled} onClick={c.run}>
              {c.label}
            </MenuItem>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );

  return (
    <div ref={rootRef} className={s.app}>
      <Toolbar className={s.cmdbar} data-sticky="top" aria-label="Mail commands">
        {api.can('compose') && (
          <SplitAction
            label="New mail"
            icon={<Compose20Regular />}
            disabled={loading}
            onClick={newMail}
            menuLabel="More New mail options"
            items={[{ label: 'New mail', icon: <Compose20Regular />, onClick: newMail }]}
          />
        )}
        {narrow ? (
          overflow
        ) : (
          <>
            {commands.map((c) => (
              <ToolbarButton
                key={c.label}
                icon={c.icon}
                disabled={c.disabled}
                onClick={c.run}
                aria-label={c.label}
              >
                {c.label === 'Mark all as read' ? c.label : undefined}
              </ToolbarButton>
            ))}
            <Menu>
              <MenuTrigger disableButtonEnhancement>
                <ToolbarButton
                  icon={<FolderArrowRight20Regular />}
                  aria-label="Move to"
                  disabled={!selectedMessages.length || !api.can('move')}
                />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  {[
                    ...WELL_KNOWN,
                    ...api
                      .folders()
                      .filter((f) => !WELL_KNOWN.some((w) => w.name === f.name))
                      .map((f) => ({ id: f.id, name: f.name })),
                  ].map((f) => (
                    <MenuItem
                      key={f.id}
                      icon={<Folder20Regular />}
                      onClick={() =>
                        bulk(
                          (m) => api.move(m.id ?? '', f.id).then(() => undefined),
                          true,
                          'Could not move'
                        )
                      }
                    >
                      {f.name}
                    </MenuItem>
                  ))}
                </MenuList>
              </MenuPopover>
            </Menu>
          </>
        )}
        <span className={s.grow} />
        {folder && (
          <IconButton
            label="Refresh"
            icon={<ArrowSync20Regular />}
            disabled={loading}
            onClick={() => loadFolder(folder, folderName, tab)}
          />
        )}
      </Toolbar>

      <div className={s.head} data-sticky="top">
        <Checkbox
          aria-label="Select all"
          checked={allSelected}
          onChange={(_, d) => setSelected(d.checked ? new Set(ids) : new Set())}
        />
        {api.can('listFolder') ? (
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <Button
                appearance="transparent"
                className={s.folder}
                iconPosition="after"
                icon={<ChevronDown16Regular />}
              >
                {folderName}
              </Button>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                {WELL_KNOWN.map((f) => (
                  <MenuItem
                    key={f.id}
                    icon={<Folder20Regular />}
                    onClick={() => loadFolder(f.id, f.name, f.id === 'inbox' ? 'focused' : null)}
                  >
                    {f.name}
                  </MenuItem>
                ))}
                {api
                  .folders()
                  .filter((f) => !WELL_KNOWN.some((w) => w.name === f.name))
                  .map((f) => (
                    <MenuItem
                      key={f.id}
                      icon={<Folder20Regular />}
                      onClick={() => loadFolder(f.id, f.name, null)}
                    >
                      {f.unread ? `${f.name} (${f.unread})` : f.name}
                    </MenuItem>
                  ))}
                {api.can('folders') && !foldersLoaded && (
                  <>
                    <MenuDivider />
                    <MenuItem onClick={loadFolders}>Load all folders…</MenuItem>
                  </>
                )}
              </MenuList>
            </MenuPopover>
          </Menu>
        ) : (
          <strong className={s.folder}>{folderName}</strong>
        )}
        {folder?.toLowerCase() === 'inbox' && api.can('listFolder') && (
          <TabList
            selectedValue={tab ?? ''}
            onTabSelect={(_, d) => loadFolder('inbox', 'Inbox', d.value as 'focused' | 'other')}
            size="small"
          >
            <Tab value="focused">Focused</Tab>
            <Tab value="other">Other</Tab>
          </TabList>
        )}
        <span className={s.grow} />
        <IconButton
          label={sort.desc ? 'Newest on top' : 'Oldest on top'}
          icon={<ArrowSortDown20Regular />}
          onClick={() =>
            folder && loadFolder(folder, folderName, tab, { ...sort, desc: !sort.desc })
          }
          disabled={!folder || Boolean(tab)}
        />
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <IconButton label="Filter" icon={<Filter20Regular />} pressed={filter !== 'all'} />
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {(['all', 'unread', 'flagged'] as const).map((f) => (
                <MenuItem
                  key={f}
                  onClick={() => setFilter(f)}
                  secondaryContent={filter === f ? '✓' : undefined}
                >
                  {f === 'all' ? 'All messages' : f === 'unread' ? 'Unread' : 'Flagged'}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="transparent" disabled={!folder || Boolean(tab)}>
              {SORT_LABEL[sort.key]}
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
                <MenuItem
                  key={k}
                  onClick={() =>
                    folder && loadFolder(folder, folderName, tab, { key: k, desc: k === 'date' })
                  }
                >
                  {SORT_LABEL[k]}
                </MenuItem>
              ))}
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>

      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {!items.length ? (
        <p className={s.state} role="status">
          {loading
            ? 'Loading…'
            : error
              ? ''
              : received
                ? 'No messages to show.'
                : 'Waiting for messages…'}
        </p>
      ) : rows.length ? (
        <ul className={s.list} role="listbox" aria-multiselectable aria-label="Messages">
          {rows}
        </ul>
      ) : (
        <p className={s.state}>No loaded messages match this filter.</p>
      )}
      {(next || loading) && (
        <div className={s.foot}>
          {next &&
            (api.can(folder ? 'listFolder' : 'list') ? (
              <Button
                appearance="outline"
                icon={loading ? <Spinner size="tiny" /> : <ChevronDown16Regular />}
                disabled={loading}
                onClick={loadMore}
              >
                Load more
              </Button>
            ) : (
              <span>More messages are available. Ask the assistant to continue.</span>
            ))}
        </div>
      )}
    </div>
  );
}
