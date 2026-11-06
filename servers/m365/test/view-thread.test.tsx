// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_THREAD_PAGES, THREAD_SELECT } from '../src/views/mail/api.js';
import type { MailMessage } from '../src/views/mail/types.js';
import { InboxView } from '../src/views/ui/InboxView.js';
import { THREAD_VISIBLE, ReadingView } from '../src/views/ui/ReadingView.js';
import {
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  settle,
  type Mounted,
} from './helpers/view-harness.js';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

const FOLDERS = {
  value: [
    { id: 'f-inbox', displayName: 'Inbox' },
    { id: 'f-sent', displayName: 'Sent Items' },
  ],
};

const msg = (i: number, extra: Partial<MailMessage> = {}): MailMessage => ({
  id: `m${i}`,
  conversationId: 'C',
  subject: i === 0 ? 'Plan' : 'RE: Plan',
  from: { emailAddress: { name: `Person ${i}`, address: `p${i}@x.test` } },
  toRecipients: [{ emailAddress: { name: 'Me', address: 'me@x.test' } }],
  receivedDateTime: new Date(2026, 2, 1 + i, 9).toISOString(),
  bodyPreview: `preview ${i}`,
  parentFolderId: i % 2 ? 'f-sent' : 'f-inbox',
  isRead: true,
  ...extra,
});
const withBody = (m: MailMessage): MailMessage => ({
  ...m,
  body: { contentType: 'text', content: `full body of ${m.id}` },
});
const collapsed = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLButtonElement>('button[aria-label$="Expand message"]'));

describe('loading a conversation', () => {
  it('filters by conversationId with only the needed fields and no ordering', async () => {
    const { calls, api } = fakeHost(() => ({ value: [msg(0)] }));
    await api.loadConversation("C'1");
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('tool-list');
    expect(calls[0].args).toEqual({
      filter: "conversationId eq 'C''1'",
      select: THREAD_SELECT,
      top: 25,
    });
    expect(calls[0].args).not.toHaveProperty('orderby');
    expect(THREAD_SELECT.split(',')).toEqual(
      expect.arrayContaining([
        'id',
        'subject',
        'from',
        'toRecipients',
        'ccRecipients',
        'receivedDateTime',
        'sentDateTime',
        'bodyPreview',
        'hasAttachments',
        'isRead',
        'parentFolderId',
        'conversationId',
      ])
    );
    expect(THREAD_SELECT.split(',')).not.toContain('body');
  });

  it('follows the next link and stops at the page cap', async () => {
    let n = 0;
    const { calls, api } = fakeHost(() => ({
      value: [msg(n++)],
      '@odata.nextLink': `https://graph/next?$skip=${n * 50}`,
    }));
    const all = await api.loadConversation('C');
    expect(all).toHaveLength(MAX_THREAD_PAGES);
    expect(calls[1].args.skiptoken).toBe('https://graph/next?$skip=50');
    expect(calls[1].args.filter).toBe(calls[0].args.filter);
  });

  it('caches folder names after one list-folders call', async () => {
    const { calls, api } = fakeHost(() => FOLDERS);
    expect(api.folderName('f-sent')).toBeUndefined();
    await api.ensureFolders();
    await api.ensureFolders();
    expect(calls.filter((c) => c.name === 'tool-folders')).toHaveLength(1);
    expect(api.folderName('f-sent')).toBe('Sent Items');
  });
});

