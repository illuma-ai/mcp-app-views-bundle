// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import {
  chatKind,
  chatTime,
  chatTitle,
  conversationOrder,
  isUnread,
  needsNameLookup,
  previewText,
  reactionSummary,
  sortChats,
  titleFromMessages,
} from '../src/views/teams/logic.js';
import type { Chat, ChatMessage } from '../src/views/teams/types.js';
import { ChatsView } from '../src/views/ui/ChatsView.js';
import { ComposeView, ConversationView } from '../src/views/ui/ConversationView.js';
import {
  WRITE_TOOLS,
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  settle,
  type,
  type Mounted,
} from './helpers/view-harness.js';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

const ME = 'u-me';
const msg = (
  id: string,
  from: string,
  name: string,
  at: string,
  html: string,
  extra: Partial<ChatMessage> = {}
): ChatMessage => ({
  id,
  createdDateTime: at,
  messageType: 'message',
  from: { user: { id: from, displayName: name } },
  body: { contentType: 'html', content: html },
  ...extra,
});

describe('teams logic', () => {
  it('names chats from the topic or the other members', () => {
    expect(chatTitle({ topic: 'Atlas Eng' })).toBe('Atlas Eng');
    expect(
      chatTitle(
        {
          chatType: 'oneOnOne',
          members: [
            { userId: ME, displayName: 'Me' },
            { userId: 'u2', displayName: 'Ada' },
          ],
        },
        ME
      )
    ).toBe('Ada');
    expect(chatTitle({ chatType: 'group' })).toBe('Group chat');
  });

  describe('chat titles, as Teams names them (real Graph shapes)', () => {
    const me = { id: '48d31887-5fad-4d73-a9f5-3c356e68a038', displayName: 'Kanwarjeet Singh Hora' };
    const self = { userId: me.id, displayName: me.displayName };

    it('joins the other members of a group in the order Graph lists them', () => {
      expect(
        chatTitle(
          {
            chatType: 'group',
            topic: null,
            members: [
              self,
              { userId: 'u2', displayName: 'Ada Lovelace' },
              { userId: 'u3', displayName: 'Grace Hopper' },
            ],
          },
          me.id,
          me.displayName
        )
      ).toBe('Ada Lovelace, Grace Hopper');
    });

    it('names a bot chat (no topic, the bot is not a member) by the application', () => {
      const botMessage = {
        id: '1',
        from: {
          user: null,
          application: { id: 'a1', displayName: 'TPO Agent', applicationIdentityType: 'bot' },
        },
      };
      // from the last message preview
      expect(
        chatTitle(
          { chatType: 'oneOnOne', topic: null, members: [self], lastMessagePreview: botMessage },
          me.id,
          me.displayName
        )
      ).toBe('TPO Agent');
      // else the installed app (chats/{id}/installedApps?$expand=teamsApp)
      expect(
        chatTitle(
          {
            chatType: 'oneOnOne',
            members: [self],
            lastMessagePreview: {
              id: '2',
              from: { user: { id: me.id, displayName: me.displayName } },
            },
            installedApps: [{ teamsApp: { displayName: 'PM Agent' } }],
          },
          me.id,
          me.displayName
        )
      ).toBe('PM Agent');
      // else the first message's application sender
      expect(
        chatTitle(
          { chatType: 'oneOnOne', members: [self], messages: [{ id: '0' }, botMessage] },
          me.id,
          me.displayName
        )
      ).toBe('TPO Agent');
      expect(titleFromMessages([{ id: '0' }, botMessage], me.id)).toBe('TPO Agent');
    });

    it('titles the self-chat "<my name> (You)", as Teams shows it', () => {
      const mine = { id: '3', from: { user: { id: me.id, displayName: me.displayName } } };
      // me is the only member
      expect(
        chatTitle({ chatType: 'oneOnOne', topic: null, members: [self] }, me.id, me.displayName)
      ).toBe('Kanwarjeet Singh Hora (You)');
      // the name comes from the member entry when the caller has none
      expect(chatTitle({ chatType: 'oneOnOne', members: [self] }, me.id)).toBe(
        'Kanwarjeet Singh Hora (You)'
      );
      // no members read, last message is mine
      expect(
        chatTitle({ chatType: 'oneOnOne', lastMessagePreview: mine }, me.id, me.displayName)
      ).toBe('Kanwarjeet Singh Hora (You)');
      expect(titleFromMessages([mine], me.id, me.displayName)).toBe('Kanwarjeet Singh Hora (You)');
    });

    it('takes only an application sender for a bot name, never a user, and skips my own messages', () => {
      const mine = { id: 'm1', from: { user: { id: me.id, displayName: me.displayName } } };
      const bot = {
        id: 'm2',
        from: {
          user: null,
          application: { id: 'a1', displayName: 'PM Agent', applicationIdentityType: 'bot' },
        },
      };
      // [me(user), bot(application)] -> the bot, in either order
      expect(
        chatTitle(
          { chatType: 'oneOnOne', members: [self], messages: [mine, bot] },
          me.id,
          me.displayName
        )
      ).toBe('PM Agent');
      expect(
        chatTitle(
          { chatType: 'oneOnOne', members: [self], messages: [bot, mine] },
          me.id,
          me.displayName
        )
      ).toBe('PM Agent');
      expect(titleFromMessages([mine, bot], me.id, me.displayName)).toBe('PM Agent');
      // only me -> the self-chat
      expect(
        chatTitle(
          { chatType: 'oneOnOne', members: [self], messages: [mine, { ...mine, id: 'm3' }] },
          me.id,
          me.displayName
        )
      ).toBe('Kanwarjeet Singh Hora (You)');
      // an application field on a user's own message does not make it an application's
      const odd = {
        id: 'm4',
        from: {
          user: { id: me.id, displayName: me.displayName },
          application: { displayName: me.displayName },
        },
      };
      expect(
        chatTitle({ chatType: 'oneOnOne', members: [self], messages: [odd] }, me.id, me.displayName)
      ).toBe('Kanwarjeet Singh Hora (You)');
      // my name is never a chat's title through the member list, even when the id is unknown
      expect(chatTitle({ chatType: 'oneOnOne', members: [self] }, undefined, me.displayName)).toBe(
        'Kanwarjeet Singh Hora (You)'
      );
      // a nameless application is a bot chat, never the self-chat
      expect(
        chatTitle(
          {
            chatType: 'oneOnOne',
            members: [self],
            messages: [
              { id: 'm5', from: { user: null, application: { id: 'a2', displayName: null } } },
            ],
          },
          me.id,
          me.displayName
        )
      ).toBe('Bot chat');
    });

    it('picks the avatar kind from the chat type and application evidence', () => {
      const app = {
        id: 'p',
        from: { user: null, application: { id: 'a', displayName: 'TPO Agent' } },
      };
      expect(chatKind({ chatType: 'oneOnOne', members: [self] })).toBe('person');
      expect(chatKind({ chatType: 'oneOnOne', lastMessagePreview: app })).toBe('bot');
      expect(chatKind({ chatType: 'oneOnOne' }, 'PM Agent')).toBe('bot');
      expect(chatKind({ chatType: 'meeting', topic: 'Meeting with Ada' })).toBe('meeting');
      expect(chatKind({ chatType: 'group', topic: 'Bots' })).toBe('group');
      // the chat type comes first: a bot posting in a meeting or a group does not make it a bot chat
      expect(chatKind({ chatType: 'meeting', lastMessagePreview: app }, 'TPO Agent')).toBe(
        'meeting'
      );
      expect(
        chatKind({ chatType: 'group', topic: 'Build bots (laptop)', lastMessagePreview: app })
      ).toBe('group');
      expect(chatKind({ chatType: 'group', messages: [app] }, 'Bot chat')).toBe('group');
      // only a one-on-one named by an application is a bot chat
      expect(chatKind({ chatType: 'oneOnOne', messages: [app] })).toBe('bot');
      expect(chatKind({ chatType: 'oneOnOne', members: [self] })).toBe('person');
    });

    it('is never a bare "Chat"', () => {
      for (const chat of [
        {},
        { chatType: 'oneOnOne' },
        { chatType: 'group' },
        { chatType: 'oneOnOne', members: [{ userId: 'x' }] },
      ] as Chat[])
        expect(chatTitle(chat, me.id, me.displayName)).not.toBe('Chat');
    });
  });

  it('marks unread by the read marker and sorts newest first', () => {
    const a: Chat = {
      id: 'a',
      lastMessagePreview: { createdDateTime: '2026-03-02T10:00:00Z' },
      viewpoint: { lastMessageReadDateTime: '2026-03-02T09:00:00Z' },
    };
    const b: Chat = {
      id: 'b',
      lastMessagePreview: { createdDateTime: '2026-03-03T10:00:00Z' },
      viewpoint: { lastMessageReadDateTime: '2026-03-03T11:00:00Z' },
    };
    expect(isUnread(a)).toBe(true);
    expect(isUnread(b)).toBe(false);
    expect(isUnread({ id: 'c' })).toBe(false);
    expect(sortChats([a, b]).map((c) => c.id)).toEqual(['b', 'a']);
  });

  it('orders a conversation oldest first and drops system and deleted messages', () => {
    const ordered = conversationOrder([
      msg('2', 'u', 'U', '2026-03-02T10:00:00Z', 'b'),
      msg('1', 'u', 'U', '2026-03-01T10:00:00Z', 'a'),
      msg('s', 'u', 'U', '2026-03-01T11:00:00Z', 'x', { messageType: 'systemEventMessage' }),
      msg('d', 'u', 'U', '2026-03-01T12:00:00Z', 'x', { deletedDateTime: '2026-03-02T00:00:00Z' }),
    ]);
    expect(ordered.map((m) => m.id)).toEqual(['1', '2']);
  });

  it('writes times the way the reference client does and previews with the sender', () => {
    expect(chatTime('2026-10-20T13:41:00Z', 'en-US', 'UTC', new Date('2026-11-05T00:00:00Z'))).toBe(
      '10/20 1:41 PM'
    );
    expect(chatTime('2025-10-20T13:41:00Z', 'en-US', 'UTC', new Date('2026-11-05T00:00:00Z'))).toBe(
      '10/20/2025 1:41 PM'
    );
    const chat: Chat = {
      lastMessagePreview: msg(
        '1',
        'u2',
        'Ada Lovelace',
        '2026-03-01T10:00:00Z',
        '<p>Hello <b>there</b></p>'
      ),
    };
    expect(previewText(chat, ME)).toBe('Ada: Hello there');
    expect(
      previewText({ lastMessagePreview: msg('1', ME, 'Me', '2026-03-01T10:00:00Z', 'x') }, ME)
    ).toBe('You: x');
    expect(
      reactionSummary({
        reactions: [{ reactionType: 'like' }, { reactionType: 'like' }, { reactionType: 'heart' }],
      }).map((r) => r.count)
    ).toEqual([2, 1]);
  });
});

