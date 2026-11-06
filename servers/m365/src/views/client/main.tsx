/**
 * Browser entry point, bundled with the MCP Apps SDK, React and Fluent UI into each view document.
 *
 * The same bundle serves every view; the inline `#k-config` JSON names the mode (inbox, message,
 * draft) and the tool names the view may call. The SDK `App` handles the handshake, host context,
 * tool calls, links and messages; this file adapts it to React.
 */
import { App } from '@modelcontextprotocol/ext-apps/app-with-deps';
import {
  FluentProvider,
  MessageBar,
  MessageBarBody,
  Spinner,
  teamsHighContrastTheme,
} from '@fluentui/react-components';
import type { ReactElement } from 'react';
import { useMemo, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { setFormatContext } from '../lib/format.js';
import { frameStyle, pageSignalsDark, themeKind } from '../lib/host-theme.js';
import { type HostBridge, MailApi, type ToolResultLike, parseToolResult } from '../mail/api.js';
import type { ViewActions } from '../actions.js';
import type { CalendarEvent } from '../calendar/types.js';
import type { MailMessage, Page } from '../mail/types.js';
import { CalendarView } from '../ui/CalendarView.js';
import { ChatsView } from '../ui/ChatsView.js';
import { ContactCard, ContactsView } from '../ui/ContactsView.js';
import { FileDetail, FilesView } from '../ui/FilesView.js';
import { TasksView } from '../ui/TasksView.js';
import type { Contact } from '../contacts/types.js';
import type { DriveItem } from '../files/types.js';
import { ComposeView, ConversationView } from '../ui/ConversationView.js';
import type { ComposeProposal } from '../teams/types.js';
import type { ChatMessage, ConversationTarget } from '../teams/types.js';
import { Composer } from '../ui/Composer.js';
import { EventView } from '../ui/EventView.js';
import { Frame } from '../ui/Frame.js';
import { InboxView } from '../ui/InboxView.js';
import { ReadingView } from '../ui/ReadingView.js';
import {
  teamsViewDarkTheme,
  teamsViewLightTheme,
  viewDarkTheme,
  viewLightTheme,
} from '../ui/dark-theme.js';
import { ApiContext } from '../ui/shared.js';
import { StableFrame } from '../ui/StableFrame.js';

type Mode =
  | 'inbox'
  | 'message'
  | 'draft'
  | 'calendar'
  | 'event'
  | 'chats'
  | 'conversation'
  | 'files'
  | 'file'
  | 'contacts'
  | 'contact'
  | 'tasks';
interface ViewConfig {
  mode: Mode;
  actions: ViewActions;
}
type HostCtx = {
  theme?: string;
  locale?: string;
  timeZone?: string;
  styles?: { variables?: Record<string, unknown> };
};

interface State {
  args: Record<string, unknown>;
  result?: ToolResultLike;
  received: boolean;
  ctx: HostCtx;
  failure?: string;
}

/** The latest tool input, result and host context, readable by React. */
class Store {
  private state: State = { args: {}, received: false, ctx: {} };
  private listeners = new Set<() => void>();
  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  get = (): State => this.state;
  set(patch: Partial<State>): void {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach((fn) => fn());
  }
}

function readConfig(): ViewConfig {
  try {
    const parsed = JSON.parse(
      document.getElementById('k-config')?.textContent ?? '{}'
    ) as Partial<ViewConfig>;
    return { mode: parsed.mode ?? 'inbox', actions: parsed.actions ?? {} };
  } catch {
    return { mode: 'inbox', actions: {} };
  }
}

function useForcedColors(): boolean {
  return useSyncExternalStore(
    (fn) => {
      const mq = window.matchMedia('(forced-colors: active)');
      mq.addEventListener('change', fn);
      return () => mq.removeEventListener('change', fn);
    },
    () => window.matchMedia('(forced-colors: active)').matches
  );
}

function Root({ mode, api, store }: { mode: Mode; api: MailApi; store: Store }): ReactElement {
  const st = useSyncExternalStore(store.subscribe, store.get);
  const forced = useForcedColors();
  const kind = themeKind(st.ctx.theme, forced, pageSignalsDark());
  // Teams views take the Teams themes (purple brand); every other area stays on the web themes.
  const teams = mode === 'chats' || mode === 'conversation';
  const theme =
    kind === 'dark'
      ? teams
        ? teamsViewDarkTheme
        : viewDarkTheme
      : kind === 'highContrast'
        ? teamsHighContrastTheme
        : teams
          ? teamsViewLightTheme
          : viewLightTheme;
  const parsed = useMemo(
    () => parseToolResult<Page<MailMessage> & MailMessage>(st.result),
    [st.result]
  );
  const style = frameStyle(st.ctx.styles?.variables, kind === 'dark');
  const error = st.failure ?? parsed.error;

  let content: ReactElement;
  if (mode === 'inbox') {
    const failure =
      error ??
      (st.received && !parsed.data
        ? `The result is not a message list.${parsed.text ? `\n\n${parsed.text.slice(0, 400)}` : ''}`
        : undefined);
    content = (
      <Frame style={style}>
        <InboxView args={st.args} result={parsed.data} error={failure} received={st.received} />
      </Frame>
    );
  } else if (mode === 'calendar') {
    const failure =
      error ?? (st.received && !parsed.data ? 'The result is not an event list.' : undefined);
    content = (
      <Frame style={style}>
        <CalendarView
          args={st.args}
          result={parsed.data as never}
          error={failure}
          received={st.received}
        />
      </Frame>
    );
  } else if (mode === 'chats') {
    const failure =
      error ?? (st.received && !parsed.data ? 'The result is not a chat list.' : undefined);
    content = (
      <Frame style={style}>
        <ChatsView
          args={st.args}
          result={parsed.data as never}
          error={failure}
          received={st.received}
        />
      </Frame>
    );
  } else if (
    mode === 'conversation' &&
    (parsed.data as { compose?: unknown } | undefined)?.compose
  ) {
    const proposal = (parsed.data as unknown as { compose: ComposeProposal }).compose;
    content = (
      <Frame style={style}>
        <ComposeView key={JSON.stringify(proposal)} proposal={proposal} />
      </Frame>
    );
  } else if (mode === 'conversation') {
    const page = parsed.data as unknown as
      | { value?: ChatMessage[]; '@odata.nextLink'?: string }
      | undefined;
    const target: ConversationTarget | null =
      typeof st.args.chatId === 'string'
        ? { kind: 'chat', chatId: st.args.chatId, title: 'Chat' }
        : typeof st.args.teamId === 'string' && typeof st.args.channelId === 'string'
          ? {
              kind: 'channel',
              teamId: st.args.teamId,
              channelId: st.args.channelId,
              title: 'Channel',
            }
          : null;
    content = (
      <Frame style={style}>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : !st.received ? (
          <Spinner size="small" label="Waiting for messages…" />
        ) : !page || !Array.isArray(page.value) || !target ? (
          <MessageBar intent="error">
            <MessageBarBody>The result is not a message list.</MessageBarBody>
          </MessageBar>
        ) : (
          <ConversationView
            target={target}
            initial={page.value}
            nextLink={page['@odata.nextLink'] ?? null}
          />
        )}
      </Frame>
    );
  } else if (mode === 'files') {
    const failure =
      error ?? (st.received && !parsed.data ? 'The result is not a file list.' : undefined);
    content = (
      <Frame style={style}>
        <FilesView
          args={st.args}
          result={parsed.data as never}
          error={failure}
          received={st.received}
        />
      </Frame>
    );
  } else if (mode === 'contacts') {
    const failure =
      error ?? (st.received && !parsed.data ? 'The result is not a contact list.' : undefined);
    content = (
      <Frame style={style}>
        <ContactsView
          args={st.args}
          result={parsed.data as never}
          error={failure}
          received={st.received}
        />
      </Frame>
    );
  } else if (mode === 'contact') {
    const data = parsed.data as unknown as Contact | undefined;
    content = (
      <Frame style={style} padded>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : !st.received ? (
          <Spinner size="small" label="Waiting for contact…" />
        ) : !data || typeof data !== 'object' ? (
          <MessageBar intent="error">
            <MessageBarBody>The result is not a contact.</MessageBarBody>
          </MessageBar>
        ) : (
          <ContactCard key={data.id} contact={data} />
        )}
      </Frame>
    );
  } else if (mode === 'tasks') {
    const failure =
      error ?? (st.received && !parsed.data ? 'The result is not a task list.' : undefined);
    content = (
      <Frame style={style}>
        <TasksView
          args={st.args}
          result={parsed.data as never}
          error={failure}
          received={st.received}
        />
      </Frame>
    );
  } else if (mode === 'file') {
    const data = parsed.data as unknown as DriveItem | undefined;
    content = (
      <Frame style={style} padded>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : !st.received ? (
          <Spinner size="small" label="Waiting for file…" />
        ) : !data || !data.name ? (
          <MessageBar intent="error">
            <MessageBarBody>The result is not a file.</MessageBarBody>
          </MessageBar>
        ) : (
          <FileDetail
            key={data.id}
            item={data}
            driveId={typeof st.args.driveId === 'string' ? st.args.driveId : undefined}
          />
        )}
      </Frame>
    );
  } else if (
    mode === 'event' &&
    (parsed.data as { reviewRequired?: boolean } | undefined)?.reviewRequired
  ) {
    const proposed = (parsed.data as unknown as { proposed?: CalendarEvent }).proposed ?? {};
    content = (
      <Frame style={style} padded>
        <EventView key={JSON.stringify(proposed)} initial={proposed} isNew />
      </Frame>
    );
  } else if (mode === 'event') {
    const data = parsed.data as unknown as CalendarEvent | undefined;
    content = (
      <Frame style={style} padded>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : !st.received ? (
          <Spinner size="small" label="Waiting for event…" />
        ) : !data || !(data.id || data.subject !== undefined) ? (
          <MessageBar intent="error">
            <MessageBarBody>The result is not an event.</MessageBarBody>
          </MessageBar>
        ) : (
          <EventView
            key={data.id}
            initial={data}
            fetchFull={api.can('eventGet') && !data.attendees}
          />
        )}
      </Frame>
    );
  } else {
    const data = parsed.data;
    content = (
      <Frame style={style} padded>
        {error ? (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        ) : !st.received ? (
          <Spinner
            size="small"
            label={mode === 'message' ? 'Waiting for message…' : 'Waiting for draft…'}
          />
        ) : !data || !(data.id || data.subject !== undefined || data.body) ? (
          <MessageBar intent="error">
            <MessageBarBody>
              {mode === 'message'
                ? 'The result is not a message.'
                : 'The result is not a draft message.'}
            </MessageBarBody>
          </MessageBar>
        ) : mode === 'message' ? (
          <ReadingView
            key={data.id}
            initial={[data]}
            focusId={data.id}
            autoLoadConversation={Boolean(data.conversationId) && api.can('list')}
          />
        ) : (
          <Composer key={data.id} draft={data} />
        )}
      </Frame>
    );
  }
  return (
    <FluentProvider theme={theme} style={{ background: 'transparent' }}>
      <ApiContext.Provider value={api}>
        <StableFrame>{content}</StableFrame>
      </ApiContext.Provider>
    </FluentProvider>
  );
}

