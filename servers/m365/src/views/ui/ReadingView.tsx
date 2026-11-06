/**
 * The reading view for a message or a whole conversation: a subject bar, then message cards,
 * newest first, with older ones collapsed to one line. Used for a single message result and for a
 * row opened from the inbox list.
 *
 * Every action (read state, flag, delete, move, reply, reply-all, forward) is an App-initiated tool
 * call, so the host asks the user to approve it with the full arguments. Reply/forward create a
 * draft, which opens in the composer above the cards; nothing is sent until the user presses Send.
 */
import {
  Avatar,
  Button,
  Card,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  MessageBar,
  MessageBarBody,
  Persona,
  Spinner,
  Subtitle2,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Archive20Regular,
  ArrowForward20Regular,
  ArrowLeft20Regular,
  ArrowReply20Regular,
  ArrowReplyAll20Regular,
  ChevronDown20Regular,
  Delete20Regular,
  Document20Regular,
  Edit20Regular,
  EmojiSmileSlight20Regular,
  Flag16Filled,
  Important16Filled,
  Mail20Regular,
  MailRead20Regular,
  MoreHorizontal20Regular,
  Person16Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatListTime, formatOutlookDate, formatSize } from '../lib/format.js';
import { type Conversation, buildConversation } from '../mail/conversation.js';
import { person } from '../mail/people.js';
import type { MailAttachment, MailMessage, Recipient } from '../mail/types.js';
import { Composer } from './Composer.js';
import { MessageBody } from './MessageBody.js';
import { IconButton, useAction, useApi } from './shared.js';

const useStyles = makeStyles({
  stack: { display: 'grid', rowGap: tokens.spacingVerticalS },
  subject: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    minHeight: '44px',
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    backgroundColor: tokens.colorNeutralBackground1,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
  },
  grow: { flexGrow: 1, minWidth: 0 },
  card: { padding: 0, gap: 0, borderRadius: tokens.borderRadiusMedium },
  head: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
  },
  who: { flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' },
  addr: { color: tokens.colorNeutralForeground3 },
  mark: {
    color: tokens.colorPaletteRedForeground1,
    display: 'inline-flex',
    marginLeft: tokens.spacingHorizontalXS,
    verticalAlign: 'middle',
  },
  secondary: { fontSize: tokens.fontSizeBase300, lineHeight: tokens.lineHeightBase300 },
  to: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    color: tokens.colorNeutralForeground2,
    overflowWrap: 'anywhere',
  },
  // Beside the sender when there is room; under it, with the date at the left, when there is not.
  right: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    flexShrink: 0,
    '@media (max-width: 559px)': {
      flex: '1 1 100%',
      flexDirection: 'row-reverse',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
  },
  tools: { display: 'flex', alignItems: 'center', color: tokens.colorNeutralForeground3 },
  date: { color: tokens.colorNeutralForeground3, whiteSpace: 'nowrap' },
  collapsed: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    width: '100%',
    minHeight: '80px',
    padding: tokens.spacingHorizontalM,
    border: 'none',
    textAlign: 'left',
    backgroundColor: tokens.colorNeutralBackground2,
    color: tokens.colorNeutralForeground1,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    ':hover': { backgroundColor: tokens.colorNeutralBackground2Hover },
  },
  ellipsis: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  preview: { color: tokens.colorNeutralForeground3 },
  atts: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS} 64px`,
  },
  att: {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    width: '260px',
    height: '48px',
    padding: `0 ${tokens.spacingHorizontalS}`,
    gap: tokens.spacingHorizontalS,
  },
  attText: { minWidth: 0, flexGrow: 1 },
  attName: {
    color: tokens.colorNeutralForeground2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  attSize: {
    fontSize: tokens.fontSizeBase100,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalM} 64px`,
  },
  indent: {
    paddingLeft: '64px',
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
  },
});

/** Display names of a recipient list (at most four); each name carries its address as a tooltip. */
function Names({ list }: { list: Recipient[] | undefined }): ReactElement {
  const people = (list ?? []).map(person);
  return (
    <span>
      {people.slice(0, 4).map((p, i) => (
        <span key={`${p.address}-${i}`} title={p.address}>
          {i > 0 ? '; ' : ''}
          {p.label}
        </span>
      ))}
      {people.length > 4 ? `; +${people.length - 4} more` : ''}
    </span>
  );
}

function Attachments({ items }: { items: MailAttachment[] }): ReactElement {
  const s = useStyles();
  return (
    <div className={s.atts} role="list" aria-label="Attachments">
      {items.map((a, i) => (
        <Card key={a.id ?? i} className={s.att} size="small" appearance="outline" role="listitem">
          <Document20Regular />
          <div className={s.attText}>
            <div className={s.attName}>{a.name || '(unnamed)'}</div>
            <div className={s.attSize}>{formatSize(a.size)}</div>
          </div>
          <ChevronDown20Regular aria-hidden />
        </Card>
      ))}
    </div>
  );
}