const CHATS: Chat[] = [
  {
    id: 'c1',
    topic: 'Atlas Eng',
    chatType: 'group',
    lastMessagePreview: msg('p1', 'u2', 'Atlas Eng', '2026-03-02T10:00:00Z', '<p>Hi</p>'),
    viewpoint: { lastMessageReadDateTime: '2026-03-02T11:00:00Z' },
  },
  {
    id: 'c2',
    topic: 'Budget',
    chatType: 'group',
    lastMessagePreview: msg('p2', 'u3', 'Ada Lovelace', '2026-03-03T10:00:00Z', '<p>Numbers?</p>'),
    viewpoint: { lastMessageReadDateTime: '2026-03-01T11:00:00Z' },
  },
];

describe('chat list', () => {
  it('uses the reference words: Chat, the filter pills and the Chats section', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <ChatsView args={{}} received result={{ value: CHATS as never }} />,
      api
    );
    const text = mounted.container.textContent ?? '';
    for (const word of ['Chat', 'Unread', 'Channels', 'Chats', 'Atlas Eng', 'Budget'])
      expect(text, word).toContain(word);
    expect(text).not.toContain('Teams and channels');
  });

  it('filters to unread chats and opens a chat with the messages tool', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-messages'
        ? { value: [msg('m1', 'u3', 'Ada Lovelace', '2026-03-03T10:00:00Z', '<p>Numbers?</p>')] }
        : {}
    );
    mounted = await mountView(
      <ChatsView args={{}} received result={{ value: CHATS as never }} />,
      api
    );
    await click(byText(mounted.container, 'button', 'Unread'));
    expect(mounted.container.textContent).not.toContain('Atlas Eng');
    await click(byText(mounted.container, 'button', /Budget/));
    expect(calls.filter((c) => c.name === 'tool-chat-messages')).toEqual([
      { name: 'tool-chat-messages', args: { chatId: 'c2', top: 25 } },
    ]);
    expect(byLabel(mounted.container, 'Type a message')?.getAttribute('placeholder')).toBe(
      'Type a message'
    );
    expect(mounted.container.textContent).toContain('Numbers?');
  });

  it('shows Teams and channels behind the Channels pill and opens a channel', async () => {
    const { calls, api } = fakeHost((name, args) =>
      name === 'tool-teams-list'
        ? { value: [{ id: 't1', displayName: 'Engineering' }] }
        : name === 'tool-channels-list'
          ? { value: [{ id: 'ch1', displayName: 'General' }] }
          : name === 'tool-channel-messages'
            ? { value: [] }
            : {}
    );
    mounted = await mountView(
      <ChatsView args={{}} received result={{ value: CHATS as never }} />,
      api
    );
    await click(byText(mounted.container, 'button', 'Channels'));
    expect(mounted.container.textContent).toContain('Teams and channels');
    await click(byText(mounted.container, 'button', /Engineering/));
    await click(byText(mounted.container, 'button', 'General'));
    expect(calls.map((c) => c.name)).toEqual(
      expect.arrayContaining(['tool-teams-list', 'tool-channels-list', 'tool-channel-messages'])
    );
    expect(mounted.container.textContent).toContain('Welcome to your new team!');
  });

  it('works with chats alone: the Channels pill is disabled when no channel tool is enabled', async () => {
    const { host } = fakeHost();
    const { MailApi } = await import('../src/views/mail/api.js');
    const api = new MailApi(host, { chatMessages: 'tool-chat-messages' });
    mounted = await mountView(
      <ChatsView args={{}} received result={{ value: CHATS as never }} />,
      api
    );
    expect((byText(mounted.container, 'button', 'Channels') as HTMLButtonElement).disabled).toBe(
      true
    );
  });
});

