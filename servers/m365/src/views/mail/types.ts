/** Shapes of the Microsoft Graph mail resources the views read. Every field is optional. */

export interface EmailAddress {
  name?: string;
  address?: string;
}

export interface Recipient {
  emailAddress?: EmailAddress;
}

export interface MailAttachment {
  id?: string;
  name?: string;
  size?: number;
  contentType?: string;
  isInline?: boolean;
}

export interface MailMessage {
  id?: string;
  subject?: string | null;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  from?: Recipient;
  sender?: Recipient;
  toRecipients?: Recipient[];
  ccRecipients?: Recipient[];
  bccRecipients?: Recipient[];
  receivedDateTime?: string;
  sentDateTime?: string;
  isRead?: boolean;
  isDraft?: boolean;
  hasAttachments?: boolean;
  importance?: string;
  flag?: { flagStatus?: string };
  conversationId?: string;
  parentFolderId?: string;
  attachments?: MailAttachment[];
}

export interface MailFolder {
  id?: string;
  displayName?: string;
  unreadItemCount?: number;
  totalItemCount?: number;
}

/** A page of a Graph collection. */
export interface Page<T> {
  value?: T[];
  '@odata.nextLink'?: string;
}

/**
 * Tool names the views may call, keyed by role. The server fills this from endpoints.json for
 * the tools that are actually enabled, so a missing role means "not available" and the matching
 * control is disabled rather than guessed.
 */
export interface MailActions {
  list?: string;
  listFolder?: string;
  folders?: string;
  get?: string;
  update?: string;
  reply?: string;
  replyAll?: string;
  forward?: string;
  send?: string;
  /** Soft-deletes a message (used to discard a draft). */
  discard?: string;
  /** Creates an empty draft for a new message. */
  compose?: string;
  /** Moves a message to a folder (archive, junk, move to). */
  move?: string;
}