interface CardProps {
  msg: MailMessage;
  onPatch: (patch: Partial<MailMessage>) => void;
  onDraft: (draft: MailMessage) => void;
  onRemoved: () => void;
  onCollapse?: () => void;
}

/** One expanded message: header, action icons, body, attachments and reply buttons. */
function MessageCard({ msg, onPatch, onDraft, onRemoved, onCollapse }: CardProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const { busy, error, run } = useAction();
  const [loadingBody, setLoadingBody] = useState(false);
  const [bodyError, setBodyError] = useState('');
  const id = msg.id;
  const p = person(msg.from ?? msg.sender);
  const flagged = msg.flag?.flagStatus === 'flagged';
  const unread = msg.isRead === false;
  const hasBody = typeof msg.body?.content === 'string';

  // Lazy body: fetched only when this card is shown and the list result had none.
  useEffect(() => {
    if (hasBody || msg.isDraft || !id || !api.can('get')) return;
    let live = true;
    setLoadingBody(true);
    api
      .getMessage(id)
      .then((full) => live && onPatch(full))
      .catch((e: Error) => live && setBodyError(`Could not load the message: ${e.message}`))
      .finally(() => live && setLoadingBody(false));
    return () => {
      live = false;
    };
  }, [id, hasBody]);

  const draftFrom = (kind: 'reply' | 'replyAll' | 'forward', failure: string) => () =>
    run(async () => {
      if (id) onDraft(await api.createDraft(kind, id));
    }, failure);
  const canReply = !busy && Boolean(id);

  const openDraft = (): void =>
    run(async () => {
      if (!hasBody && id && api.can('get')) onPatch(await api.getMessage(id));
      onDraft(msg);
    }, 'Could not open the draft');

  return (
    <Card className={s.card} appearance="outline" role="article">
      <div className={s.head}>
        <Persona
          className={s.who}
          size="large"
          name={p.label}
          avatar={{ color: 'colorful', size: 40 }}
          primaryText={
            <span>
              {p.label}
              {p.name && p.name !== p.address && <span className={s.addr}>{`<${p.address}>`}</span>}
              {msg.importance === 'high' && (
                <span className={s.mark} title="High importance">
                  <Important16Filled />
                </span>
              )}
              {flagged && (
                <span className={s.mark} title="Flagged">
                  <Flag16Filled />
                </span>
              )}
            </span>
          }
          secondaryText={{
            className: s.secondary,
            children: (
              <span className={s.to}>
                <Person16Regular />
                <Names list={msg.toRecipients} />
              </span>
            ),
          }}
        />
        <div className={s.right}>
          <div className={s.tools}>
            <IconButton
              label="React (not available)"
              icon={<EmojiSmileSlight20Regular />}
              disabled
            />
            <IconButton
              label="Reply"
              icon={<ArrowReply20Regular />}
              disabled={!canReply || !api.can('reply')}
              onClick={draftFrom('reply', 'Could not create the reply draft')}
            />
            <IconButton
              label="Reply all"
              icon={<ArrowReplyAll20Regular />}
              disabled={!canReply || !api.can('replyAll')}
              onClick={draftFrom('replyAll', 'Could not create the reply-all draft')}
            />
            <IconButton
              label="Forward"
              icon={<ArrowForward20Regular />}
              disabled={!canReply || !api.can('forward')}
              onClick={draftFrom('forward', 'Could not create the forward draft')}
            />
            <Menu positioning="below-end">
              <MenuTrigger disableButtonEnhancement>
                <IconButton label="More actions" icon={<MoreHorizontal20Regular />} />
              </MenuTrigger>
              <MenuPopover>
                <MenuList>
                  <MenuItem
                    icon={unread ? <MailRead20Regular /> : <Mail20Regular />}
                    disabled={busy || !id || !api.can('update')}
                    onClick={() =>
                      run(async () => {
                        await api.update(id ?? '', { isRead: unread });
                        onPatch({ isRead: unread });
                      }, 'Could not change read state')
                    }
                  >
                    {unread ? 'Mark as read' : 'Mark as unread'}
                  </MenuItem>
                  <MenuItem
                    icon={<Flag16Filled />}
                    disabled={busy || !id || !api.can('update')}
                    onClick={() =>
                      run(async () => {
                        const status = flagged ? 'notFlagged' : 'flagged';
                        await api.update(id ?? '', { flag: { flagStatus: status } });
                        onPatch({ flag: { flagStatus: status } });
                      }, 'Could not change the flag')
                    }
                  >
                    {flagged ? 'Remove flag' : 'Flag'}
                  </MenuItem>
                  <MenuItem
                    icon={<Archive20Regular />}
                    disabled={busy || !id || !api.can('move')}
                    onClick={() =>
                      run(async () => {
                        await api.move(id ?? '', 'archive');
                        onRemoved();
                      }, 'Could not archive the message')
                    }
                  >
                    Archive
                  </MenuItem>
                  <MenuItem
                    icon={<Delete20Regular />}
                    disabled={busy || !id || !api.can('discard')}
                    onClick={() =>
                      run(async () => {
                        await api.call('discard', { messageId: id, confirm: true });
                        onRemoved();
                      }, 'Could not delete the message')
                    }
                  >
                    Delete
                  </MenuItem>
                  {onCollapse && (
                    <MenuItem icon={<ChevronDown20Regular />} onClick={onCollapse}>
                      Collapse message
                    </MenuItem>
                  )}
                </MenuList>
              </MenuPopover>
            </Menu>
          </div>
          <div className={s.date}>
            {formatOutlookDate(msg.sentDateTime ?? msg.receivedDateTime)}
          </div>
        </div>
      </div>
      {msg.ccRecipients?.length ? (
        <div className={mergeClasses(s.to, s.indent)}>
          Cc: <Names list={msg.ccRecipients} />
        </div>
      ) : null}
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {msg.isDraft ? (
        <div className={s.indent}>
          <Button appearance="outline" icon={<Edit20Regular />} disabled={busy} onClick={openDraft}>
            Edit draft
          </Button>
        </div>
      ) : loadingBody ? (
        <Spinner size="tiny" label="Loading message…" />
      ) : bodyError ? (
        <MessageBar intent="error">
          <MessageBarBody>{bodyError}</MessageBarBody>
        </MessageBar>
      ) : (
        <MessageBody
          body={msg.body}
          preview={msg.bodyPreview}
          onReportJunk={
            id && api.can('move')
              ? () =>
                  run(async () => {
                    await api.move(id, 'junkemail');
                    onRemoved();
                  }, 'Could not report the message')
              : undefined
          }
        />
      )}
      {msg.attachments?.length ? (
        <Attachments items={msg.attachments} />
      ) : msg.hasAttachments ? (
        <div className={s.indent}>
          {id && api.can('get') ? (
            <Button
              appearance="outline"
              disabled={busy}
              onClick={() =>
                run(async () => {
                  onPatch(await api.getMessage(id, true));
                }, 'Could not load attachments')
              }
            >
              Show attachments
            </Button>
          ) : (
            <span className={s.addr}>
              This message has attachments. Their names were not included in the result.
            </span>
          )}
        </div>
      ) : null}
      {!msg.isDraft && (
        <div className={s.actions}>
          <Button
            appearance="outline"
            icon={<ArrowReply20Regular />}
            disabled={!canReply || !api.can('reply')}
            onClick={draftFrom('reply', 'Could not create the reply draft')}
          >
            Reply
          </Button>
          <Button
            appearance="outline"
            icon={<ArrowForward20Regular />}
            disabled={!canReply || !api.can('forward')}
            onClick={draftFrom('forward', 'Could not create the forward draft')}
          >
            Forward
          </Button>
        </div>
      )}
    </Card>
  );
}