describe('conversation', () => {
  const messages = [
    msg(
      'm2',
      'u2',
      'Atlas Eng',
      '2026-10-20T15:41:00Z',
      '<p>The migration is owned by <b>Henrik</b>.</p>'
    ),
    msg('m1', ME, 'Me', '2026-10-20T15:40:00Z', '<p>Who owns it?</p>'),
  ];
  const target = { kind: 'chat', chatId: 'c1', title: 'Atlas Eng', titleKnown: true } as const;

  it('shows names with times on others, the time only on mine, and the reference header words', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <ConversationView target={target} initial={messages} meId={ME} />,
      api
    );
    const text = mounted.container.textContent ?? '';
    for (const word of ['Atlas Eng', 'Chat', 'Who owns it?']) expect(text, word).toContain(word);
    expect(byLabel(mounted.container, 'Type a message')?.getAttribute('placeholder')).toBe(
      'Type a message'
    );
    // The other person's bubble has a name line; mine does not repeat my name.
    expect(text.match(/Atlas Eng/g)?.length).toBeGreaterThanOrEqual(2);
    expect(mounted.container.querySelector('b')?.textContent).toBe('Henrik');
    expect(mounted.container.innerHTML).not.toContain('<script');
  });

  it('sends only from the Send button, with a plain-text body, then shows the message', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-send'
        ? {
            id: 'new1',
            createdDateTime: '2026-10-20T16:00:00Z',
            from: { user: { id: ME } },
            body: { contentType: 'text', content: 'On it' },
          }
        : {}
    );
    mounted = await mountView(
      <ConversationView target={target} initial={messages} meId={ME} />,
      api
    );
    const send = byLabel(mounted.container, 'Send') as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    await type(byLabel(mounted.container, 'Type a message') as HTMLTextAreaElement, 'On it');
    await settle();
    expect(calls).toEqual([]);
    await click(byLabel(mounted.container, 'Send'));
    expect(calls).toEqual([
      {
        name: 'tool-chat-send',
        args: {
          chatId: 'c1',
          body: { body: { contentType: 'text', content: 'On it' } },
          confirm: true,
        },
      },
    ]);
    expect(mounted.container.textContent).toContain('On it');
  });

  it('loads earlier messages with the next link and the same tool', async () => {
    const { calls, api } = fakeHost(() => ({
      value: [msg('old', 'u2', 'Atlas Eng', '2026-10-19T10:00:00Z', '<p>Older one</p>')],
    }));
    mounted = await mountView(
      <ConversationView
        target={target}
        initial={messages}
        nextLink="https://graph/next?$skiptoken=1"
        meId={ME}
      />,
      api
    );
    await click(byText(mounted.container, 'button', 'Load earlier messages'));
    expect(calls).toEqual([
      {
        name: 'tool-chat-messages',
        args: { chatId: 'c1', skiptoken: 'https://graph/next?$skiptoken=1' },
      },
    ]);
    expect(mounted.container.textContent).toContain('Older one');
  });

  it('opens a channel thread lazily and replies from its own box', async () => {
    const root = msg('root', 'u2', 'Ada', '2026-10-20T10:00:00Z', '<p>Release notes</p>');
    const { calls, api } = fakeHost((name) =>
      name === 'tool-channel-replies'
        ? { value: [msg('r1', ME, 'Me', '2026-10-20T11:00:00Z', '<p>Looks good</p>')] }
        : name === 'tool-channel-reply'
          ? {
              id: 'r2',
              createdDateTime: '2026-10-20T12:00:00Z',
              from: { user: { id: ME } },
              body: { contentType: 'text', content: 'Thanks' },
            }
          : {}
    );
    mounted = await mountView(
      <ConversationView
        target={{ kind: 'channel', teamId: 't1', channelId: 'c1', title: 'General' }}
        initial={[root]}
        meId={ME}
      />,
      api
    );
    expect(calls).toEqual([]);
    await click(byText(mounted.container, 'button', 'Replies'));
    expect(calls).toEqual([
      {
        name: 'tool-channel-replies',
        args: { teamId: 't1', channelId: 'c1', chatMessageId: 'root' },
      },
    ]);
    expect(mounted.container.textContent).toContain('1 reply');
    await type(byLabel(mounted.container, 'Reply in thread') as HTMLTextAreaElement, 'Thanks');
    const buttons = mounted.container.querySelectorAll('button[aria-label="Send"]');
    await click(buttons[0]);
    expect(calls[1]).toEqual({
      name: 'tool-channel-reply',
      args: {
        teamId: 't1',
        channelId: 'c1',
        chatMessageId: 'root',
        body: { body: { contentType: 'text', content: 'Thanks' } },
        confirm: true,
      },
    });
    expect(mounted.container.textContent).toContain('2 replies');
  });

  it('never calls a write tool on its own while listing, opening and loading', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-messages' ? { value: messages } : { value: [] }
    );
    mounted = await mountView(
      <ChatsView args={{}} received result={{ value: CHATS as never }} />,
      api
    );
    await click(byText(mounted.container, 'button', /Budget/));
    await settle();
    expect(calls.filter((c) => WRITE_TOOLS.includes(c.name))).toEqual([]);
  });
});

