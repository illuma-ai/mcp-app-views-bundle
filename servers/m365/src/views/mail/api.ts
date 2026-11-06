/**
 * The views' only way to reach the server: App-initiated tool calls through the host.
 *
 * Every call here is a normal tools/call that the host shows to the user for approval with its
 * full arguments before running; this module never talks to Microsoft Graph directly.
 */
import type { ActionRole, ViewActions } from '../actions.js';
import type { MailMessage } from './types.js';
import { stripSpotlight } from '../../lib/spotlight-strip.js';

/** What the views need from the host connection; main.ts adapts the SDK `App` to this. */
export interface HostBridge {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResultLike>;
  openLink(url: string): Promise<void>;
  sendMessage(text: string): Promise<void>;
  canCallTools(): boolean;
  canOpenLinks(): boolean;
  canMessage(): boolean;
}

export interface ToolResultLike {
  content?: Array<{ type: string; text?: string }>;
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ParsedResult<T = unknown> {
  data?: T;
  text?: string;
  error?: string;
}

function errorText(text: string): string {
  try {
    const j = JSON.parse(text) as { error?: unknown; message?: unknown };
    if (typeof j.error === 'string')
      return typeof j.message === 'string' ? `${j.error}: ${j.message}` : j.error;
    if (j.error && typeof (j.error as { message?: unknown }).message === 'string')
      return (j.error as { message: string }).message;
    if (typeof j.message === 'string') return j.message;
  } catch {
    /* not JSON */
  }
  return text || 'The tool reported an error.';
}

/** Reads a tool result: JSON data when it parses, the error text for a failed call, else raw text. */
export function parseToolResult<T = unknown>(res: ToolResultLike | undefined): ParsedResult<T> {
  if (!res) return { error: 'No result received.' };
  const text = (res.content ?? [])
    .filter((c) => c?.type === 'text' && typeof c.text === 'string')
    // The server wraps read results in spotlight markers for the model; the view reads the data.
    .map((c) => stripSpotlight(c.text ?? ''))
    .join('\n');
  if (res.isError) return { error: errorText(text) };
  if (res.structuredContent && typeof res.structuredContent === 'object') {
    return { data: res.structuredContent as T, text };
  }
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return { data: parsed as T, text };
  } catch {
    /* fall through */
  }
  return { text };
}

/** Fields requested for list rows. */
export const LIST_SELECT =
  'id,subject,from,toRecipients,ccRecipients,receivedDateTime,bodyPreview,isRead,isDraft,hasAttachments,importance,flag,conversationId,parentFolderId';
/** Adds the body, for opening a whole conversation in one call. */
/**
 * Fields requested when fetching the other messages of a conversation. No body: bodies are
 * fetched lazily, one message at a time, when a card is expanded.
 */
export const THREAD_SELECT =
  'id,subject,from,toRecipients,ccRecipients,receivedDateTime,sentDateTime,bodyPreview,hasAttachments,isRead,isDraft,importance,flag,parentFolderId,conversationId';
/** Upper bound on pages followed when loading one conversation. */
export const MAX_THREAD_PAGES = 5;
export const PAGE_SIZE = 10;

export interface FolderEntry {
  id: string;
  name: string;
  unread?: number;
}

export class MailApi {
  constructor(
    readonly host: HostBridge,
    readonly actions: ViewActions
  ) {}

  /** True when the host can run tools and the server enabled this role's tool. */
  can(role: ActionRole): boolean {
    return Boolean(this.actions[role]) && this.host.canCallTools();
  }