describe('thread view', () => {
  it('lists newest first, expands only the focused message and fetches bodies lazily', async () => {
    const all = [msg(0), msg(1), msg(2)];
    const { calls, api } = fakeHost((name, args) => {
      if (name === 'tool-list') return { value: all };
      if (name === 'tool-folders') return FOLDERS;
      if (name === 'tool-get')
        return withBody(all.find((m) => m.id === args.messageId) as MailMessage);
      return {};
    });
    mounted = await mountView(
      <ReadingView initial={[withBody(msg(2))]} autoLoadConversation />,
      api
    );
    await settle();
    const cards = collapsed(mounted.container);
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain('Person 1');
    expect(cards[1].textContent).toContain('Person 0');
    expect(mounted.container.textContent).toContain('full body of m2');
    // Collapsed cards show nothing but avatar, name, preview and date: no chips, no folder names.
    expect(cards[0].textContent).not.toMatch(/Inbox|Sent Items/);
    expect(calls.filter((c) => c.name === 'tool-get')).toEqual([]);
    await click(cards[0]);
    expect(calls.filter((c) => c.name === 'tool-get')).toEqual([
      { name: 'tool-get', args: { messageId: 'm1', bodyFormat: 'html' } },
    ]);
    expect(mounted.container.textContent).toContain('full body of m1');
    expect(collapsed(mounted.container)).toHaveLength(1);
  });

  it('folds a long thread behind "Show N earlier messages"', async () => {
    const all = Array.from({ length: 8 }, (_, i) => msg(i));
    const { api } = fakeHost((name) =>
      name === 'tool-list' ? { value: all } : name === 'tool-folders' ? FOLDERS : {}
    );
    mounted = await mountView(
      <ReadingView initial={[withBody(msg(7))]} autoLoadConversation />,
      api
    );
    await settle();
    const count = () => mounted!.container.querySelectorAll('[role=article]').length;
    expect(count()).toBe(THREAD_VISIBLE);
    const more = byText(mounted.container, 'button', /earlier/);
    expect(more?.textContent).toContain('Show 3 earlier messages');
    await click(more);
    expect(count()).toBe(8);
    expect(mounted.container.textContent).not.toContain('earlier messages');
  });

  it('keeps a focused older message visible in a long thread', async () => {
    const all = Array.from({ length: 8 }, (_, i) => msg(i));
    const { api } = fakeHost((name) =>
      name === 'tool-list' ? { value: all } : name === 'tool-folders' ? FOLDERS : {}
    );
    mounted = await mountView(
      <ReadingView initial={[withBody(msg(0))]} focusId="m0" autoLoadConversation />,
      api
    );
    await settle();
    expect(mounted.container.textContent).toContain('full body of m0');
    expect(mounted.container.textContent).toContain('Show 2 earlier messages');
  });

  it('shows a single message without a conversation load, folder call or earlier-messages control', async () => {
    const { calls, api } = fakeHost(() => ({}));
    mounted = await mountView(
      <ReadingView initial={[withBody({ ...msg(0), conversationId: undefined })]} />,
      api
    );
    expect(calls).toEqual([]);
    expect(collapsed(mounted.container)).toHaveLength(0);
    expect(mounted.container.textContent).toContain('full body of m0');
  });

  it('folds quoted history behind a pill', async () => {
    const { api } = fakeHost(() => ({}));
    const html =
      '<div>My answer</div><hr><div id="divRplyFwdMsg"><b>From:</b> A</div><div>the original text</div>';
    mounted = await mountView(
      <ReadingView
        initial={[
          { ...msg(0), conversationId: undefined, body: { contentType: 'html', content: html } },
        ]}
      />,
      api
    );
    expect(mounted.container.textContent).toContain('My answer');
    expect(mounted.container.textContent).not.toContain('the original text');
    await click(byLabel(mounted.container, 'Show quoted text'));
    expect(mounted.container.textContent).toContain('the original text');
  });

  it('opens the inline reply composer at the top of the thread without sending', async () => {
    const draft = {
      id: 'R1',
      subject: 'RE: Plan',
      isDraft: true,
      toRecipients: [{ emailAddress: { address: 'p0@x.test' } }],
      body: { contentType: 'text', content: '' },
    };
    const { calls, api } = fakeHost((name) => (name === 'tool-reply' ? draft : {}));
    mounted = await mountView(
      <ReadingView initial={[withBody({ ...msg(0), conversationId: undefined })]} />,
      api
    );
    await click(byText(mounted.container, 'button', 'Reply'));
    expect(calls).toEqual([
      { name: 'tool-reply', args: { messageId: 'm0', body: {}, confirm: true } },
    ]);
    const composer = mounted.container.querySelector(
      '[role=region][aria-label="Draft"]'
    ) as HTMLElement;
    expect(composer).not.toBeNull();
    const first = mounted.container.querySelector('[role=article]') as Node;
    expect(composer.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('inbox conversation rows', () => {
  it('groups a thread into one parent row with a chevron and child rows with folder tags', async () => {
    const all = [msg(0), msg(1), msg(2)];
    const { api } = fakeHost((name) => (name === 'tool-folders' ? FOLDERS : {}));
    mounted = await mountView(
      <InboxView
        args={{}}
        received
        result={{ value: [all[2], all[1], all[0], { ...msg(9), id: 'solo', conversationId: 'S' }] }}
      />,
      api
    );
    const rows = () =>
      Array.from(mounted!.container.querySelectorAll<HTMLElement>('[role=option]'));
    expect(rows()).toHaveLength(2);
    expect(rows()[0].querySelector('[aria-expanded]')).not.toBeNull();
    expect(rows()[1].querySelector('[aria-expanded]')).toBeNull();

    await click(rows()[0].querySelector('[aria-expanded]'));
    await settle();
    expect(rows()).toHaveLength(5);
    const child = rows()[1];
    expect(child.querySelector('.fui-Avatar')).toBeNull();
    expect(child.textContent).toContain('Person 2');
    expect(child.textContent).toContain('Inbox');
    expect(rows()[2].textContent).toContain('Sent Items');
  });
});