describe('names do not depend on the model call', () => {
  const group: Chat = {
    id: 'g1',
    chatType: 'group',
    topic: null,
    members: [
      { userId: ME, displayName: 'Me' },
      { userId: 'u2', displayName: 'Ada Lovelace' },
      { userId: 'u3', displayName: 'Grace Hopper' },
    ],
    lastMessagePreview: msg('p', 'u2', 'Ada Lovelace', '2026-03-02T10:00:00Z', '<p>Hi</p>'),
    viewpoint: { lastMessageReadDateTime: '2026-03-01T10:00:00Z' },
  };

  it('re-fetches the chat list with members and the last message and names a topic-less group by the other members', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-list' ? { value: [group] } : name === 'tool-me' ? { id: ME } : {}
    );
    mounted = await mountView(
      // the model's own call returned the chat without members or a preview
      <ChatsView
        args={{}}
        received
        result={{ value: [{ id: 'g1', chatType: 'group', topic: null }] }}
      />,
      api
    );
    const list = calls.find((c) => c.name === 'tool-chat-list');
    expect(list?.args).toMatchObject({ expand: 'members,lastMessagePreview' });
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('Ada Lovelace, Grace Hopper');
    expect(text).not.toContain('Me,');
    expect(mounted.container.querySelector('[aria-label^="Unread."]')).toBeTruthy();
  });

  it('names a one-member bot chat by the application that posted, not "(You)", and the empty self-chat "(You)"', async () => {
    const mine = {
      id: 'p1',
      createdDateTime: '2026-11-05T20:01:00Z',
      from: { user: { id: ME, displayName: 'Kanwarjeet Singh Hora' } },
    };
    const bot = {
      id: 'b0',
      from: {
        user: null,
        application: { id: 'a1', displayName: 'PM Agent', applicationIdentityType: 'bot' },
      },
    };
    const chats: Chat[] = [
      {
        id: 'bot1',
        chatType: 'oneOnOne',
        topic: null,
        members: [{ userId: ME, displayName: 'Kanwarjeet Singh Hora' }],
        lastMessagePreview: mine,
      },
      {
        id: 'self1',
        chatType: 'oneOnOne',
        topic: null,
        members: [{ userId: ME, displayName: 'Kanwarjeet Singh Hora' }],
      },
    ];
    const { calls, api } = fakeHost((name, args) => {
      if (name === 'tool-me') return { id: ME, displayName: 'Kanwarjeet Singh Hora' };
      if (name === 'tool-chat-messages')
        return { value: args.chatId === 'bot1' ? [mine, bot] : [] };
      return {};
    });
    mounted = await mountView(
      <ChatsView
        args={{ expand: 'members,lastMessagePreview' }}
        received
        result={{ value: chats as never }}
      />,
      api
    );
    await settle();
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('PM Agent');
    expect(text).toContain('Kanwarjeet Singh Hora (You)');
    expect(text.match(/(You)/g)).toHaveLength(1);
    // one bounded lookup per unresolved chat, never repeated
    const lookups = calls.filter((x) => x.name === 'tool-chat-messages');
    expect(lookups.map((x) => x.args)).toEqual([
      { chatId: 'bot1', top: 20 },
      { chatId: 'self1', top: 20 },
    ]);
  });

  it('flags only an unresolved one-member chat for a name lookup', () => {
    const one = { chatType: 'oneOnOne', members: [{ userId: ME, displayName: 'Me' }] };
    expect(needsNameLookup(one, ME)).toBe(true);
    // a lone member is me, so the lookup applies even before my id is known; not with a topic, another member or an app
    expect(needsNameLookup(one, undefined)).toBe(true);
    expect(needsNameLookup({ ...one, topic: 'Notes' }, ME)).toBe(false);
    expect(
      needsNameLookup(
        { ...one, members: [...one.members, { userId: 'u2', displayName: 'Ada' }] },
        ME
      )
    ).toBe(false);
    expect(
      needsNameLookup(
        { ...one, lastMessagePreview: { from: { application: { displayName: 'PM Agent' } } } },
        ME
      )
    ).toBe(false);
    expect(needsNameLookup({ chatType: 'group' }, ME)).toBe(false);
  });

  it('does not re-fetch when the model already expanded members and the last message', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(
      <ChatsView
        args={{ expand: 'members,lastMessagePreview' }}
        received
        result={{ value: [group] }}
      />,
      api
    );
    expect(calls.some((c) => c.name === 'tool-chat-list')).toBe(false);
  });

  it('gets the chat for the conversation header when the opener did not know the name', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-get' ? group : name === 'tool-me' ? { id: ME } : {}
    );
    mounted = await mountView(
      <ConversationView target={{ kind: 'chat', chatId: 'g1', title: 'Chat' }} initial={[]} />,
      api
    );
    expect(calls.find((c) => c.name === 'tool-chat-get')?.args).toMatchObject({
      chatId: 'g1',
      expand: 'members',
    });
    expect(mounted.container.textContent).toContain('Ada Lovelace, Grace Hopper');
  });
});

