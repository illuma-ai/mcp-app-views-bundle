/**
 * Teams chat list: "Chat" header, filter pills (Unread, Channels, Chats), the Chats section and a
 * Teams and channels section. Opening a chat or channel is an App-initiated read; nothing here
 * writes. The unread state comes from the chat's read marker, so it needs the list to include
 * lastMessagePreview and viewpoint (the view requests both when it fetches).
 */
import {
  Avatar,
  Button,
  MessageBar,
  MessageBarBody,
  Spinner,
  makeStyles,
  mergeClasses,
  tokens,
} from '@fluentui/react-components';
import { ChevronDown16Regular, ChevronRight16Regular } from '@fluentui/react-icons';
import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Page } from '../mail/types.js';
import { ChatAvatar } from './ChatAvatar.js';
import {
  BOT_CHAT_TITLE,
  FALLBACK_CHAT_TITLES,
  applicationInMessages,
  hasApplicationSender,
  chatKind,
  chatTime,
  chatTitle,
  isUnread,
  needsNameLookup,
  previewText,
  sortChats,
} from '../teams/logic.js';
import type { Channel, Chat, ChatMessage, ConversationTarget, Team } from '../teams/types.js';
import { ConversationView } from './ConversationView.js';
import { NARROW_PX, useApi, useNarrower } from './shared.js';
import { hostTimeZone } from '../lib/format.js';

/** Concurrent chat-name lookups: the host rate-limits app tool calls, so they are not all at once. */
const LOOKUP_PARALLEL = 3;

