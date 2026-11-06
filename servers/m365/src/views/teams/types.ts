/** Shapes of the Microsoft Graph Teams resources the views read. Every field is optional. */

export interface ChatMember {
  displayName?: string;
  userId?: string;
}

export interface ChatMessage {
  id?: string;
  createdDateTime?: string;
  deletedDateTime?: string | null;
  messageType?: string;
  replyToId?: string | null;
  subject?: string | null;
  importance?: string;
  from?: {
    user?: { id?: string; displayName?: string } | null;
    application?: {
      id?: string;
      displayName?: string | null;
      applicationIdentityType?: string;
    } | null;
  } | null;
  body?: { contentType?: string; content?: string };
  attachments?: Array<{
    id?: string;
    name?: string | null;
    contentType?: string;
    content?: string | null;
  }>;
  reactions?: Array<{ reactionType?: string; user?: { user?: { id?: string } } }>;
  replies?: ChatMessage[];
}

export interface Chat {
  id?: string;
  topic?: string | null;
  chatType?: string;
  lastUpdatedDateTime?: string;
  members?: ChatMember[];
  lastMessagePreview?: ChatMessage | null;
  /** Present when the chat was read with its installed apps expanded (a bot chat names its app). */
  installedApps?: Array<{ teamsApp?: { displayName?: string | null } | null }>;
  /** Present when the caller has messages to offer: the first app sender names a bot chat. */
  messages?: ChatMessage[];
  viewpoint?: { lastMessageReadDateTime?: string } | null;
}

export interface Team {
  id?: string;
  displayName?: string;
  description?: string | null;
}

export interface Channel {
  id?: string;
  displayName?: string;
  membershipType?: string;
}

/** Tool roles the Teams views may call back (see actions.ts). */
export interface TeamsActions {
  me?: string;
  chatList?: string;
  chatGet?: string;
  chatMessages?: string;
  chatSend?: string;
  chatReply?: string;
  chatReplies?: string;
  teamsList?: string;
  channelsList?: string;
  channelMessages?: string;
  channelReplies?: string;
  channelSend?: string;
  channelReply?: string;
}

/** The proposal a model hands the composer for the user to review (never sent by the tool). */
export interface ComposeProposal {
  text: string;
  chatId?: string;
  teamId?: string;
  channelId?: string;
  recipients?: string[];
  title?: string;
}

/** What a conversation view is showing. */
export type ConversationTarget =
  | { kind: 'chat'; chatId: string; title: string; titleKnown?: boolean }
  | { kind: 'channel'; teamId: string; channelId: string; title: string };