describe('a proposed message opens the composer and sends only what the user sends', () => {
  const proposal = { chatId: 'c1', text: 'Proposed words', title: 'Atlas Eng' };

  it('shows the proposed text in the box, reads the chat, and sends nothing on open', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-messages'
        ? { value: [msg('m1', 'u2', 'Atlas Eng', '2026-10-20T15:41:00Z', '<p>Earlier</p>')] }
        : {}
    );
    mounted = await mountView(<ComposeView proposal={proposal} />, api);
    const box = byLabel(mounted.container, 'Type a message') as HTMLTextAreaElement;
    expect(box.value).toBe('Proposed words');
    expect(mounted.container.textContent).toContain('Earlier');
    expect(calls.filter((c) => WRITE_TOOLS.includes(c.name))).toEqual([]);
  });

  it('Send sends exactly the edited text with confirm: true', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<ComposeView proposal={proposal} />, api);
    await type(
      byLabel(mounted.container, 'Type a message') as HTMLTextAreaElement,
      'Edited by the user'
    );
    await click(byLabel(mounted.container, 'Send'));
    const sent = calls.filter((c) => WRITE_TOOLS.includes(c.name));
    expect(sent).toEqual([
      {
        name: 'tool-chat-send',
        args: {
          chatId: 'c1',
          body: { body: { contentType: 'text', content: 'Edited by the user' } },
          confirm: true,
        },
      },
    ]);
  });

  it('opens a channel composer, and finds the chat when only people are named', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-chat-list'
        ? {
            value: [
              {
                id: 'one',
                chatType: 'oneOnOne',
                members: [
                  { userId: ME, displayName: 'Me' },
                  { userId: 'u2', displayName: 'Ada Lovelace' },
                ],
              },
              {
                id: 'other',
                chatType: 'oneOnOne',
                members: [
                  { userId: ME, displayName: 'Me' },
                  { userId: 'u3', displayName: 'Grace Hopper' },
                ],
              },
            ],
          }
        : {}
    );
    mounted = await mountView(
      <ComposeView proposal={{ recipients: ['ada lovelace'], text: 'Hello Ada' }} />,
      api
    );
    expect((byLabel(mounted.container, 'Type a message') as HTMLTextAreaElement).value).toBe(
      'Hello Ada'
    );
    expect(calls.find((c) => c.name === 'tool-chat-messages')?.args).toMatchObject({
      chatId: 'one',
    });
    mounted.unmount();
    const channel = fakeHost();
    mounted = await mountView(
      <ComposeView proposal={{ teamId: 't1', channelId: 'ch1', text: 'Post this' }} />,
      channel.api
    );
    expect((byLabel(mounted.container, 'Start a new post') as HTMLTextAreaElement).value).toBe(
      'Post this'
    );
    expect(channel.calls.some((c) => c.name === 'tool-channel-messages')).toBe(true);
  });

  it('says so when no existing chat matches the people', async () => {
    const { api } = fakeHost((name) => (name === 'tool-chat-list' ? { value: [] } : {}));
    mounted = await mountView(
      <ComposeView proposal={{ recipients: ['nobody'], text: 'x' }} />,
      api
    );
    expect(mounted.container.textContent).toContain('No existing chat');
    expect(byLabel(mounted.container, 'Send')).toBeNull();
  });
});

