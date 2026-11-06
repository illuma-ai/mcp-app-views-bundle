/**
 * Fixture Teams data for the local view preview: fictional people on reserved example domains.
 * Times are relative to now so the labels always read naturally.
 */
import type { Channel, Chat, ChatMessage, Team } from '../src/views/teams/types.js';

const ME = { id: 'u-me', displayName: 'Jordan Rivera' };
const user = (id: string, displayName: string) => ({ user: { id, displayName } });

export function buildTeams(now: Date = new Date()): {
  meId: string;
  chats: Chat[];
  messages: Record<string, ChatMessage[]>;
  teams: Team[];
  channels: Record<string, Channel[]>;
  channelMessages: Record<string, ChatMessage[]>;
  replies: Record<string, ChatMessage[]>;
} {
  const ago = (min: number): string => new Date(now.getTime() - min * 60_000).toISOString();
  const text = (
    id: string,
    from: { user: { id: string; displayName: string } },
    min: number,
    html: string,
    extra: Partial<ChatMessage> = {}
  ): ChatMessage => ({
    id,
    createdDateTime: ago(min),
    messageType: 'message',
    from,
    body: { contentType: 'html', content: html },
    ...extra,
  });
  const atlas = user('u-atlas', 'Atlas Eng');
  const ada = user('u-ada', 'Ada Lovelace');
  const me = { user: ME };
  const messages: Record<string, ChatMessage[]> = {
    'chat-atlas': [
      text(
        'm6',
        atlas,
        10,
        '<p>The Sable data migration is owned by <b>Henrik</b> and finishes on <b>January 21, 2027</b>. Kanwarjeet moved it from January 14.</p>'
      ),
      text('m5', me, 14, '<p>When does the Sable data migration finish, and who owns it?</p>'),
      text(
        'm4',
        atlas,
        60,
        '<p>The Juniper design review is on <b>November 25, 2026</b>, and <b>Ottilie</b> is running it.</p>',
        { reactions: [{ reactionType: 'like', user: { user: { id: 'u-ada' } } }] }
      ),
      text('m3', me, 63, '<p>When is the Juniper design review, and who is running it?</p>'),
      text(
        'm2',
        atlas,
        120,
        "<p>Bilal owns the Juniper load test, and it runs in <b>Rosa's environment</b>. No date is set yet.</p>",
        { attachments: [{ id: 'a1', name: 'load-test-plan.pdf' }] }
      ),
      text('m1', me, 125, '<p>Who owns the Juniper load test, and which environment is it on?</p>'),
    ],
    'chat-ada': [
      text('a2', ada, 30, '<p>Can you review the budget numbers before Friday?</p>'),
      text('a1', me, 45, '<p>Sure, send them over.</p>'),
    ],
  };
  const chats: Chat[] = [
    {
      id: 'chat-atlas',
      topic: 'Atlas Eng',
      chatType: 'group',
      lastMessagePreview: messages['chat-atlas'][0],
      viewpoint: { lastMessageReadDateTime: ago(5) },
    },
    {
      id: 'chat-ada',
      chatType: 'oneOnOne',
      members: [
        { userId: 'u-me', displayName: 'Jordan Rivera' },
        { userId: 'u-ada', displayName: 'Ada Lovelace' },
      ],
      lastMessagePreview: messages['chat-ada'][0],
      viewpoint: { lastMessageReadDateTime: ago(300) },
    },
    {
      id: 'chat-pm',
      chatType: 'oneOnOne',
      topic: null,
      members: [{ userId: 'u-me', displayName: 'Jordan Rivera' }],
      lastMessagePreview: {
        id: 'pm1',
        createdDateTime: ago(3000),
        messageType: 'message',
        from: {
          user: null,
          application: { id: 'app-pm', displayName: 'PM Agent', applicationIdentityType: 'bot' },
        },
        body: { contentType: 'text', content: 'Plan updated.' },
      },
      viewpoint: { lastMessageReadDateTime: ago(2000) },
    },
    {
      id: 'chat-sync',
      topic: 'Meeting with Kanwarjeet Singh',
      chatType: 'meeting',
      lastMessagePreview: text('s1', ada, 2000, '<p>Notes are in the channel.</p>'),
      viewpoint: { lastMessageReadDateTime: ago(1000) },
    },
  ];
  const teams: Team[] = [
    { id: 't-eng', displayName: 'Engineering' },
    { id: 't-ops', displayName: 'Operations' },
  ];
  const channels: Record<string, Channel[]> = {
    't-eng': [
      { id: 'c-general', displayName: 'General' },
      { id: 'c-release', displayName: 'Release planning' },
    ],
    't-ops': [{ id: 'c-incidents', displayName: 'Incidents' }],
  };
  const channelMessages: Record<string, ChatMessage[]> = {
    'c-general': [
      text('g2', ada, 90, '<p>Release notes are ready for review.</p>'),
      text('g1', atlas, 200, '<p>Standup moved to 9:30 tomorrow.</p>'),
    ],
    'c-release': [text('r1', ada, 400, '<p>Code freeze starts Thursday.</p>')],
    'c-incidents': [],
  };
  const replies: Record<string, ChatMessage[]> = {
    g2: [text('g2r1', me, 60, '<p>Looks good, one comment on the migration section.</p>')],
  };
  return { meId: ME.id, chats, messages, teams, channels, channelMessages, replies };
}
