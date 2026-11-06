/**
 * Server side of the interactive mail views (MCP Apps).
 *
 * Views are linked to existing tools purely through tool metadata (`_meta.ui.resourceUri`) and
 * served as `ui://` resources. Tool results are never touched, so a client that does not render
 * apps (a workflow engine calling tools/call over HTTP, say) receives byte-identical output with
 * or without the views. Which tools carry a view, and which tools a view may call back, is declared
 * in endpoints.json (`appView`, `appViewAction`) so this module names no tools.
 */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { RESOURCE_MIME_TYPE, registerAppResource } from '@modelcontextprotocol/ext-apps/server';
import { VIEW_BUNDLE_JS } from '../generated/views-bundle.js';
import type { ViewActions } from './actions.js';

export enum AppViewId {
  Inbox = 'inbox',
  Message = 'message',
  Draft = 'draft',
  Calendar = 'calendar',
  Event = 'event',
  Chats = 'chats',
  Conversation = 'conversation',
  Files = 'files',
  File = 'file',
  Contacts = 'contacts',
  Contact = 'contact',
  Tasks = 'tasks',
}

interface AppViewDef {
  uri: string;
  name: string;
  description: string;
}

/** The `ui://` resource behind each view. */
export const APP_VIEWS: Readonly<Record<AppViewId, AppViewDef>> = {
  [AppViewId.Inbox]: {
    uri: 'ui://mail/inbox.html',
    name: 'Mail list view',
    description:
      'Folders, conversations, read state, flags and paging for a list of mail messages.',
  },
  [AppViewId.Message]: {
    uri: 'ui://mail/message.html',
    name: 'Mail message view',
    description: 'One message with sanitised body, attachments, conversation and reply actions.',
  },
  [AppViewId.Calendar]: {
    uri: 'ui://calendar/view.html',
    name: 'Calendar view',
    description: 'Day, week and agenda views of calendar events with navigation.',
  },
  [AppViewId.Event]: {
    uri: 'ui://calendar/event.html',
    name: 'Calendar event view',
    description: 'One event: attendees, location, body, responses and editing.',
  },
  [AppViewId.Chats]: {
    uri: 'ui://teams/chats.html',
    name: 'Teams chat list',
    description: 'Chats and, when enabled, teams and channels, with filter pills.',
  },
  [AppViewId.Conversation]: {
    uri: 'ui://teams/conversation.html',
    name: 'Teams conversation view',
    description:
      'A chat or channel conversation with threaded replies and a composer; sending needs approval.',
  },
  [AppViewId.Files]: {
    uri: 'ui://files/explorer.html',
    name: 'Files explorer',
    description: 'Folder breadcrumb, list or grid of files, and file commands.',
  },
  [AppViewId.File]: {
    uri: 'ui://files/file.html',
    name: 'File details',
    description: 'One file with open, download, rename and delete.',
  },
  [AppViewId.Contacts]: {
    uri: 'ui://contacts/list.html',
    name: 'Contacts',
    description: 'Alphabetical contact list with search and a contact card.',
  },
  [AppViewId.Contact]: {
    uri: 'ui://contacts/card.html',
    name: 'Contact card',
    description: 'One contact with quick actions and labelled fields.',
  },
  [AppViewId.Tasks]: {
    uri: 'ui://tasks/list.html',
    name: 'To Do',
    description: 'Task lists and tasks with check-off and add.',
  },
  [AppViewId.Draft]: {
    uri: 'ui://mail/draft.html',
    name: 'Mail draft review view',
    description: 'Review and edit a draft; sending needs the user to approve the send call.',
  },
};

/** True for a value that names a view. */
export function isAppViewId(value: unknown): value is AppViewId {
  return typeof value === 'string' && (Object.values(AppViewId) as string[]).includes(value);
}

/** Tool metadata that links a tool to a view. Added only to the tool definition. */
export function appViewToolMeta(view: AppViewId): { ui: { resourceUri: string } } {
  return { ui: { resourceUri: APP_VIEWS[view].uri } };
}

/** JSON safe to inline inside a script element. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * The complete, self-contained document for a view: inline script (SDK included) and a strict
 * content security policy that allows no network access, frames or remote images.
 */
export function buildViewHtml(view: AppViewId, actions: ViewActions): string {
  const csp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; " +
    "connect-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  return (
    '<!doctype html><html lang="en" style="overflow:hidden"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<title>${APP_VIEWS[view].name}</title></head><body style="margin:0;overflow:hidden;font-family:'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif">` +
    '<div id="app"></div><div id="k-live" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)" role="status" aria-live="polite"></div>' +
    `<script type="application/json" id="k-config">${inlineJson({ mode: view, actions })}</script>` +
    `<script>${VIEW_BUNDLE_JS}</script></body></html>`
  );
}

/** Registers the resources for the given views. */
export function registerAppViewResources(
  server: Pick<McpServer, 'registerResource'>,
  views: ReadonlySet<AppViewId>,
  actions: ViewActions
): void {
  for (const view of views) {
    const def = APP_VIEWS[view];
    registerAppResource(
      server,
      def.name,
      def.uri,
      { description: def.description, mimeType: RESOURCE_MIME_TYPE },
      async () => ({
        contents: [
          { uri: def.uri, mimeType: RESOURCE_MIME_TYPE, text: buildViewHtml(view, actions) },
        ],
      })
    );
  }
}

/** Option flag helper: views are on unless explicitly disabled. */
export function appViewsEnabled(
  option: boolean | undefined,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  if (option === false) return false;
  return !(env.MS365_MCP_DISABLE_APP_VIEWS === 'true' || env.MS365_MCP_DISABLE_APP_VIEWS === '1');
}
