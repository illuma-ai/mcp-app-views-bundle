/**
 * A Teams conversation (chat or channel): header, message bubbles, threaded replies for channels
 * and the composer. Others' messages sit left in grey bubbles under a "Name  time" line; mine sit
 * right in a tinted bubble under the time.
 *
 * Sending is an App-initiated tool call from the Send button (or Ctrl+Enter), so the host asks the
 * user to approve it with the full arguments. Nothing is sent implicitly and no draft is kept.
 */
import {
  Avatar,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  Tab,
  TabList,
  Textarea,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import {
  Add20Regular,
  ArrowLeft20Regular,
  Attach20Regular,
  Document20Regular,
  MoreHorizontal20Regular,
  Share20Regular,
  Compose20Regular,
  ChatMultiple20Regular,
  EmojiSmileSlight20Regular,
  Send20Filled,
  TextFont20Regular,
} from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { hostTimeZone } from '../lib/format.js';
import { sanitizeHtml } from '../lib/sanitize.js';
import { SELF_CHAT_MESSAGE, onlyMe, onlySelfAliases } from '../../lib/self-chat.js';
import { chatTime, conversationOrder, messageText, reactionSummary } from '../teams/logic.js';
import {
  FALLBACK_CHAT_TITLES,
  chatKind,
  attachmentLabel,
  chatTitle,
  isAttachmentOnly,
  senderName,
  titleFromMessages,
} from '../teams/logic.js';
import type { Chat, ChatMessage, ComposeProposal, ConversationTarget } from '../teams/types.js';
import type { Page } from '../mail/types.js';
import { ChatAvatar } from './ChatAvatar.js';
import { IconButton, useAction, useApi } from './shared.js';

const useStyles = makeStyles({
  app: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    minHeight: '56px',
    padding: `0 ${tokens.spacingHorizontalM}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  title: { fontWeight: tokens.fontWeightBold, fontSize: '18px', lineHeight: '24px' },
  grow: { flexGrow: 1, minWidth: 0 },
  list: {
    backgroundColor: tokens.colorNeutralBackground5,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
  },
  other: {
    display: 'grid',
    gridTemplateColumns: '32px minmax(0, 1fr)',
    columnGap: tokens.spacingHorizontalM,
    alignItems: 'start',
  },
  meta: {
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
    marginBottom: tokens.spacingVerticalXXS,
  },
  name: { color: tokens.colorNeutralForeground2, marginRight: tokens.spacingHorizontalS },
  bubble: {
    display: 'inline-block',
    maxWidth: '85%',
    boxSizing: 'border-box',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    borderRadius: tokens.borderRadiusXLarge,
    // The card: one layer above the pane (see dark-theme.ts).
    backgroundColor: tokens.colorNeutralBackground6,
    overflowWrap: 'anywhere',
    '& p': { margin: 0 },
    '& a': { color: tokens.colorBrandForegroundLink },
  },
  mine: { backgroundColor: tokens.colorBrandBackground2 },
  mineRow: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end' },
  chips: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: tokens.spacingHorizontalXS,
    marginTop: tokens.spacingVerticalXS,
  },
  chip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXXS,
    padding: `0 ${tokens.spacingHorizontalS}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    fontSize: tokens.fontSizeBase200,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  thread: {
    marginLeft: '44px',
    paddingLeft: tokens.spacingHorizontalM,
    borderLeft: `2px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  // The real compose box: a 1px neutral border and a 6px radius; hover changes nothing; focus keeps the
  // border and adds a 2px brand line along the inside bottom (never a bottom border on the field).
  // One bordered box holds the field and the tool icons on one line (the icons drop to the bottom-right
  // corner as the text grows); rest, hover and focus styles live here, never on the inner field.
  composerRow: { display: 'flex', alignItems: 'flex-end' },
  composer: {
    margin: tokens.spacingHorizontalM,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusLarge,
    backgroundColor: tokens.colorNeutralBackground1,
    ':focus-within': { boxShadow: `inset 0 -4px 0 -2px ${tokens.colorCompoundBrandStroke}` },
  },
  // One line is 38px: 10px above, 8px below, 16px right, 12px left around a 20px line.
  input: {
    padding: '10px 16px 8px 12px',
    minHeight: '38px',
    boxSizing: 'border-box',
    lineHeight: '20px',
  },
  // The field itself draws nothing: Fluent's hover and focus borders and its bottom accent are off.
  bare: {
    border: 'none',
    boxShadow: 'none',
    backgroundColor: 'transparent',
    '::after': { display: 'none' },
    ':hover': { border: 'none', boxShadow: 'none' },
    ':focus-within': { border: 'none', boxShadow: 'none', outlineStyle: 'none' },
    flexGrow: 1,
    minWidth: 0,
  },
  tools: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
    minHeight: '38px',
    padding: `0 ${tokens.spacingHorizontalXS}`,
  },
  // A shared file is a bordered card, 48px high at its header, like the real one.
  fileCard: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    boxSizing: 'border-box',
    minHeight: '48px',
    maxWidth: '352px',
    padding: `0 ${tokens.spacingHorizontalS} 0 ${tokens.spacingHorizontalM}`,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  fileName: {
    flexGrow: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  welcome: {
    display: 'grid',
    justifyItems: 'center',
    rowGap: tokens.spacingVerticalXS,
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
  },
  welcomeTitle: { fontSize: tokens.fontSizeBase400, fontWeight: tokens.fontWeightBold },
  postRow: { display: 'flex', padding: tokens.spacingHorizontalM },
  sendIcon: { color: tokens.colorBrandForeground1 },
  state: {
    padding: tokens.spacingHorizontalXL,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

/** Mounts a sanitised message body (rebuilt from an allowlist; never an HTML string). */
function Body({ message }: { message: ChatMessage }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const html =
    message.body?.contentType?.toLowerCase() === 'html' ? message.body.content : undefined;
  const node = useMemo(() => (html === undefined ? null : sanitizeHtml(html).node), [html]);
  useEffect(() => {
    if (node) ref.current?.replaceChildren(node);
  }, [node]);
  if (html === undefined)
    return <span style={{ whiteSpace: 'pre-wrap' }}>{messageText(message)}</span>;
  return <div ref={ref} />;
}

function Bubble({
  message,
  mine,
  name,
}: {
  message: ChatMessage;
  mine: boolean;
  name: string;
}): ReactElement {
  const s = useStyles();
  const zone = hostTimeZone();
  const time = chatTime(message.createdDateTime, undefined, zone);
  const reactions = reactionSummary(message);
  const bubble = (
    <>
      {!isAttachmentOnly(message) && (
        <div className={mergeClasses(s.bubble, mine && s.mine)}>
          <Body message={message} />
        </div>
      )}
      {(reactions.length > 0 || (message.attachments?.length ?? 0) > 0) && (
        <div className={s.chips}>
          {reactions.map((r) => (
            <span key={r.emoji} className={s.chip} title="Reaction">
              {r.emoji} {r.count}
            </span>
          ))}
          {(message.attachments ?? []).map((a, i) =>
            a.contentType === 'reference' ? (
              <div
                key={a.id ?? i}
                className={s.fileCard}
                role="group"
                aria-label={attachmentLabel(a)}
              >
                <Document20Regular />
                <span className={s.fileName}>{attachmentLabel(a)}</span>
                <IconButton label="Share (not available)" icon={<Share20Regular />} disabled />
                <IconButton
                  label="More (not available)"
                  icon={<MoreHorizontal20Regular />}
                  disabled
                />
              </div>
            ) : (
              <span key={a.id ?? i} className={s.chip}>
                <Attach20Regular /> {attachmentLabel(a)}
              </span>
            )
          )}
        </div>
      )}
    </>
  );
  if (mine) {
    return (
      <div className={s.mineRow}>
        <div className={s.meta}>{time}</div>
        {bubble}
      </div>
    );
  }
  return (
    <div className={s.other}>
      <Avatar size={32} name={name} color="colorful" aria-hidden />
      <div>
        <div className={s.meta}>
          <span className={s.name}>{name}</span>
          {time}
        </div>
        {bubble}
      </div>
    </div>
  );
}

interface SendBoxProps {
  placeholder?: string;
  disabled?: boolean;
  onSend: (text: string) => Promise<void>;
  compact?: boolean;
  /** Text the composer starts with (a proposal for the user to review). */
  initialText?: string;
}

/** The composer. Send is the only path to a send tool; Ctrl+Enter is the same explicit gesture. */
function SendBox({
  placeholder = 'Type a message',
  disabled,
  onSend,
  compact,
  initialText = '',
}: SendBoxProps): ReactElement {
  const s = useStyles();
  const [text, setText] = useState(initialText);
  const { busy, error, run } = useAction();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // The field grows with its text (to a limit) inside the box; the box and the icons do not move.
  useLayoutEffect(() => {
    const el = fieldRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [text]);
  const send = (): void => {
    const value = text.trim();
    if (!value || busy || disabled) return;
    run(async () => {
      await onSend(value);
      setText('');
    }, 'Not sent');
  };
  return (
    <div data-sticky="bottom">
      <div className={mergeClasses(s.composerRow, !compact && s.composer)} data-composer>
        <Textarea
          root={{ className: s.bare }}
          textarea={{ className: s.input, ref: fieldRef }}
          rows={1}
          appearance="outline"
          resize="none"
          aria-label={placeholder}
          placeholder={placeholder}
          value={text}
          onChange={(_, d) => setText(d.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              send();
            }
          }}
        />
        <div className={s.tools}>
          {!compact && (
            <>
              <IconButton label="Format (not available)" icon={<TextFont20Regular />} disabled />
              <IconButton
                label="Emoji (not available)"
                icon={<EmojiSmileSlight20Regular />}
                disabled
              />
              <IconButton label="Attach (not available)" icon={<Attach20Regular />} disabled />
              <IconButton label="Loop (not available)" icon={<ChatMultiple20Regular />} disabled />
              <IconButton label="More (not available)" icon={<Add20Regular />} disabled />
            </>
          )}
          <IconButton
            label="Send"
            icon={<Send20Filled className={s.sendIcon} />}
            disabled={!text.trim() || busy || disabled}
            onClick={send}
          />
        </div>
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
    </div>
  );
}

/**
 * The composer a model's proposal opens: the conversation with the proposed text already in the
 * box. Nothing is sent until the user presses Send. A proposal that names people instead of a chat
 * is matched against the user's chats.
 */
export function ComposeView({ proposal }: { proposal: ComposeProposal }): ReactElement {
  const api = useApi();
  const [target, setTarget] = useState<ConversationTarget | null>(() =>
    proposal.chatId
      ? {
          kind: 'chat',
          chatId: proposal.chatId,
          title: proposal.title ?? 'Chat',
          titleKnown: Boolean(proposal.title),
        }
      : proposal.teamId && proposal.channelId
        ? {
            kind: 'channel',
            teamId: proposal.teamId,
            channelId: proposal.channelId,
            title: proposal.title ?? 'Channel',
          }
        : null
  );
  const [error, setError] = useState('');
  useEffect(() => {
    if (target) return;
    const wanted = (proposal.recipients ?? []).map((r) => r.trim().toLowerCase()).filter(Boolean);
    if (onlySelfAliases(wanted)) {
      setError(SELF_CHAT_MESSAGE);
      return;
    }
    if (!api.can('chatList') || wanted.length === 0) {
      setError('Open the chat in the list to send this message.');
      return;
    }
    api
      .call<Page<Chat>>('chatList', { expand: 'members', top: 25 })
      .then((page) => {
        const hits = (page.value ?? []).filter((c) => {
          const others = (c.members ?? [])
            .filter((m) => m.displayName)
            .map((m) => (m.displayName as string).toLowerCase());
          return (
            wanted.every((w) => others.some((o) => o.includes(w))) &&
            others.length - wanted.length <= 1
          );
        });
        if (hits.length === 1 && hits[0].id) {
          setTarget({
            kind: 'chat',
            chatId: hits[0].id,
            title: chatTitle(hits[0], undefined),
            titleKnown: false,
          });
        } else if (hits.length === 0 && api.can('me')) {
          // No chat found: if the recipient is the signed-in user, say why instead of "not found".
          api
            .call<{ displayName?: string; mail?: string; userPrincipalName?: string }>('me', {})
            .then((me) =>
              setError(
                onlyMe(wanted, me)
                  ? SELF_CHAT_MESSAGE
                  : 'No existing chat with those people was found. Open the chat in the list to send this message.'
              )
            )
            .catch(() =>
              setError(
                'No existing chat with those people was found. Open the chat in the list to send this message.'
              )
            );
        } else {
          setError(
            hits.length === 0
              ? 'No existing chat with those people was found. Open the chat in the list to send this message.'
              : 'More than one chat matches those people. Open the right chat in the list to send this message.'
          );
        }
      })
      .catch((e: Error) => setError(e.message));
  }, []);
  if (!target) {
    return error ? (
      <MessageBar intent="warning">
        <MessageBarBody>{error}</MessageBarBody>
      </MessageBar>
    ) : (
      <Spinner size="small" label="Opening the conversation…" />
    );
  }
  return <ConversationView target={target} initial={[]} loadOnOpen draft={proposal.text} />;
}

export interface ConversationViewProps {
  target: ConversationTarget;
  initial: ChatMessage[];
  /** Next-page link of the initial result (older messages). */
  nextLink?: string | null;
  meId?: string;
  /** The signed-in user's display name (names the self-chat). */
  meName?: string;
  onBack?: () => void;
  /** Proposed text for the composer; it is sent only when the user presses Send. */
  draft?: string;
  /** Read the newest messages on open (when the opener has none to give). */
  loadOnOpen?: boolean;
}

export function ConversationView({
  target,
  initial,
  nextLink = null,
  meId: knownMeId,
  meName: knownMeName,
  onBack,
  draft,
  loadOnOpen,
}: ConversationViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [meId, setMeId] = useState(knownMeId);
  const [meName, setMeName] = useState(knownMeName);
  useEffect(() => {
    if (meId || !api.can('me')) return;
    api
      .call<{ id?: string; displayName?: string }>('me', {})
      .then((me) => {
        setMeId(me.id);
        setMeName(me.displayName);
      })
      .catch(() => undefined);
  }, []);
  // The header name: when the opener did not know it, ask for the chat with its members.
  const [chat, setChat] = useState<Chat | null>(null);
  useEffect(() => {
    if (target.kind !== 'chat' || target.titleKnown || !api.can('chatGet')) return;
    api
      .call<Chat>('chatGet', { chatId: target.chatId, expand: 'members' })
      .then(setChat)
      .catch(() => undefined);
  }, []);
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  // One title everywhere: the chat's own naming; a chat opened with only a fallback title is named from
  // its messages (the bot's name, or "<me> (You)") once they are here.
  const fromMessages = titleFromMessages(messages, meId, meName);
  const title = chat
    ? chatTitle({ ...chat, messages }, meId, meName)
    : target.kind === 'chat' &&
        fromMessages &&
        (FALLBACK_CHAT_TITLES as readonly string[]).includes(target.title)
      ? fromMessages
      : target.title;
  const [next, setNext] = useState<string | null>(nextLink);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const seen = useRef(new Set(initial.map((m) => m.id)));
  const readRole = target.kind === 'chat' ? 'chatMessages' : 'channelMessages';
  const ids: Record<string, unknown> =
    target.kind === 'chat'
      ? { chatId: target.chatId }
      : { teamId: target.teamId, channelId: target.channelId };

  useEffect(() => {
    if (!loadOnOpen || !api.can(readRole)) return;
    setLoading(true);
    api
      .call<Page<ChatMessage>>(readRole, { ...ids, top: 25 })
      .then((page) => {
        const fresh = (page.value ?? []).filter((m) => !seen.current.has(m.id));
        fresh.forEach((m) => seen.current.add(m.id));
        setMessages((cur) => [...cur, ...fresh]);
        setNext(page['@odata.nextLink'] ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadEarlier = (): void => {
    if (!next || loading) return;
    setLoading(true);
    setError('');
    api
      .call<Page<ChatMessage>>(readRole, { ...ids, skiptoken: next })
      .then((page) => {
        const fresh = (page.value ?? []).filter((m) => !seen.current.has(m.id));
        fresh.forEach((m) => seen.current.add(m.id));
        setMessages((cur) => [...cur, ...fresh]);
        setNext(page['@odata.nextLink'] ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  };

  // A channel shows its posts with a "Post in channel" button; the composer opens when it is pressed
  // (or at once when a proposed post is waiting to be reviewed).
  const [posting, setPosting] = useState(Boolean(draft));
  const sendRole = target.kind === 'chat' ? 'chatSend' : 'channelSend';
  const send = async (text: string): Promise<void> => {
    const created = await api.call<ChatMessage>(sendRole, {
      ...ids,
      body: { body: { contentType: 'text', content: text } },
      confirm: true,
    });
    const local: ChatMessage = created?.id
      ? created
      : {
          id: `local-${Date.now()}`,
          createdDateTime: new Date().toISOString(),
          from: { user: { id: meId, displayName: 'You' } },
          body: { contentType: 'text', content: text },
        };
    seen.current.add(local.id);
    setMessages((cur) => [...cur, local]);
  };

  const ordered = useMemo(() => conversationOrder(messages), [messages]);
  return (
    <div className={s.app}>
      <div className={s.head} data-sticky="top">
        {onBack && <IconButton label="Back" icon={<ArrowLeft20Regular />} onClick={onBack} />}
        <ChatAvatar
          kind={
            target.kind === 'chat'
              ? chatKind(chat ? { ...chat, messages } : { messages }, undefined)
              : 'group'
          }
          name={title}
          size={32}
        />
        <span className={mergeClasses(s.title, s.grow)}>{title}</span>
        <TabList selectedValue="chat" size="small">
          <Tab value="chat">{target.kind === 'chat' ? 'Chat' : 'Posts'}</Tab>
          {(target.kind === 'channel'
            ? ['Shared', 'Page', 'Notes']
            : ['Shared', 'Notes', 'Recap']
          ).map((name) => (
            <Tab key={name} value={name.toLowerCase()} disabled title="Not available in this view">
              {name}
            </Tab>
          ))}
        </TabList>
      </div>
      <div className={s.list} role="log" aria-label="Messages">
        {next && (
          <Button
            appearance="outline"
            size="small"
            disabled={loading || !api.can(readRole)}
            onClick={loadEarlier}
            style={{ alignSelf: 'center' }}
          >
            Load earlier messages
          </Button>
        )}
        {loading && <Spinner size="tiny" />}
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        {ordered.length === 0 &&
          !loading &&
          (target.kind === 'channel' ? (
            <div className={s.welcome}>
              <span className={s.welcomeTitle}>Welcome to your new team!</span>
              <span>You got the group together. Go do things!</span>
            </div>
          ) : (
            <p className={s.state}>No messages yet.</p>
          ))}
        {ordered.map((m, i) => (
          <div key={m.id ?? i}>
            <Bubble
              message={m}
              mine={Boolean(meId && m.from?.user?.id === meId)}
              name={senderName(m)}
            />
            {target.kind === 'channel' && m.id && !m.id.startsWith('local-') && (
              <ChannelThread target={target} root={m} meId={meId} />
            )}
          </div>
        ))}
      </div>
      {target.kind === 'channel' && !posting ? (
        <div className={s.postRow}>
          <Button
            appearance="primary"
            icon={<Compose20Regular />}
            disabled={!api.can(sendRole)}
            onClick={() => setPosting(true)}
          >
            Post in channel
          </Button>
        </div>
      ) : (
        <SendBox
          disabled={!api.can(sendRole)}
          onSend={send}
          initialText={draft}
          placeholder={target.kind === 'channel' ? 'Start a new post' : undefined}
        />
      )}
    </div>
  );
}

/** A channel thread with a working reply box. */
function ChannelThread({
  target,
  root,
  meId,
}: {
  target: Extract<ConversationTarget, { kind: 'channel' }>;
  root: ChatMessage;
  meId?: string;
}): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [replies, setReplies] = useState<ChatMessage[] | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const ids = { teamId: target.teamId, channelId: target.channelId, chatMessageId: root.id };
  const load = (): void => {
    setOpen(true);
    if (replies) return;
    setLoading(true);
    api
      .call<Page<ChatMessage>>('channelReplies', ids)
      .then((page) => setReplies(page.value ?? []))
      .catch((e: Error) => setError(`Could not load the replies: ${e.message}`))
      .finally(() => setLoading(false));
  };
  const reply = async (text: string): Promise<void> => {
    const created = await api.call<ChatMessage>('channelReply', {
      ...ids,
      body: { body: { contentType: 'text', content: text } },
      confirm: true,
    });
    setReplies((cur) => [
      ...(cur ?? []),
      created?.id
        ? created
        : {
            id: `local-${Date.now()}`,
            createdDateTime: new Date().toISOString(),
            from: { user: { id: meId } },
            body: { contentType: 'text', content: text },
          },
    ]);
  };
  return (
    <div className={s.thread}>
      {!open ? (
        <Button
          appearance="transparent"
          size="small"
          disabled={!api.can('channelReplies')}
          onClick={load}
          style={{ alignSelf: 'flex-start' }}
        >
          Replies
        </Button>
      ) : (
        <>
          {loading && <Spinner size="tiny" />}
          {error && <span className={s.meta}>{error}</span>}
          {replies && (
            <span className={s.meta}>
              {replies.length === 1 ? '1 reply' : `${replies.length} replies`}
            </span>
          )}
          {conversationOrder(replies ?? []).map((m, i) => (
            <Bubble
              key={m.id ?? i}
              message={m}
              mine={Boolean(meId && m.from?.user?.id === meId)}
              name={senderName(m)}
            />
          ))}
          <SendBox
            compact
            placeholder="Reply in thread"
            disabled={!api.can('channelReply')}
            onSend={reply}
          />
        </>
      )}
    </div>
  );
}