/** Newest messages shown before older ones fold behind "Show N earlier messages". */
export const THREAD_VISIBLE = 5;

export interface ReadingViewProps {
  initial: MailMessage[];
  /** Shows a back button in the subject bar. */
  onBack?: () => void;
  /** Called after read state, flag or the message set changed. */
  onChange?: (conversation: Conversation) => void;
  /** Called after a message was deleted or moved away. */
  onDeleted?: (message: MailMessage) => void;
  /** Load the rest of the conversation as soon as the view opens. */
  autoLoadConversation?: boolean;
  /** The message to show expanded (the one that was clicked); defaults to the newest. */
  focusId?: string;
}

/**
 * The reading view. Messages are listed newest first; the focused (or newest) one is expanded and
 * every other one is a one-line card that expands on click. A long thread shows its newest few
 * and folds the rest.
 */
export function ReadingView({
  initial,
  onBack,
  onChange,
  onDeleted,
  autoLoadConversation,
  focusId,
}: ReadingViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [messages, setMessages] = useState<MailMessage[]>(initial);
  const conv = useMemo(
    () => buildConversation(messages[0]?.conversationId || messages[0]?.id || 'single', messages),
    [messages]
  );
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set([focusId ?? conv.latest.id ?? ''])
  );
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<MailMessage | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(false);
  const notify = useRef(onChange);
  notify.current = onChange;

  const loadConversation = (): void => {
    const key = messages[0]?.conversationId;
    if (!key || !api.can('list')) return;
    setLoading(true);
    setLoadError('');
    Promise.all([api.loadConversation(key), api.ensureFolders()])
      .then(([all]) => {
        if (!all.length) return;
        // Keep the already-loaded objects (they may carry a body or edits) where ids match.
        setMessages((current) => {
          const known = new Map(current.map((m) => [m.id, m]));
          return all.map((m) => ({ ...m, ...known.get(m.id) }));
        });
      })
      .catch((e: Error) => setLoadError(`Could not load the conversation: ${e.message}`))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    if (autoLoadConversation) loadConversation();
  }, []);
  useEffect(() => {
    notify.current?.(conv);
  }, [conv]);

  const keyOf = (m: MailMessage): string => m.id ?? '';
  const patch = (key: string, change: Partial<MailMessage>): void =>
    setMessages((cur) => cur.map((m) => (keyOf(m) === key ? { ...m, ...change } : m)));
  const remove = (m: MailMessage): void => {
    onDeleted?.(m);
    const rest = messages.filter((x) => keyOf(x) !== keyOf(m));
    if (!rest.length) onBack?.();
    else setMessages(rest);
  };
  const toggle = (key: string, open: boolean): void =>
    setExpanded((cur) => {
      const next = new Set(cur);
      if (open) next.add(key);
      else next.delete(key);
      return next;
    });

  const newestFirst = [...conv.messages].reverse();
  let shown = newestFirst;
  let hiddenCount = 0;
  if (!showAll && newestFirst.length > THREAD_VISIBLE) {
    shown = newestFirst.slice(0, THREAD_VISIBLE);
    // A focused older message stays visible even when it falls outside the newest few.
    const focus = newestFirst.find((m) => expanded.has(keyOf(m)) && !shown.includes(m));
    if (focus) shown = [...shown, focus];
    hiddenCount = newestFirst.length - shown.length;
  }
  const canLoad =
    !autoLoadConversation &&
    conv.messages.length === 1 &&
    Boolean(conv.messages[0].conversationId) &&
    api.can('list');

  return (
    <div className={s.stack}>
      <div className={s.subject} data-sticky="top">
        {onBack && (
          <IconButton label="Back to list" icon={<ArrowLeft20Regular />} onClick={onBack} />
        )}
        <Subtitle2 as="h1" className={s.grow} style={{ margin: `${tokens.spacingVerticalXS} 0` }}>
          {conv.subject}
        </Subtitle2>
        {canLoad && (
          <Button appearance="outline" disabled={loading} onClick={loadConversation}>
            Show conversation
          </Button>
        )}
      </div>
      {draft && <Composer draft={draft} showOriginal={false} onClose={() => setDraft(null)} />}
      {loading && <Spinner size="tiny" label="Loading conversation…" />}
      {loadError && (
        <MessageBar intent="error">
          <MessageBarBody>{loadError}</MessageBarBody>
        </MessageBar>
      )}
      {shown.map((m) => {
        const key = keyOf(m);
        if (expanded.has(key)) {
          return (
            <MessageCard
              key={key}
              msg={m}
              onPatch={(change) => patch(key, change)}
              onDraft={setDraft}
              onRemoved={() => remove(m)}
              onCollapse={conv.messages.length > 1 ? () => toggle(key, false) : undefined}
            />
          );
        }
        const p = person(m.from ?? m.sender);
        return (
          <Card key={key} className={s.card} appearance="subtle" role="article">
            <button
              type="button"
              className={s.collapsed}
              aria-expanded="false"
              aria-label={`${p.label}, ${formatListTime(m.receivedDateTime)}. Expand message`}
              onClick={() => toggle(key, true)}
            >
              <Avatar size={40} name={p.label} color="colorful" aria-hidden />
              <span className={s.grow}>
                <span className={s.ellipsis} style={{ display: 'block' }}>
                  {p.label}
                </span>
                <span className={`${s.ellipsis} ${s.preview}`} style={{ display: 'block' }}>
                  {(m.bodyPreview ?? '').replace(/\s+/g, ' ')}
                </span>
              </span>
              <span className={s.date}>{formatOutlookDate(m.receivedDateTime)}</span>
            </button>
          </Card>
        );
      })}
      {hiddenCount > 0 && (
        <div className={s.actions} style={{ paddingLeft: tokens.spacingHorizontalM }}>
          <Button
            appearance="outline"
            icon={<ChevronDown20Regular />}
            onClick={() => setShowAll(true)}
          >
            {`Show ${hiddenCount} earlier ${hiddenCount === 1 ? 'message' : 'messages'}`}
          </Button>
        </div>
      )}
    </div>
  );
}
