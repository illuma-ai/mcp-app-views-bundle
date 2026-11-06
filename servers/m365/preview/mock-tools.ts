/** Canned tool results for the preview host. Names are the server's real tool names. */
import { buildCalendar } from './calendar-fixtures.js';
import { buildFiles } from './files-fixtures.js';
import { CONTACTS, TASKS, TASK_LISTS } from './people-fixtures.js';
import { buildTeams } from './teams-fixtures.js';
import type { Fixtures } from './fixtures.js';

export interface Result {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

const json = (data: unknown): Result => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
});
const fail = (message: string): Result => ({
  isError: true,
  content: [{ type: 'text', text: JSON.stringify({ error: message }) }],
});

/** Answers a view's App-initiated tool call. */
export function mockTool(name: string, args: Record<string, unknown>, fx: Fixtures): Result {
  switch (name) {
    case 'list-mail-folder-messages': {
      if (args.skiptoken) return json(fx.inboxPage2);
      if (args.mailFolderId === 'drafts') return json(fx.drafts);
      if (args.mailFolderId === 'inbox') return json(fx.inboxPage1);
      return json({ value: [] });
    }
    case 'list-mail-messages': {
      if (args.skiptoken) return json(fx.inboxPage2);
      const filter = String(args.filter ?? '');
      const conv = /conversationId eq '([^']+)'/.exec(filter)?.[1];
      if (conv && fx.conversations[conv]) return json({ value: fx.conversations[conv] });
      return json(fx.inboxPage1);
    }
    case 'list-mail-folders':
      return json(fx.folders);
    case 'get-mail-message': {
      const m = fx.messages[String(args.messageId)];
      return m ? json(m) : fail('Message not found');
    }
    case 'update-mail-message':
    case 'delete-mail-message':
      return json({});
    case 'send-draft-message':
      return json({ message: 'OK!' });
    case 'create-reply-draft':
    case 'create-reply-all-draft':
    case 'create-forward-draft':
      return json(fx.replyDraft);
    case 'create-draft-email':
      return json(fx.emptyDraft);
    case 'list-folder-files':
      return json({
        value:
          args.driveItemId === 'root'
            ? buildFiles().root
            : (buildFiles().children[String(args.driveItemId)] ?? []),
      });
    case 'search-onedrive-files':
      return json({
        value: buildFiles().root.filter((i) =>
          i.name?.toLowerCase().includes(String(args.q).toLowerCase())
        ),
      });
    case 'move-rename-onedrive-item':
    case 'delete-onedrive-file':
      return json({});
    case 'create-onedrive-folder':
      return json({
        id: 'f-new',
        name: (args.body as { name?: string }).name,
        folder: { childCount: 0 },
      });
    case 'get-chat':
      return json(buildTeams().chats.find((c) => c.id === args.chatId) ?? {});
    case 'list-outlook-contacts':
      return json({ value: CONTACTS });
    case 'get-outlook-contact':
      return json(CONTACTS.find((c) => c.id === args.contactId) ?? CONTACTS[0]);
    case 'list-todo-task-lists':
      return json({ value: TASK_LISTS });
    case 'list-todo-tasks':
      return json({ value: TASKS[String(args.todoTaskListId)] ?? [] });
    case 'update-todo-task':
      return json({});
    case 'create-todo-task':
      return json({
        id: 't-new',
        title: (args.body as { title?: string }).title,
        status: 'notStarted',
      });
    case 'get-current-user':
      return json({ id: buildTeams().meId, displayName: 'Jordan Rivera' });
    case 'list-chats':
      return json({ value: buildTeams().chats });
    case 'list-chat-messages':
      return json({ value: buildTeams().messages[String(args.chatId)] ?? [] });
    case 'list-joined-teams':
      return json({ value: buildTeams().teams });
    case 'list-team-channels':
      return json({ value: buildTeams().channels[String(args.teamId)] ?? [] });
    case 'list-channel-messages':
      return json({ value: buildTeams().channelMessages[String(args.channelId)] ?? [] });
    case 'list-channel-message-replies':
      return json({ value: buildTeams().replies[String(args.chatMessageId)] ?? [] });
    case 'send-chat-message':
    case 'send-channel-message':
    case 'reply-to-channel-message':
    case 'reply-to-chat-message': {
      const body = (args.body as { body?: { content?: string } } | undefined)?.body;
      return json({
        id: `sent-${Date.now()}`,
        createdDateTime: new Date().toISOString(),
        from: { user: { id: buildTeams().meId, displayName: 'Jordan Rivera' } },
        body: { contentType: 'text', content: body?.content ?? '' },
      });
    }
    case 'get-calendar-view':
    case 'list-calendar-events':
      return json({ value: buildCalendar().events });
    case 'get-calendar-event':
      return json(
        buildCalendar().detail[String(args.eventId)] ?? {
          id: String(args.eventId),
          subject: 'Event',
        }
      );
    case 'create-calendar-event':
      return json({ id: 'e-new', ...(args.body as object) });
    case 'update-calendar-event':
    case 'delete-calendar-event':
    case 'accept-calendar-event':
    case 'decline-calendar-event':
    case 'tentatively-accept-calendar-event':
      return json({});
    default:
      return fail(`The preview has no fixture for ${name}`);
  }
}