  /** Runs a role's tool and returns its parsed JSON. Throws with the server's error text on failure. */
  async call<T = unknown>(role: ActionRole, args: Record<string, unknown>): Promise<T> {
    const name = this.actions[role];
    if (!name) throw new Error('This action is not available on this server.');
    const parsed = parseToolResult<T>(await this.host.callTool(name, args));
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.data === undefined)
      throw new Error(
        parsed.text
          ? `Unexpected result: ${parsed.text.slice(0, 200)}`
          : 'The tool returned no data.'
      );
    return parsed.data;
  }

  /** Fetches one message, optionally with its attachment list. */
  getMessage(id: string, withAttachments = false): Promise<MailMessage> {
    return this.call<MailMessage>('get', {
      messageId: id,
      // The view renders the HTML body (sanitised); the server defaults reads to text.
      bodyFormat: 'html',
      ...(withAttachments
        ? { expand: 'attachments($select=id,name,contentType,size,isInline)' }
        : {}),
    });
  }

  /** Sets or clears fields on a message (read state, flag). */
  update(id: string, fields: Record<string, unknown>): Promise<unknown> {
    return this.call('update', { messageId: id, body: fields, confirm: true });
  }

  /** Moves a message to a folder (a well-known name such as archive or junkemail, or an id). */
  move(id: string, destinationId: string): Promise<unknown> {
    return this.call('move', { messageId: id, body: { destinationId }, confirm: true });
  }

  /** Creates a reply, reply-all or forward draft and returns it. */
  createDraft(kind: 'reply' | 'replyAll' | 'forward', id: string): Promise<MailMessage> {
    return this.call<MailMessage>(kind, { messageId: id, body: {}, confirm: true });
  }

  private folderNames: Map<string, string> | null = null;
  private folderEntries: FolderEntry[] = [];
  private folderLoad: Promise<void> | null = null;

  /** Every folder returned by the folder list (empty until loaded). */
  folders(): readonly FolderEntry[] {
    return this.folderEntries;
  }

  /** The display name of a folder id once folders were loaded; undefined before that. */
  folderName(id: string | undefined): string | undefined {
    return id ? this.folderNames?.get(id) : undefined;
  }

  /** Loads the folder list once (cached) so messages can show which folder they are in. */
  ensureFolders(): Promise<void> {
    if (this.folderNames || !this.can('folders')) return Promise.resolve();
    this.folderLoad ??= this.call<{
      value?: Array<{ id?: string; displayName?: string; unreadItemCount?: number }>;
    }>('folders', { top: 100 })
      .then((page) => {
        this.folderEntries = (page.value ?? [])
          .filter((f) => f.id && f.displayName)
          .map((f) => ({
            id: f.id as string,
            name: f.displayName as string,
            unread: f.unreadItemCount,
          }));
        this.folderNames = new Map(
          (page.value ?? [])
            .filter((f) => f.id && f.displayName)
            .map((f) => [f.id as string, f.displayName as string])
        );
      })
      .catch(() => {
        // Folder names are decoration; a failure leaves the badges off and is retried next time.
        this.folderLoad = null;
      });
    return this.folderLoad;
  }

  /**
   * Every loaded message of a conversation, across folders. Graph often rejects a conversationId
   * filter combined with an ordering, so no ordering is requested; callers sort client-side.
   * Follows the next link up to MAX_THREAD_PAGES pages.
   */
  async loadConversation(conversationId: string): Promise<MailMessage[]> {
    const out: MailMessage[] = [];
    let skiptoken: string | undefined;
    for (let page = 0; page < MAX_THREAD_PAGES; page++) {
      const args: Record<string, unknown> = {
        filter: `conversationId eq '${odataString(conversationId)}'`,
        select: THREAD_SELECT,
        top: 25,
      };
      if (skiptoken) args.skiptoken = skiptoken;
      const result = await this.call<{ value?: MailMessage[]; '@odata.nextLink'?: string }>(
        'list',
        args
      );
      out.push(...(result.value ?? []));
      skiptoken = result['@odata.nextLink'];
      if (!skiptoken) break;
    }
    return out;
  }

  openLink(url: string): void {
    if (!url || !this.host.canOpenLinks()) return;
    this.host.openLink(url).catch(() => undefined);
  }
}

/** Escapes a value for use inside a single-quoted OData string literal. */
export function odataString(value: string): string {
  return value.replace(/'/g, "''");
}
