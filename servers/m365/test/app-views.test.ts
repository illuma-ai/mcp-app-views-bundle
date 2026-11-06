import { readFileSync } from 'node:fs';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { describe, expect, it, vi } from 'vitest';
import { appViewsEnabled, buildViewHtml, AppViewId } from '../src/views/app-views.js';
import { REVIEW_GUIDANCE_MARKER, registerGraphTools } from '../src/graph-tools.js';
import { getCombinedPresetPattern } from '../src/tool-categories.js';
import type { GraphClient } from '../src/graph-client.js';

vi.mock('../src/logger.js', () => ({
  default: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

/** The tools each view is linked to, and the roles the views call back. Mirrors endpoints.json. */
const LINKED: Record<string, string[]> = {
  'ui://mail/inbox.html': ['list-mail-messages', 'list-mail-folder-messages'],
  'ui://mail/message.html': ['get-mail-message'],
  'ui://teams/chats.html': ['list-chats', 'list-joined-teams'],
  'ui://teams/conversation.html': [
    'list-chat-messages',
    'get-chat-message',
    'list-channel-messages',
    'compose-chat-message',
  ],
  'ui://files/explorer.html': ['list-folder-files'],
  'ui://files/file.html': ['get-drive-item'],
  'ui://contacts/list.html': ['list-outlook-contacts', 'list-contact-folder-contacts'],
  'ui://contacts/card.html': ['get-outlook-contact'],
  'ui://tasks/list.html': ['list-todo-task-lists', 'list-todo-tasks'],
  'ui://calendar/view.html': ['list-calendar-events', 'get-calendar-view'],
  'ui://calendar/event.html': [
    'get-calendar-event',
    'create-calendar-event',
    'update-calendar-event',
    'compose-calendar-event',
  ],
  'ui://mail/draft.html': [
    'create-draft-email',
    'create-reply-draft',
    'create-reply-all-draft',
    'create-forward-draft',
  ],
};
const CALLBACK_TOOLS = [
  'update-todo-task',
  'create-todo-task',
  'search-onedrive-files',
  'move-rename-onedrive-item',
  'delete-onedrive-file',
  'create-onedrive-folder',
  'get-current-user',
  'list-team-channels',
  'list-chat-message-replies',
  'get-chat',
  'list-channel-message-replies',
  'send-chat-message',
  'reply-to-chat-message',
  'send-channel-message',
  'reply-to-channel-message',
  'delete-calendar-event',
  'accept-calendar-event',
  'tentatively-accept-calendar-event',
  'decline-calendar-event',
  'move-mail-message',
  'delete-mail-message',
  'create-draft-email',
  'list-mail-folders',
  'update-mail-message',
  'send-draft-message',
  'list-mail-messages',
  'list-mail-folder-messages',
  'get-mail-message',
  'create-reply-draft',
  'create-reply-all-draft',
  'create-forward-draft',
];
const MIME = 'text/html;profile=mcp-app';
const LEAST_PRIVILEGE_SCOPES = 'User.Read Mail.ReadWrite Mail.Send Calendars.ReadWrite';
const FILES_SCOPES = 'Files.ReadWrite Contacts.Read Tasks.ReadWrite';
const CHAT_SCOPES = 'Chat.ReadBasic ChatMember.Read ChatMessage.Read ChatMessage.Send';
const CHANNEL_SCOPES =
  'Team.ReadBasic.All Channel.ReadBasic.All ChannelMessage.Read.All ChannelMessage.Send';

const FIXED_BODY = JSON.stringify({
  id: 'AAMk1',
  subject: 'Quarterly review',
  conversationId: 'conv-1',
  body: { contentType: 'html', content: '<p>Hello</p>' },
  '@odata.nextLink': 'https://graph.microsoft.com/v1.0/me/messages?$skip=10',
});

function fakeGraph(): GraphClient {
  return {
    graphRequest: vi.fn(async () => ({ content: [{ type: 'text', text: FIXED_BODY }] })),
    serialize: (data: unknown) => JSON.stringify(data),
  } as unknown as GraphClient;
}

async function connect(options: Parameters<typeof registerGraphTools>[2]) {
  const server = new McpServer({ name: 'test', version: '0.0.0' });
  registerGraphTools(server, fakeGraph(), options);
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

describe('app view registration', () => {
  it('links the expected tools to ui:// resources through _meta.ui.resourceUri', async () => {
    const client = await connect({ appViews: true, orgMode: true });
    const { tools } = await client.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const [uri, names] of Object.entries(LINKED)) {
      for (const name of names) {
        const meta = byName.get(name)?._meta as { ui?: { resourceUri?: string } } | undefined;
        expect(meta?.ui?.resourceUri, name).toBe(uri);
      }
    }
    // Only linked tools carry view metadata.
    const linked = new Set(Object.values(LINKED).flat());
    for (const tool of tools) {
      if (!linked.has(tool.name)) expect(tool._meta?.ui, tool.name).toBeUndefined();
    }
  });

  it('serves each view as an app resource with the app MIME type and a self-contained document', async () => {
    const client = await connect({ appViews: true, orgMode: true });
    const { resources } = await client.listResources();
    expect(resources.map((r) => r.uri).sort()).toEqual(Object.keys(LINKED).sort());
    for (const uri of Object.keys(LINKED)) {
      const res = await client.readResource({ uri });
      const content = res.contents[0] as { mimeType?: string; text?: string };
      expect(content.mimeType).toBe(MIME);
      expect(content.text).toMatch(/^<!doctype html>/);
      expect(content.text).toContain('id="k-config"');
    }
  });

  it('passes the enabled callback tools to the view and leaves out disabled ones', async () => {
    const client = await connect({ appViews: true, orgMode: true });
    const res = await client.readResource({ uri: 'ui://mail/draft.html' });
    const html = (res.contents[0] as { text: string }).text;
    const config = JSON.parse(/id="k-config">([^<]*)</.exec(html)?.[1] ?? '{}') as {
      mode: string;
      actions: Record<string, string>;
    };
    expect(config.mode).toBe('draft');
    expect(config.actions).toMatchObject({
      update: 'update-mail-message',
      send: 'send-draft-message',
      reply: 'create-reply-draft',
      folders: 'list-mail-folders',
      discard: 'delete-mail-message',
      compose: 'create-draft-email',
      move: 'move-mail-message',
    });

    const readOnly = await connect({ appViews: true, orgMode: true, readOnly: true });
    const uris = (await readOnly.listResources()).resources.map((r) => r.uri).sort();
    // Draft-creating tools do not exist in read-only mode, so neither does their view.
    expect(uris).toEqual([
      'ui://calendar/event.html',
      'ui://calendar/view.html',
      'ui://contacts/card.html',
      'ui://contacts/list.html',
      'ui://files/explorer.html',
      'ui://files/file.html',
      'ui://mail/inbox.html',
      'ui://mail/message.html',
      'ui://tasks/list.html',
      'ui://teams/chats.html',
      'ui://teams/conversation.html',
    ]);
  });

  it('registers no view metadata or resources when views are off', async () => {
    const client = await connect({ appViews: false, orgMode: true });
    const { tools } = await client.listTools();
    expect(tools.some((t) => t._meta?.ui)).toBe(false);
    await expect(client.listResources()).rejects.toThrow();
  });

  it('keeps tools/call output byte-identical with and without the views', async () => {
    const withViews = await connect({ appViews: true, orgMode: true });
    const without = await connect({ appViews: false, orgMode: true });
    for (const [name, args] of [
      ['list-mail-messages', { top: 5 }],
      ['get-mail-message', { messageId: 'AAMk1' }],
      ['list-mail-folders', {}],
    ] as const) {
      const a = await withViews.callTool({ name, arguments: { ...args } });
      const b = await without.callTool({ name, arguments: { ...args } });
      expect(JSON.stringify(a), name).toBe(JSON.stringify(b));
      expect(a.isError).toBeFalsy();
      // The result is only the tool's own content: no view metadata leaks into it.
      expect(a._meta).toBeUndefined();
    }
  });

  it('reads HTML bodies only when the view asks for them, leaving the default text', async () => {
    const graph = fakeGraph();
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGraphTools(server, graph, { appViews: true, orgMode: true });
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    const prefer = (): string => {
      const calls = (graph.graphRequest as ReturnType<typeof vi.fn>).mock.calls;
      return String(calls[calls.length - 1][1]?.headers?.Prefer ?? '');
    };
    await client.callTool({ name: 'get-mail-message', arguments: { messageId: 'A1' } });
    expect(prefer()).toContain('outlook.body-content-type="text"');
    await client.callTool({
      name: 'get-mail-message',
      arguments: { messageId: 'A1', bodyFormat: 'html' },
    });
    expect(prefer()).not.toContain('body-content-type');
    const last = (graph.graphRequest as ReturnType<typeof vi.fn>).mock.calls.at(-1) as unknown[];
    expect(JSON.stringify(last)).not.toContain('bodyFormat');
  });

  it('keeps tool input schemas and descriptions identical apart from _meta.ui', async () => {
    const strip = (tools: Array<Record<string, unknown>>) =>
      tools.map((t) => {
        const copy = { ...t } as Record<string, unknown>;
        // The review-first guidance is the one deliberate description difference.
        if (
          typeof copy.description === 'string' &&
          copy.description.startsWith(REVIEW_GUIDANCE_MARKER)
        ) {
          copy.description = copy.description.slice(copy.description.indexOf('\n\n') + 2);
        }
        const meta = { ...((copy._meta as Record<string, unknown> | undefined) ?? {}) };
        delete meta.ui;
        delete meta['ui/resourceUri'];
        if (Object.keys(meta).length) copy._meta = meta;
        else delete copy._meta;
        return copy;
      });
    // The compose tool exists only to open a view, so it is the one tool that is absent without views.
    const a = await (await connect({ appViews: true, orgMode: true })).listTools();
    a.tools = a.tools.filter((t) => !t.name.startsWith('compose-'));
    const b = await (await connect({ appViews: false, orgMode: true })).listTools();
    expect(strip(a.tools as never)).toEqual(strip(b.tools as never));
  });

  it('exposes the parameters the views send to each tool', async () => {
    const client = await connect({ appViews: true, orgMode: true });
    const { tools } = await client.listTools();
    const props = (name: string) =>
      Object.keys(
        (tools.find((t) => t.name === name)?.inputSchema as { properties?: object }).properties ??
          {}
      );
    const expectations: Record<string, string[]> = {
      'list-mail-messages': ['select', 'top', 'orderby', 'filter', 'skiptoken'],
      'list-mail-folder-messages': ['mailFolderId', 'select', 'top', 'orderby', 'skiptoken'],
      'list-mail-folders': ['top'],
      'get-mail-message': ['messageId', 'expand'],
      'update-mail-message': ['messageId', 'body', 'confirm'],
      'send-draft-message': ['messageId', 'confirm'],
      'delete-mail-message': ['messageId', 'confirm'],
      'list-chats': ['expand', 'top', 'skiptoken'],
      'list-chat-messages': ['chatId', 'top', 'skiptoken'],
      'send-chat-message': ['chatId', 'body', 'confirm'],
      'list-team-channels': ['teamId'],
      'list-channel-messages': ['teamId', 'channelId', 'top', 'skiptoken'],
      'list-channel-message-replies': ['teamId', 'channelId', 'chatMessageId'],
      'reply-to-channel-message': ['teamId', 'channelId', 'chatMessageId', 'body', 'confirm'],
      'send-channel-message': ['teamId', 'channelId', 'body', 'confirm'],
      'get-calendar-view': [
        'startDateTime',
        'endDateTime',
        'select',
        'orderby',
        'top',
        'timezone',
        'skiptoken',
      ],
      'get-calendar-event': ['eventId', 'timezone'],
      'update-calendar-event': ['eventId', 'body', 'confirm'],
      'create-calendar-event': ['body', 'confirm'],
      'accept-calendar-event': ['eventId', 'body', 'confirm'],
      'decline-calendar-event': ['eventId', 'body', 'confirm'],
      'tentatively-accept-calendar-event': ['eventId', 'body', 'confirm'],
      'delete-calendar-event': ['eventId', 'confirm'],
      'move-mail-message': ['messageId', 'body', 'confirm'],
      'create-draft-email': ['body', 'confirm'],
      'create-reply-draft': ['messageId', 'body', 'confirm'],
      'create-reply-all-draft': ['messageId', 'body', 'confirm'],
      'create-forward-draft': ['messageId', 'body', 'confirm'],
    };
    for (const [name, wanted] of Object.entries(expectations)) {
      expect(props(name), name).toEqual(expect.arrayContaining(wanted));
    }
  });

  it('every view-linked and callback tool stays enabled under the least-privilege scope set', async () => {
    const client = await connect({
      appViews: true,
      orgMode: true,
      enabledTools: getCombinedPresetPattern([
        'outlook',
        'calendar',
        'teams',
        'onedrive',
        'contacts',
        'tasks',
      ]),
      allowedScopes: `${LEAST_PRIVILEGE_SCOPES} ${CHAT_SCOPES} ${CHANNEL_SCOPES} ${FILES_SCOPES}`,
    });
    const { tools } = await client.listTools();
    const names = new Set(tools.map((t) => t.name));
    for (const name of [...Object.values(LINKED).flat(), ...CALLBACK_TOOLS]) {
      expect(names.has(name), `${name} must be enabled`).toBe(true);
    }
    const { resources } = await client.listResources();
    expect(resources).toHaveLength(12);
  });
});

describe('chats work without the channel tools', () => {
  it('keeps the chat views enabled with only chat scopes and drops every channel tool', async () => {
    const client = await connect({
      appViews: true,
      orgMode: true,
      enabledTools: getCombinedPresetPattern(['teams']),
      allowedScopes: `${LEAST_PRIVILEGE_SCOPES} ${CHAT_SCOPES}`,
    });
    const names = new Set((await client.listTools()).tools.map((t) => t.name));
    for (const n of [
      'list-chats',
      'list-chat-messages',
      'send-chat-message',
      'reply-to-chat-message',
      'get-current-user',
    ]) {
      expect(names.has(n), n).toBe(true);
    }
    for (const n of [
      'list-joined-teams',
      'list-team-channels',
      'list-channel-messages',
      'send-channel-message',
      'reply-to-channel-message',
    ]) {
      expect(names.has(n), n).toBe(false);
    }
    const uris = (await client.listResources()).resources.map((r) => r.uri);
    expect(uris).toEqual(
      expect.arrayContaining(['ui://teams/chats.html', 'ui://teams/conversation.html'])
    );
  });
});

describe('view document and flag', () => {
  it('builds a document with a strict policy and no external resources outside the bundle', () => {
    const html = buildViewHtml(AppViewId.Inbox, { list: 'x</script><b>' });
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("connect-src 'none'");
    expect(html).not.toContain('</script><b>');
    const shell = html.replace(/<script>[\s\S]*<\/script>/, '');
    expect(shell).not.toMatch(/src=|href=|@import|https?:\/\//);
    const config = JSON.parse(/id="k-config">([^<]*)</.exec(html)?.[1] ?? '{}');
    expect(config.actions.list).toBe('x</script><b>');
  });

  it('is on by default and off through the option or the environment variable', () => {
    expect(appViewsEnabled(undefined, {})).toBe(true);
    expect(appViewsEnabled(true, {})).toBe(true);
    expect(appViewsEnabled(false, {})).toBe(false);
    expect(appViewsEnabled(undefined, { MS365_MCP_DISABLE_APP_VIEWS: 'true' })).toBe(false);
    expect(appViewsEnabled(undefined, { MS365_MCP_DISABLE_APP_VIEWS: '1' })).toBe(false);
    expect(appViewsEnabled(undefined, { MS365_MCP_DISABLE_APP_VIEWS: 'no' })).toBe(true);
  });
});

describe('combined enabled-tools pattern', () => {
  it('registers every view and every tool they need with the documented pattern', async () => {
    const doc = readFileSync(new URL('../docs/interactive-views.md', import.meta.url), 'utf8');
    const pattern = /--enabled-tools '([^']+)'/.exec(doc)?.[1];
    expect(pattern).toBeTruthy();
    const client = await connect({ appViews: true, orgMode: true, enabledTools: pattern });
    const names = new Set((await client.listTools()).tools.map((x) => x.name));
    for (const name of [...Object.values(LINKED).flat(), ...CALLBACK_TOOLS]) {
      expect(names.has(name), name).toBe(true);
    }
    expect(names.size).toBe(pattern!.split('|').length);
    expect((await client.listResources()).resources).toHaveLength(12);
  });
});

describe('review before send', () => {
  const REVIEWED = JSON.parse(
    readFileSync(new URL('../src/endpoints.json', import.meta.url), 'utf8')
  )
    .filter((e: { reviewVia?: string }) => e.reviewVia)
    .map((e: { toolName: string; reviewVia: string }) => [e.toolName, e.reviewVia]) as Array<
    [string, string]
  >;
  const ARGS = {
    messageId: 'm1',
    chatId: 'c1',
    teamId: 't1',
    channelId: 'ch1',
    chatMessageId: 'x1',
    body: { subject: 'Plan', content: 'Hi' },
    subject: 'Plan',
  };

  async function connectWithGraph(options: Parameters<typeof registerGraphTools>[2]) {
    const graph = fakeGraph();
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGraphTools(server, graph, options);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    return { client, graph };
  }

  it('covers every send tool the owner named', () => {
    expect(REVIEWED.map(([n]) => n).sort()).toEqual(
      [
        'create-calendar-event',
        'forward-mail-message',
        'reply-all-mail-message',
        'reply-mail-message',
        'reply-to-channel-message',
        'reply-to-chat-message',
        'send-channel-message',
        'send-chat-message',
        'send-draft-message',
        'send-mail',
      ].sort()
    );
  });

  it('refuses a direct send without confirm, names the review tool and sends nothing', async () => {
    const { client, graph } = await connectWithGraph({ appViews: true, orgMode: true });
    for (const [name, via] of REVIEWED) {
      const result = await client.callTool({ name, arguments: { ...ARGS } });
      expect(result.isError, name).toBe(true);
      const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(payload, name).toMatchObject({
        error: 'review_required',
        reviewTool: via,
        sent: false,
      });
      expect(payload.message).toContain(via);
    }
    expect(graph.graphRequest).not.toHaveBeenCalled();
  });

  it('refuses a direct calendar event without confirm, creates nothing, and names the compose tool', async () => {
    const { client, graph } = await connectWithGraph({ appViews: true, orgMode: true });
    const result = await client.callTool({
      name: 'create-calendar-event',
      arguments: {
        body: {
          subject: 'Planning',
          start: { dateTime: '2026-11-06T10:00:00', timeZone: 'UTC' },
          attendees: [{ emailAddress: { address: 'a@example.test' } }],
        },
      },
    });
    expect(result.isError).toBe(true);
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(payload).toMatchObject({
      error: 'review_required',
      reviewTool: 'compose-calendar-event',
      sent: false,
    });
    expect(graph.graphRequest).not.toHaveBeenCalled();
  });

  it('opens the event form prefilled through the read-only compose tool and never writes', async () => {
    const { client, graph } = await connectWithGraph({ appViews: true, orgMode: true });
    const tool = (await client.listTools()).tools.find((t) => t.name === 'compose-calendar-event');
    expect((tool?._meta as { ui?: { resourceUri?: string } }).ui?.resourceUri).toBe(
      'ui://calendar/event.html'
    );
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    const result = await client.callTool({
      name: 'compose-calendar-event',
      arguments: {
        subject: 'Planning',
        start: '2026-11-06T10:00:00',
        end: '2026-11-06T10:30:00',
        timeZone: 'UTC',
        attendees: ['a@example.test'],
        location: 'Room 4',
        body: 'Agenda',
      },
    });
    expect(result.isError).toBeFalsy();
    const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
    expect(payload).toMatchObject({ reviewRequired: true, created: false });
    expect(payload.proposed).toMatchObject({
      subject: 'Planning',
      start: { dateTime: '2026-11-06T10:00:00', timeZone: 'UTC' },
      location: { displayName: 'Room 4' },
      attendees: [{ type: 'required', emailAddress: { address: 'a@example.test' } }],
      body: { content: 'Agenda' },
    });
    const bad = await client.callTool({
      name: 'compose-calendar-event',
      arguments: { subject: 'No times' },
    });
    expect(bad.isError).toBe(true);
    expect(graph.graphRequest).not.toHaveBeenCalled();
  });

  it('lets the same calls through with confirm: true, which only the views send', async () => {
    const { client, graph } = await connectWithGraph({ appViews: true, orgMode: true });
    const result = await client.callTool({
      name: 'send-chat-message',
      arguments: { chatId: 'c1', body: { body: { content: 'Hi' } }, confirm: true },
    });
    expect(result.isError).toBeFalsy();
    expect(graph.graphRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves the tools as they were when the views are off', async () => {
    const { client, graph } = await connectWithGraph({ appViews: false, orgMode: true });
    const result = await client.callTool({
      name: 'send-chat-message',
      arguments: { chatId: 'c1', body: { body: { content: 'Hi' } } },
    });
    expect(JSON.stringify(result)).not.toContain('review_required');
    expect(graph.graphRequest).toHaveBeenCalledTimes(1);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).not.toContain('compose-chat-message');
  });

  it('offers a read-only compose tool linked to the conversation view that sends nothing', async () => {
    const { client, graph } = await connectWithGraph({ appViews: true, orgMode: true });
    const tool = (await client.listTools()).tools.find((t) => t.name === 'compose-chat-message');
    expect((tool?._meta as { ui?: { resourceUri?: string } }).ui?.resourceUri).toBe(
      'ui://teams/conversation.html'
    );
    expect(tool?.annotations?.readOnlyHint).toBe(true);
    const ok = await client.callTool({
      name: 'compose-chat-message',
      arguments: { chatId: 'c1', text: 'Proposed words' },
    });
    expect(JSON.parse((ok.content as Array<{ text: string }>)[0].text)).toMatchObject({
      compose: { chatId: 'c1', text: 'Proposed words' },
      sent: false,
    });
    const bad = await client.callTool({
      name: 'compose-chat-message',
      arguments: { text: 'No target' },
    });
    expect(bad.isError).toBe(true);
    expect(graph.graphRequest).not.toHaveBeenCalled();
  });
});

describe('review-first guidance in tool descriptions', () => {
  const reviewed = JSON.parse(
    readFileSync(new URL('../src/endpoints.json', import.meta.url), 'utf8')
  )
    .filter((e: { reviewVia?: string }) => e.reviewVia)
    .map((e: { toolName: string; reviewVia: string }) => [e.toolName, e.reviewVia]) as Array<
    [string, string]
  >;

  it('names the review tool in every reviewed write tool when views are on, and not when they are off', async () => {
    const on = new Map(
      (await (await connect({ appViews: true, orgMode: true })).listTools()).tools.map((t) => [
        t.name,
        t.description ?? '',
      ])
    );
    const off = new Map(
      (await (await connect({ appViews: false, orgMode: true })).listTools()).tools.map((t) => [
        t.name,
        t.description ?? '',
      ])
    );
    for (const [tool, via] of reviewed) {
      expect(on.get(tool), tool).toContain(
        `${REVIEW_GUIDANCE_MARKER}to create or send this from a conversation, call ${via} first`
      );
      expect(on.get(tool), tool).toContain('needs confirm: true');
      expect(off.get(tool), tool).not.toContain(REVIEW_GUIDANCE_MARKER);
      // the rest of the description is untouched
      expect(on.get(tool)!.endsWith(off.get(tool)!), tool).toBe(true);
    }
  });

  it('makes each review tool the natural first choice', async () => {
    const on = new Map(
      (await (await connect({ appViews: true, orgMode: true })).listTools()).tools.map((t) => [
        t.name,
        t.description ?? '',
      ])
    );
    for (const via of new Set(reviewed.map(([, v]) => v))) {
      const description = on.get(via) ?? '';
      expect(description, via).toMatch(/Review first: use this|Use this to (create|send)/);
    }
    expect(on.get('compose-calendar-event')).toContain('Use this to create a calendar event');
    expect(on.get('compose-chat-message')).toContain('Use this to send a Teams chat');
  });
});

describe('compose-chat-message to yourself', () => {
  it('returns a clear error for me / myself instead of opening a composer that cannot send', async () => {
    const graph = fakeGraph();
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerGraphTools(server, graph, { appViews: true, orgMode: true });
    const client = new Client({ name: 'c', version: '0.0.0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(a), client.connect(b)]);
    for (const who of ['me', 'Myself']) {
      const result = await client.callTool({
        name: 'compose-chat-message',
        arguments: { recipients: [who], text: 'remember this' },
      });
      expect(result.isError, who).toBe(true);
      const payload = JSON.parse((result.content as Array<{ text: string }>)[0].text);
      expect(payload.error).toBe('self_chat_not_addressable');
      expect(payload.message).toContain('/me/chats');
    }
    expect(graph.graphRequest).not.toHaveBeenCalled();
  });
});