describe('messages posted by apps', () => {
  const card = (
    name: string | null,
    app: { displayName?: string | null; applicationIdentityType?: string }
  ) =>
    msg('c1', 'x', 'x', '2026-10-15T04:39:00Z', '<attachment id="a1"></attachment>', {
      from: { user: null, application: { id: 'app1', ...app } },
      attachments: [{ id: 'a1', name, contentType: 'application/vnd.microsoft.card.adaptive' }],
    });
  const target = {
    kind: 'chat',
    chatId: 'c1',
    title: 'Agent bridge group test',
    titleKnown: true,
  } as const;

  it("shows the app's name, not Unknown, and a card placeholder instead of an empty bubble", async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <ConversationView
        target={target}
        initial={[card(null, { displayName: 'TPO Agent' })]}
        meId={ME}
      />,
      api
    );
    const log = mounted.container.querySelector('[role=log]')!;
    expect(log.textContent).toContain('TPO Agent');
    expect(log.textContent).not.toContain('Unknown');
    expect(log.textContent).toContain('Card');
    // no empty grey bubble: the only boxes are the card chip
    expect(log.querySelectorAll('div[class*="bubble"]').length).toBe(0);
  });

  it('shows the attachment name when the card has one, and Bot for a bot with no name', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <ConversationView
        target={target}
        initial={[card('Deployment report', { displayName: null, applicationIdentityType: 'bot' })]}
        meId={ME}
      />,
      api
    );
    const text = mounted.container.querySelector('[role=log]')!.textContent;
    expect(text).toContain('Bot');
    expect(text).toContain('Deployment report');
    expect(text).not.toContain('Unknown');
  });
});