async function start(): Promise<void> {
  const config = readConfig();
  const store = new Store();
  const app = new App({ name: 'mail-views', version: '1.0.0' }, {}, { autoResize: true });
  const caps = (): Record<string, unknown> =>
    (app.getHostCapabilities() ?? {}) as Record<string, unknown>;
  const host: HostBridge = {
    callTool: (name, args) =>
      app.callServerTool({ name, arguments: args }) as Promise<ToolResultLike>,
    openLink: async (url) => {
      await app.openLink({ url });
    },
    sendMessage: async (text) => {
      await app.sendMessage({ role: 'user', content: [{ type: 'text', text }] });
    },
    canCallTools: () => Boolean(caps().serverTools),
    canOpenLinks: () => Boolean(caps().openLinks),
    canMessage: () => Boolean(caps().message),
  };
  const api = new MailApi(host, config.actions);
  const applyContext = (ctx: HostCtx): void => {
    setFormatContext(ctx);
    store.set({ ctx });
  };

  // Handlers are registered before connect(): the host may send the result right after it.
  app.ontoolinput = (params) =>
    store.set({ args: (params.arguments ?? {}) as Record<string, unknown> });
  app.ontoolresult = (res) => store.set({ result: res as ToolResultLike, received: true });
  app.onhostcontextchanged = (ctx) =>
    applyContext({ ...(app.getHostContext() as HostCtx), ...(ctx as HostCtx) });
  app.onteardown = async () => ({});

  const root = document.getElementById('app') as HTMLElement;
  createRoot(root).render(<Root mode={config.mode} api={api} store={store} />);

  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('The host did not respond.')), 5000)
  );
  try {
    await Promise.race([app.connect(), timeout]);
    const ctx = app.getHostContext();
    if (ctx) applyContext(ctx as HostCtx);
  } catch (e) {
    store.set({
      failure: `${(e as Error).message} The same information is in the tool result text.`,
    });
  }
}

void start();
