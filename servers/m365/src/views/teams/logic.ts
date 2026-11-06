/** Teams logic with no UI: chat titles, unread state, message order and time labels. */
import { htmlToText } from '../lib/sanitize.js';
import type { Chat, ChatMember, ChatMessage } from './types.js';

/** Last-resort titles; a title equal to one of these may still be improved from the messages. */
export const FALLBACK_CHAT_TITLES = ['One-on-one chat', 'Group chat'] as const;

/** A bot chat whose application name Graph does not give. */
export const BOT_CHAT_TITLE = 'Bot chat';

/** The name of the application that sent a message, when an app (a bot) sent it. */
function appName(m: ChatMessage | null | undefined): string | undefined {
  // A message with a user sender is never an application's, whatever else Graph puts in `from`.
  if (m?.from?.user) return undefined;
  const name = m?.from?.application?.displayName;
  return name ? name : undefined;
}

/** True when an application (not a person) is the sender of this message. */
function fromApplication(m: ChatMessage | null | undefined): boolean {
  return Boolean(m?.from?.application) && !m?.from?.user;
}

/**
 * The self-chat title, as Teams shows it: "<my display name> (You)". The name comes from the signed-in
 * user, else from the chat's own member entry for them.
 */
function selfTitle(meName: string | undefined): string {
  return `${meName || 'You'} (You)`;
}

/**
 * A title taken from messages alone, for a chat whose members are not known: the application that sent
 * them (a bot chat), else "<me> (You)" when everything in it is from the signed-in user. Undefined when
 * the messages say nothing.
 */
export function titleFromMessages(
  messages: ChatMessage[],
  meId?: string,
  meName?: string
): string | undefined {
  for (const m of messages) {
    const app = appName(m);
    if (app) return app;
  }
  const senders = messages.map((m) => m.from?.user?.id).filter(Boolean);
  if (meId && senders.length && senders.every((id) => id === meId)) return selfTitle(meName);
  return undefined;
}

/** True when an application (a bot) sent any of the messages, whether or not Graph names it. */
export function hasApplicationSender(messages: ChatMessage[]): boolean {
  return messages.some(fromApplication);
}

/** The newest application sender's name in a list of messages (newest first), if any app posted. */
export function applicationInMessages(messages: ChatMessage[]): string | undefined {
  return messages.map(appName).find(Boolean);
}

/** Whether a member is the signed-in user: by id, by name, or the lone member of a one-on-one chat. */
function isMe(chat: Chat, m: ChatMember, meId?: string, meName?: string): boolean {
  if (meId && m.userId === meId) return true;
  if (meName && m.displayName === meName) return true;
  // A one-on-one chat that lists a single member lists only me (the other side is a bot or no one),
  // so my name never becomes the chat's title even when my id is not known (yet).
  return chat.chatType === 'oneOnOne' && (chat.members ?? []).length === 1;
}

/** The members other than the signed-in user, with a name. */
function otherMembers(chat: Chat, meId?: string, meName?: string): ChatMember[] {
  return (chat.members ?? []).filter((m) => m.displayName && !isMe(chat, m, meId, meName));
}

/**
 * A one-member chat that could be a bot chat or the self-chat: a one-on-one with no topic, no other
 * named member and no application evidence yet. Its title cannot be settled without looking at its
 * messages (a bot chat and the self-chat both have only the signed-in user as a member).
 */
export function needsNameLookup(chat: Chat, meId?: string, meName?: string): boolean {
  if (chat.chatType !== 'oneOnOne' || chat.topic) return false;
  if (otherMembers(chat, meId, meName).length) return false;
  if (fromApplication(chat.lastMessagePreview) || hasApplicationSender(chat.messages ?? []))
    return false;
  const known =
    appName(chat.lastMessagePreview) ??
    chat.installedApps?.find((a) => a.teamsApp?.displayName)?.teamsApp?.displayName ??
    applicationInMessages(chat.messages ?? []);
  return !known;
}

/**
 * A chat's display name, the way Teams names it: the topic; else the other members' names (a group
 * joined with ", " in the order Graph lists them); else, for a bot chat (no topic, and the bot is not a
 * member), the application's name from the last message, the chat's installed app or the first app
 * sender; else, for a chat with only yourself, "<my display name> (You)". Never a bare "Chat".
 *
 * @param meName the signed-in user's display name (the self-chat title); read from the members
 *   when it is not given
 */
export function chatTitle(chat: Chat, meId?: string, meName?: string): string {
  if (chat.topic) return chat.topic;
  const members = chat.members ?? [];
  const others = otherMembers(chat, meId, meName).map((m) => m.displayName as string);
  if (others.length) return others.join(', ');
  const app =
    appName(chat.lastMessagePreview) ??
    chat.installedApps?.find((a) => a.teamsApp?.displayName)?.teamsApp?.displayName ??
    (chat.messages ?? []).map(appName).find(Boolean);
  if (app) return app;
  // An application posted but Graph left its name out: a bot chat, never the self-chat.
  if (fromApplication(chat.lastMessagePreview) || hasApplicationSender(chat.messages ?? []))
    return BOT_CHAT_TITLE;
  if (chat.chatType === 'oneOnOne') {
    const self = members.find((m) => isMe(chat, m, meId, meName));
    const previewUser = chat.lastMessagePreview?.from?.user;
    const fromMe = Boolean(meId && previewUser?.id === meId);
    // Only me in the chat (or nothing else known and the last message is mine): the self-chat.
    if (self || fromMe) return selfTitle(meName || self?.displayName || undefined);
    if (previewUser?.displayName && previewUser.displayName !== meName)
      return previewUser.displayName;
    return FALLBACK_CHAT_TITLES[0];
  }
  return FALLBACK_CHAT_TITLES[1];
}

