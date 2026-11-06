// @vitest-environment happy-dom
/** Shared helpers for the view tests: a fake host connection and React rendering with act(). */
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import type { ReactElement } from 'react';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { vi } from 'vitest';
import { type HostBridge, MailApi, type ToolResultLike } from '../../src/views/mail/api.js';
import type { ViewActions } from '../../src/views/actions.js';
import { ApiContext } from '../../src/views/ui/shared.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Tool names used by the tests; the roles are what the views know. */
export const ACTIONS: Required<ViewActions> = {
  list: 'tool-list',
  listFolder: 'tool-list-folder',
  folders: 'tool-folders',
  get: 'tool-get',
  update: 'tool-update',
  reply: 'tool-reply',
  replyAll: 'tool-reply-all',
  forward: 'tool-forward',
  send: 'tool-send',
  discard: 'tool-discard',
  compose: 'tool-compose',
  move: 'tool-move',
  calView: 'tool-cal-view',
  calList: 'tool-cal-list',
  eventGet: 'tool-event-get',
  eventCreate: 'tool-event-create',
  eventUpdate: 'tool-event-update',
  eventDelete: 'tool-event-delete',
  accept: 'tool-accept',
  tentative: 'tool-tentative',
  decline: 'tool-decline',
  me: 'tool-me',
  chatList: 'tool-chat-list',
  chatMessages: 'tool-chat-messages',
  chatSend: 'tool-chat-send',
  chatReply: 'tool-chat-reply',
  chatReplies: 'tool-chat-replies',
  teamsList: 'tool-teams-list',
  channelsList: 'tool-channels-list',
  channelMessages: 'tool-channel-messages',
  channelReplies: 'tool-channel-replies',
  channelSend: 'tool-channel-send',
  channelReply: 'tool-channel-reply',
  filesList: 'tool-files-list',
  fileGet: 'tool-file-get',
  fileSearch: 'tool-file-search',
  fileUpdate: 'tool-file-update',
  fileDelete: 'tool-file-delete',
  folderCreate: 'tool-folder-create',
  chatGet: 'tool-chat-get',
  contactsList: 'tool-contacts-list',
  contactGet: 'tool-contact-get',
  taskLists: 'tool-task-lists',
  tasksList: 'tool-tasks-list',
  taskUpdate: 'tool-task-update',
  taskCreate: 'tool-task-create',
};

/** Every tool name that changes data: the views may reach these only from an explicit button. */
export const WRITE_TOOLS: readonly string[] = [
  ACTIONS.update,
  ACTIONS.reply,
  ACTIONS.replyAll,
  ACTIONS.forward,
  ACTIONS.send,
  ACTIONS.discard,
  ACTIONS.compose,
  ACTIONS.move,
  ACTIONS.eventCreate,
  ACTIONS.eventUpdate,
  ACTIONS.eventDelete,
  ACTIONS.accept,
  ACTIONS.tentative,
  ACTIONS.decline,
  ACTIONS.chatSend,
  ACTIONS.chatReply,
  ACTIONS.channelSend,
  ACTIONS.channelReply,
  ACTIONS.fileUpdate,
  ACTIONS.fileDelete,
  ACTIONS.folderCreate,
  ACTIONS.taskUpdate,
  ACTIONS.taskCreate,
];

export const ok = (data: unknown): ToolResultLike => ({
  content: [{ type: 'text', text: JSON.stringify(data) }],
});

export function fakeHost(
  handler: (name: string, args: Record<string, unknown>) => unknown = () => ({})
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const host: HostBridge = {
    callTool: vi.fn(async (name, args) => {
      calls.push({ name, args });
      const out = handler(name, args);
      return (out as ToolResultLike)?.content ? (out as ToolResultLike) : ok(out);
    }),
    openLink: vi.fn(async () => undefined),
    sendMessage: vi.fn(async () => undefined),
    canCallTools: () => true,
    canOpenLinks: () => true,
    canMessage: () => true,
  };
  return { host, calls, api: new MailApi(host, ACTIONS) };
}

/** Lets pending promises and React updates settle. */
export async function settle(times = 3): Promise<void> {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

export interface Mounted {
  container: HTMLElement;
  unmount: () => void;
}

export async function mountView(element: ReactElement, api: MailApi): Promise<Mounted> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <FluentProvider theme={webLightTheme}>
        <ApiContext.Provider value={api}>{element}</ApiContext.Provider>
      </FluentProvider>
    );
  });
  await settle();
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

export async function click(el: Element | null | undefined): Promise<void> {
  if (!el) throw new Error('element to click not found');
  await act(async () => {
    (el as HTMLElement).click();
  });
  await settle();
}

/** Types into a React-controlled input or textarea. */
export async function type(
  el: HTMLInputElement | HTMLTextAreaElement,
  value: string
): Promise<void> {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  await act(async () => {
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

export const byText = (
  root: ParentNode,
  selector: string,
  text: string | RegExp
): HTMLElement | undefined =>
  Array.from(root.querySelectorAll<HTMLElement>(selector)).find((e) =>
    typeof text === 'string' ? e.textContent?.trim() === text : text.test(e.textContent ?? '')
  );

export const byLabel = (root: ParentNode, label: string): HTMLElement | null =>
  root.querySelector(`[aria-label="${label}"]`);

// happy-dom rejects a cancelled Web Animation with an unhandled AbortError; Fluent cancels its
// transitions on unmount. Animations are irrelevant to these tests, so they are stubbed out.
Element.prototype.animate = (() => ({
  finished: Promise.resolve(),
  cancel: () => undefined,
  finish: () => undefined,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  onfinish: null,
})) as unknown as Element['animate'];

/**
 * happy-dom does no layout, so a command bar cannot be measured. This gives every element with
 * role="toolbar" a width of `barWidth` and makes each of its children `itemWidth` wide, so a bar whose
 * children are wider than it overflows exactly as it would in a browser. Returns a function that undoes it.
 */
let undoBarLayout: (() => void) | null = null;

/** Undoes `stubBarLayout`; call it from afterEach. */
export function restoreBarLayout(): void {
  undoBarLayout?.();
  undoBarLayout = null;
}

export function stubBarLayout(barWidth: number, itemWidth = 100): () => void {
  restoreBarLayout();
  const proto = HTMLElement.prototype;
  const client = Object.getOwnPropertyDescriptor(proto, 'clientWidth');
  const scroll = Object.getOwnPropertyDescriptor(proto, 'scrollWidth');
  Object.defineProperty(proto, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'toolbar' ? barWidth : 0;
    },
  });
  Object.defineProperty(proto, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.getAttribute('role') === 'toolbar'
        ? Array.from(this.children).filter((c) => c.tagName !== 'I').length * itemWidth
        : 0;
    },
  });
  undoBarLayout = () => {
    if (client) Object.defineProperty(proto, 'clientWidth', client);
    else delete (proto as unknown as Record<string, unknown>).clientWidth;
    if (scroll) Object.defineProperty(proto, 'scrollWidth', scroll);
    else delete (proto as unknown as Record<string, unknown>).scrollWidth;
  };
  return restoreBarLayout;
}
