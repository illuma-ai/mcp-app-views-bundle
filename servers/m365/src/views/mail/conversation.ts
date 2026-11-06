/** Grouping of a message list into conversations. Pure, so it is unit-tested directly. */
import { person } from './people.js';
import type { MailMessage } from './types.js';

export interface Conversation {
  key: string;
  /** Oldest first. */
  messages: MailMessage[];
  latest: MailMessage;
  subject: string;
  participants: string[];
  unread: boolean;
  flagged: boolean;
  attachments: boolean;
  important: boolean;
}

function time(m: MailMessage): number {
  const t = Date.parse(m.receivedDateTime ?? m.sentDateTime ?? '');
  return Number.isNaN(t) ? 0 : t;
}

/**
 * Groups messages by conversationId. Groups keep the order in which their first message appears
 * in the input (a list sorted newest-first stays newest-first); messages without a conversationId
 * are their own group.
 */
export function groupByConversation(messages: MailMessage[]): Conversation[] {
  const order: string[] = [];
  const groups = new Map<string, MailMessage[]>();
  messages.forEach((m, i) => {
    const key = m.conversationId || m.id || `#${i}`;
    if (!groups.has(key)) {
      groups.set(key, []);
      order.push(key);
    }
    groups.get(key)?.push(m);
  });
  return order.map((key) => buildConversation(key, groups.get(key) ?? []));
}

export function buildConversation(key: string, input: MailMessage[]): Conversation {
  const messages = [...input].sort((a, b) => time(a) - time(b));
  const latest = messages[messages.length - 1];
  const seen = new Set<string>();
  const participants: string[] = [];
  for (const m of [...messages].reverse()) {
    const label = person(m.from ?? m.sender).label;
    if (!seen.has(label)) {
      seen.add(label);
      participants.push(label);
    }
  }
  return {
    key,
    messages,
    latest,
    subject: latest.subject || '(no subject)',
    participants,
    unread: messages.some((m) => m.isRead === false),
    flagged: messages.some((m) => m.flag?.flagStatus === 'flagged'),
    attachments: messages.some((m) => m.hasAttachments),
    important: messages.some((m) => m.importance === 'high'),
  };
}