describe('a message to yourself', () => {
  it('says the notes chat cannot be addressed, without searching, for "me"', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(
      <ComposeView proposal={{ recipients: ['me'], text: 'note to self' }} />,
      api
    );
    expect(mounted.container.textContent).toContain('cannot be addressed');
    expect(byLabel(mounted.container, 'Send')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('says it too when the recipient is the signed-in user by name and no chat is found', async () => {
    const { api } = fakeHost((name) =>
      name === 'tool-chat-list'
        ? { value: [] }
        : name === 'tool-me'
          ? { id: ME, displayName: 'Kanwar Hora', mail: 'kanwar@example.test' }
          : {}
    );
    mounted = await mountView(
      <ComposeView proposal={{ recipients: ['Kanwar Hora'], text: 'note' }} />,
      api
    );
    expect(mounted.container.textContent).toContain('cannot be addressed');
    expect(mounted.container.textContent).not.toContain('No existing chat');
  });
});

describe('channel posts, as in the real channel', () => {
  const target = { kind: 'channel', teamId: 't1', channelId: 'ch1', title: 'Project X' } as const;

  it('shows the Posts, Shared, Page and Notes tabs and a Post in channel button that opens the composer', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<ConversationView target={target} initial={[]} meId={ME} />, api);
    const tabs = Array.from(mounted.container.querySelectorAll('[role=tab]')).map((t) =>
      (t.textContent ?? '').trim()
    );
    ['Posts', 'Shared', 'Page', 'Notes'].forEach((name, i) => expect(tabs[i]).toContain(name));
    expect(byLabel(mounted.container, 'Start a new post')).toBeNull();
    await click(byText(mounted.container, 'button', 'Post in channel'));
    await type(
      byLabel(mounted.container, 'Start a new post') as HTMLTextAreaElement,
      'Hello channel'
    );
    await click(byLabel(mounted.container, 'Send'));
    expect(calls.filter((c) => WRITE_TOOLS.includes(c.name))).toEqual([
      {
        name: 'tool-channel-send',
        args: {
          teamId: 't1',
          channelId: 'ch1',
          body: { body: { contentType: 'text', content: 'Hello channel' } },
          confirm: true,
        },
      },
    ]);
  });
});