/** Unread when the newest message is later than the last one the user read. */
export function isUnread(chat: Chat): boolean {
  const last = Date.parse(chat.lastMessagePreview?.createdDateTime ?? '');
  const read = Date.parse(chat.viewpoint?.lastMessageReadDateTime ?? '');
  return !Number.isNaN(last) && (Number.isNaN(read) || last > read);
}

/** Newest activity first. */
export function sortChats(chats: Chat[]): Chat[] {
  const t = (c: Chat): number =>
    Date.parse(c.lastMessagePreview?.createdDateTime ?? c.lastUpdatedDateTime ?? '') || 0;
  return [...chats].sort((a, b) => t(b) - t(a));
}

/**
 * The sender's name: a person's display name, else the app's, else a generic "App" for a bot whose
 * name Graph leaves out, so a card posted by an app is never shown as "Unknown".
 */
export function senderName(m: ChatMessage): string {
  const user = m.from?.user?.displayName;
  if (user) return user;
  const app = m.from?.application;
  if (app) return app.displayName || (app.applicationIdentityType === 'bot' ? 'Bot' : 'App');
  return 'Unknown';
}

/** The label of an attachment chip: its name, else what kind of thing it is (a card, a file). */
export function attachmentLabel(a: NonNullable<ChatMessage['attachments']>[number]): string {
  if (a.name) return a.name;
  const type = a.contentType ?? '';
  if (type.includes('card')) return 'Card';
  return 'Attachment';
}

/** Whether a message has attachments and no text of its own (a card, a shared file). */
export function isAttachmentOnly(m: ChatMessage): boolean {
  return (m.attachments?.length ?? 0) > 0 && messageText(m).trim() === '';
}

/** Plain text of a message body (HTML bodies are flattened). */
export function messageText(m: ChatMessage | null | undefined): string {
  const body = m?.body;
  if (!body?.content) return '';
  return body.contentType?.toLowerCase() === 'html' ? htmlToText(body.content) : body.content;
}

/** "Name: text" preview for the chat list. */
export function previewText(chat: Chat, meId?: string): string {
  const m = chat.lastMessagePreview;
  const text = messageText(m).replace(/\s+/g, ' ');
  if (!text) return '';
  const who = m?.from?.user;
  return who?.id && who.id === meId
    ? `You: ${text}`
    : who?.displayName
      ? `${who.displayName.split(' ')[0]}: ${text}`
      : text;
}

/** Oldest first, the order a conversation reads in; system messages and deleted ones are dropped. */
export function conversationOrder(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.messageType !== 'systemEventMessage' && !m.deletedDateTime)
    .sort(
      (a, b) =>
        (Date.parse(a.createdDateTime ?? '') || 0) - (Date.parse(b.createdDateTime ?? '') || 0)
    );
}

/** "10/20 8:41 AM" this year, "10/20/2025 8:41 AM" otherwise. */
export function chatTime(
  iso: string | undefined,
  locale?: string,
  timeZone?: string,
  now: Date = new Date()
): string {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const year = (x: Date): string =>
    new Intl.DateTimeFormat(locale, { year: 'numeric', timeZone }).format(x);
  const day = new Intl.DateTimeFormat(locale, {
    month: 'numeric',
    day: 'numeric',
    ...(year(d) === year(now) ? {} : { year: 'numeric' }),
    timeZone,
  }).format(d);
  return `${day} ${new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(d)}`;
}

const EMOJI: Record<string, string> = {
  like: '\u{1F44D}',
  heart: '❤️',
  laugh: '\u{1F602}',
  surprised: '\u{1F62E}',
  sad: '\u{1F622}',
  angry: '\u{1F620}',
};

/** Reaction counts as emoji pairs. Unknown reaction types show as the raw name. */
export function reactionSummary(m: ChatMessage): Array<{ emoji: string; count: number }> {
  const counts = new Map<string, number>();
  for (const r of m.reactions ?? []) {
    const key = r.reactionType ?? '';
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].map(([k, count]) => ({ emoji: EMOJI[k] ?? k, count }));
}

/** The four shapes a chat's avatar takes in the real list. */
export type ChatKind = 'person' | 'bot' | 'meeting' | 'group';

/**
 * Which avatar a chat gets, by chat type first: a meeting chat is a meeting and a group chat a group
 * whoever posted in them (a bot posting in a meeting does not make it a bot chat). Only a one-on-one
 * chat named by an application is a bot chat; any other one-on-one is a person (including the
 * self-chat). `resolvedApp` is the application name found by the lookup (a string, or the bot title),
 * null/false/undefined when none.
 */
export function chatKind(chat: Chat, resolvedApp?: string | null | false): ChatKind {
  if (chat.chatType === 'meeting') return 'meeting';
  if (chat.chatType === 'group') return 'group';
  if (resolvedApp) return 'bot';
  if (fromApplication(chat.lastMessagePreview) || hasApplicationSender(chat.messages ?? []))
    return 'bot';
  if (chat.installedApps?.some((a) => a.teamsApp?.displayName)) return 'bot';
  return 'person';
}