const useStyles = makeStyles({
  app: { backgroundColor: tokens.colorNeutralBackground1, color: tokens.colorNeutralForeground1 },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalXS}`,
  },
  title: { fontWeight: tokens.fontWeightBold, fontSize: '18px', lineHeight: '24px' },
  // 24px filter pills, 12px text, a 1px stroke border and secondary text.
  pill: {
    minHeight: '24px',
    height: '24px',
    padding: '0 8px',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightRegular,
    color: tokens.colorNeutralForeground2,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  // The compact list (narrow frames): one 32px line per chat, no preview.
  compact: { minHeight: '32px', paddingTop: 0, paddingBottom: 0 },
  pills: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  section: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
    width: '100%',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    border: 'none',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    fontWeight: tokens.fontWeightSemibold,
    textAlign: 'left',
    cursor: 'pointer',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '20px minmax(0, 1fr) auto',
    columnGap: tokens.spacingHorizontalS,
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box',
    minHeight: '56px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    border: 'none',
    backgroundColor: 'transparent',
    color: tokens.colorNeutralForeground1,
    fontFamily: tokens.fontFamilyBase,
    fontSize: tokens.fontSizeBase300,
    textAlign: 'left',
    cursor: 'pointer',
    ':hover': { backgroundColor: tokens.colorNeutralBackground1Hover },
  },
  unread: { fontWeight: tokens.fontWeightBold },
  ellipsis: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  preview: { color: tokens.colorNeutralForeground3, fontSize: tokens.fontSizeBase200 },
  time: {
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    whiteSpace: 'nowrap',
  },
  indent: { paddingLeft: '36px' },
  state: {
    padding: `${tokens.spacingVerticalXXL} ${tokens.spacingHorizontalL}`,
    textAlign: 'center',
    color: tokens.colorNeutralForeground3,
  },
});

type Pill = 'unread' | 'channels' | 'chats';

export interface ChatsViewProps {
  args: Record<string, unknown>;
  result?: Page<Chat & Team & Channel>;
  error?: string;
  received: boolean;
}

export function ChatsView({
  args,
  result,
  error: resultError,
  received,
}: ChatsViewProps): ReactElement {
  const s = useStyles();
  const api = useApi();
  const [meId, setMeId] = useState<string | undefined>();
  const [meName, setMeName] = useState<string | undefined>();
  // Bot chats and the self-chat both list only the signed-in user as a member; the application that
  // posted in a chat names it. Per chat id: the name found, or null when no application ever posted
  // (the self-chat). Looked up once per chat, in parallel, after the first paint.
  // A name; BOT_CHAT_TITLE when an application posted without a name; null when none ever did;
  // false when the lookup failed (never guessed as the self-chat).
  const [appNames, setAppNames] = useState<Record<string, string | null | false>>({});
  const asked = useRef(new Set<string>());
  const narrow = useNarrower(NARROW_PX);
  const [chats, setChats] = useState<Chat[]>([]);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [channels, setChannels] = useState<Record<string, Channel[]>>({});
  const [pill, setPill] = useState<Pill | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [openTeams, setOpenTeams] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<
    null | { target: ConversationTarget; messages: ChatMessage[]; next: string | null } | 'loading'
  >(null);
  const zone = hostTimeZone();

  useEffect(() => {
    if (!api.can('me')) return;
    // Retried with a back-off: the host rate-limits app tool calls, and the titles need to know who
    // "me" is.
    let live = true;
    void (async () => {
      for (let attempt = 0; attempt < 4 && live; attempt++) {
        try {
          const me = await api.call<{ id?: string; displayName?: string }>('me', {});
          if (live) {
            setMeId(me.id);
            setMeName(me.displayName);
          }
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 500 * (attempt + 1) ** 2));
        }
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  // The tool result that created this view: chats, teams or one team's channels.
  useEffect(() => {
    if (!received) return;
    if (resultError) {
      setError(resultError);
      return;
    }
    const items = result?.value ?? [];
    setError(null);
    if (items.length && (items[0] as Chat).chatType) {
      setChats(items as Chat[]);
      // The model's own call may have left out the members and the last message, which the names
      // and unread state come from, so the view asks for them itself.
      const expand = typeof args.expand === 'string' ? args.expand : '';
      if (
        api.can('chatList') &&
        !(expand.includes('members') && expand.includes('lastMessagePreview'))
      ) {
        api
          .call<Page<Chat>>('chatList', {
            expand: 'members,lastMessagePreview',
            orderby: 'lastMessagePreview/createdDateTime desc',
            top: 25,
          })
          .then((page) => {
            if (Array.isArray(page.value) && page.value.length) setChats(page.value);
          })
          .catch(() => undefined);
      }
    } else if (typeof args.teamId === 'string')
      setChannels((cur) => ({ ...cur, [args.teamId as string]: items as Channel[] }));
    else {
      setTeams(items as Team[]);
      setPill('channels');
    }
  }, [result, resultError, received]);

  // SCALE: bounded to the unresolved one-member chats of the first page (25); at most LOOKUP_PARALLEL
  // calls at a time (the host rate-limits app tool calls), a failed call is retried with a back-off
  // before the chat is left unresolved.
  useEffect(() => {
    if (!api.can('chatMessages')) return;
    const queue = chats.filter(
      (c) => c.id && !asked.current.has(c.id) && needsNameLookup(c, meId, meName)
    );
    for (const c of queue) asked.current.add(c.id as string);
    const lookup = async (id: string): Promise<void> => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const page = await api.call<Page<ChatMessage>>('chatMessages', { chatId: id, top: 20 });
          const messages = page.value ?? [];
          const name =
            applicationInMessages(messages) ??
            (hasApplicationSender(messages) ? BOT_CHAT_TITLE : null);
          setAppNames((cur) => ({ ...cur, [id]: name }));
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 600 * (attempt + 1) ** 2));
        }
      }
      setAppNames((cur) => ({ ...cur, [id]: false }));
    };
    const worker = async (): Promise<void> => {
      for (let c = queue.shift(); c; c = queue.shift()) await lookup(c.id as string);
    };
    for (let i = 0; i < LOOKUP_PARALLEL; i++) void worker();
  }, [chats, meId, meName]);

  /** The title of a chat: while an unresolved one-member chat is being looked up, a placeholder. */
  const titleOf = (chat: Chat): string => {
    const found = chat.id ? appNames[chat.id] : undefined;
    if (found) return found;
    if (found === false) return FALLBACK_CHAT_TITLES[0];
    if (found === undefined && api.can('chatMessages') && needsNameLookup(chat, meId, meName))
      return '…';
    return chatTitle(chat, meId, meName);
  };

  const guard = (task: () => Promise<void>): void => {
    if (busy) return;
    setBusy(true);
    setError(null);
    task()
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const showChannels = (): void => {
    setPill(pill === 'channels' ? null : 'channels');
    if (!teams && api.can('teamsList'))
      guard(async () => setTeams((await api.call<Page<Team>>('teamsList', {})).value ?? []));
  };

  const toggleTeam = (id: string): void => {
    const next = new Set(openTeams);
    if (next.has(id)) next.delete(id);
    else {
      next.add(id);
      if (!channels[id] && api.can('channelsList')) {
        guard(async () => {
          const page = await api.call<Page<Channel>>('channelsList', { teamId: id });
          setChannels((cur) => ({ ...cur, [id]: page.value ?? [] }));
        });
      }
    }
    setOpenTeams(next);
  };

  const openChat = (chat: Chat): void => {
    if (!chat.id) return;
    setOpen('loading');
    api
      .call<Page<ChatMessage>>('chatMessages', { chatId: chat.id, top: 25 })
      .then((page) => {
        const messages = page.value ?? [];
        const target: ConversationTarget = {
          kind: 'chat',
          chatId: chat.id as string,
          // The messages settle a one-member chat: the bot that posted in it, else the self-chat.
          title: chatTitle({ ...chat, messages }, meId, meName),
          titleKnown: true,
        };
        setOpen({ target, messages, next: page['@odata.nextLink'] ?? null });
      })
      .catch((e: Error) => {
        setError(`Could not open the chat: ${e.message}`);
        setOpen(null);
      });
  };

  const openChannel = (teamId: string, channel: Channel): void => {
    if (!channel.id) return;
    const target: ConversationTarget = {
      kind: 'channel',
      teamId,
      channelId: channel.id,
      title: channel.displayName ?? 'Channel',
    };
    setOpen('loading');
    api
      .call<Page<ChatMessage>>('channelMessages', { teamId, channelId: channel.id, top: 25 })
      .then((page) =>
        setOpen({ target, messages: page.value ?? [], next: page['@odata.nextLink'] ?? null })
      )
      .catch((e: Error) => {
        setError(`Could not open the channel: ${e.message}`);
        setOpen(null);
      });
  };

  if (open === 'loading')
    return (
      <div className={s.app}>
        <Spinner label="Opening…" />
      </div>
    );
  if (open)
    return (
      <ConversationView
        target={open.target}
        initial={open.messages}
        nextLink={open.next}
        meId={meId}
        meName={meName}
        onBack={() => setOpen(null)}
      />
    );

  const sorted = sortChats(chats);
  const visibleChats = pill === 'unread' ? sorted.filter(isUnread) : sorted;
  const showChats = pill !== 'channels';
  const showTeams = pill === 'channels' || (pill === null && teams !== null);
  const toggle = (name: string): void =>
    setCollapsed((cur) => {
      const n = new Set(cur);
      if (n.has(name)) n.delete(name);
      else n.add(name);
      return n;
    });
  const pillButton = (
    value: Pill,
    label: string,
    onClick: () => void,
    disabled = false
  ): ReactElement => (
    <Button
      shape="circular"
      size="small"
      className={pill === value ? undefined : s.pill}
      appearance={pill === value ? 'primary' : 'outline'}
      aria-pressed={pill === value}
      disabled={disabled}
      onClick={onClick}
    >
      {label}
    </Button>
  );

  return (
    <div className={s.app}>
      <div className={s.head} data-sticky="top">
        <span className={s.title} role="heading" aria-level={1}>
          Chat
        </span>
      </div>
      <div className={s.pills} data-sticky="top" role="group" aria-label="Filter">
        {pillButton('unread', 'Unread', () => setPill(pill === 'unread' ? null : 'unread'))}
        {pillButton('channels', 'Channels', showChannels, !api.can('teamsList') && teams === null)}
        {pillButton('chats', 'Chats', () => setPill(pill === 'chats' ? null : 'chats'))}
      </div>
      {error && (
        <MessageBar intent="error">
          <MessageBarBody>{error}</MessageBarBody>
        </MessageBar>
      )}
      {busy && <Spinner size="tiny" />}
      {showChats && (
        <>
          <button
            type="button"
            className={s.section}
            aria-expanded={!collapsed.has('Chats')}
            onClick={() => toggle('Chats')}
          >
            {collapsed.has('Chats') ? <ChevronRight16Regular /> : <ChevronDown16Regular />}
            Chats
          </button>
          {!collapsed.has('Chats') &&
            (visibleChats.length ? (
              visibleChats.map((c, i) => {
                const unread = isUnread(c);
                return (
                  <button
                    key={c.id ?? i}
                    type="button"
                    className={mergeClasses(s.row, narrow && s.compact)}
                    onClick={() => openChat(c)}
                    aria-label={`${unread ? 'Unread. ' : ''}${titleOf(c)}`}
                  >
                    <ChatAvatar
                      kind={chatKind(c, c.id ? appNames[c.id] : undefined)}
                      name={titleOf(c)}
                    />
                    <span>
                      <span className={mergeClasses(s.ellipsis, unread && s.unread)}>
                        {titleOf(c)}
                      </span>
                      {!narrow && (
                        <span className={mergeClasses(s.ellipsis, s.preview, unread && s.unread)}>
                          {previewText(c, meId)}
                        </span>
                      )}
                    </span>
                    <span className={s.time}>
                      {chatTime(c.lastMessagePreview?.createdDateTime, undefined, zone)}
                    </span>
                  </button>
                );
              })
            ) : (
              <p className={s.state}>{received ? 'No chats to show.' : 'Waiting for chats…'}</p>
            ))}
        </>
      )}
      {showTeams && (
        <>
          <button
            type="button"
            className={s.section}
            aria-expanded={!collapsed.has('Teams')}
            onClick={() => toggle('Teams')}
          >
            {collapsed.has('Teams') ? <ChevronRight16Regular /> : <ChevronDown16Regular />}
            Teams and channels
          </button>
          {!collapsed.has('Teams') &&
            (teams ?? []).map((t) => (
              <div key={t.id}>
                <button
                  type="button"
                  className={s.row}
                  aria-expanded={openTeams.has(t.id ?? '')}
                  onClick={() => t.id && toggleTeam(t.id)}
                >
                  <Avatar
                    size={20}
                    name={t.displayName}
                    shape="square"
                    color="colorful"
                    aria-hidden
                  />
                  <span className={mergeClasses(s.ellipsis, s.unread)}>{t.displayName}</span>
                  <span>
                    {openTeams.has(t.id ?? '') ? (
                      <ChevronDown16Regular />
                    ) : (
                      <ChevronRight16Regular />
                    )}
                  </span>
                </button>
                {openTeams.has(t.id ?? '') &&
                  (channels[t.id ?? ''] ?? []).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      className={mergeClasses(s.row, s.indent)}
                      onClick={() => t.id && openChannel(t.id, ch)}
                    >
                      <span />
                      <span className={s.ellipsis}>{ch.displayName}</span>
                      <span />
                    </button>
                  ))}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
