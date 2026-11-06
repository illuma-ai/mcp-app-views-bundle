// @vitest-environment happy-dom
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildViewHtml, AppViewId } from '../src/views/app-views.js';
import { MailApi } from '../src/views/mail/api.js';
import type { MailMessage } from '../src/views/mail/types.js';
import { Composer } from '../src/views/ui/Composer.js';
import { InboxView } from '../src/views/ui/InboxView.js';
import { ReadingView } from '../src/views/ui/ReadingView.js';
import {
  ACTIONS,
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  settle,
  type,
  type Mounted,
} from './helpers/view-harness.js';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

const draft = (extra: Partial<MailMessage> = {}): MailMessage => ({
  id: 'D1',
  subject: 'Hello',
  isDraft: true,
  toRecipients: [{ emailAddress: { name: 'Ada', address: 'ada@x.test' } }],
  body: { contentType: 'text', content: 'Body text' },
  ...extra,
});

/** The primary half of the Send split button. */
const sendButton = (root: HTMLElement) => byText(root, 'button', 'Send') as HTMLButtonElement;

describe('draft composer send path', () => {
  it('makes no tool call just by being shown or edited', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<Composer draft={draft()} onClose={vi.fn()} />, api);
    await type(byLabel(mounted.container, 'Subject') as HTMLInputElement, 'Changed');
    await type(byLabel(mounted.container, 'Message body') as HTMLTextAreaElement, 'More text');
    await settle();
    expect(calls).toEqual([]);
  });

  it('calls the send tool only from a click on Send, with the draft id', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<Composer draft={draft()} />, api);
    expect(sendButton(mounted.container).disabled).toBe(false);
    await click(sendButton(mounted.container));
    expect(calls).toEqual([{ name: 'tool-send', args: { messageId: 'D1', confirm: true } }]);
    expect(mounted.container.textContent).toContain('The message was sent');
    expect(sendButton(mounted.container).disabled).toBe(true);
  });

  it('saves edits with the update tool first, then sends', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<Composer draft={draft()} />, api);
    await type(byLabel(mounted.container, 'Subject') as HTMLInputElement, 'New subject');
    await click(sendButton(mounted.container));
    expect(calls.map((c) => c.name)).toEqual(['tool-update', 'tool-send']);
    expect(calls[0].args).toEqual({
      messageId: 'D1',
      body: { subject: 'New subject' },
      confirm: true,
    });
  });

  it('does not send when saving the edits fails', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-update'
        ? { isError: true, content: [{ type: 'text', text: '{"error":"denied"}' }] }
        : {}
    );
    mounted = await mountView(<Composer draft={draft()} />, api);
    await type(byLabel(mounted.container, 'Subject') as HTMLInputElement, 'x');
    await click(sendButton(mounted.container));
    expect(calls.map((c) => c.name)).toEqual(['tool-update']);
    expect(mounted.container.textContent).toContain('Not sent: denied');
  });

  it('keeps Send disabled without a valid recipient, without tools, or without a send tool', async () => {
    const { host, api } = fakeHost();
    mounted = await mountView(<Composer draft={draft({ toRecipients: [] })} />, api);
    expect(sendButton(mounted.container).disabled).toBe(true);
    mounted.unmount();

    mounted = await mountView(<Composer draft={draft()} />, api);
    await type(byLabel(mounted.container, 'To') as HTMLInputElement, 'not-an-address');
    expect(sendButton(mounted.container).disabled).toBe(true);
    expect(mounted.container.textContent).toContain('Not a valid address');
    mounted.unmount();

    mounted = await mountView(
      <Composer draft={draft()} />,
      new MailApi({ ...host, canCallTools: () => false }, ACTIONS)
    );
    expect(sendButton(mounted.container).disabled).toBe(true);
    mounted.unmount();

    mounted = await mountView(
      <Composer draft={draft()} />,
      new MailApi(host, { ...ACTIONS, send: undefined })
    );
    expect(sendButton(mounted.container).disabled).toBe(true);
  });

  it('keeps reply history attached when the user writes above it', async () => {
    const { calls, api } = fakeHost();
    const html =
      '<div>Thanks</div><hr><div id="divRplyFwdMsg"><b>From:</b> A</div><div>original</div>';
    mounted = await mountView(
      <Composer
        draft={draft({ subject: 'RE: Hello', body: { contentType: 'html', content: html } })}
      />,
      api
    );
    const area = byLabel(mounted.container, 'Message body') as HTMLTextAreaElement;
    expect(area.value).toBe('Thanks');
    await type(area, 'Sounds good');
    await click(sendButton(mounted.container));
    const body = (calls[0].args.body as { body: { contentType: string; content: string } }).body;
    expect(body.contentType).toBe('html');
    expect(body.content).toBe(
      '<div>Sounds good</div><hr><div id="divRplyFwdMsg"><b>From:</b> A</div><div>original</div>'
    );
  });

  it('shows the Cc row on new mail and Cc/Bcc links on a reply', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<Composer draft={draft({ subject: '' })} />, api);
    expect(byLabel(mounted.container, 'Cc')).not.toBeNull();
    mounted.unmount();
    mounted = await mountView(<Composer draft={draft({ subject: 'RE: Hello' })} />, api);
    expect(byLabel(mounted.container, 'Cc')).toBeNull();
    expect(byText(mounted.container, 'button', 'Cc')).toBeDefined();
  });

  it('renders the original message below the composer, history folded behind the pill', async () => {
    const { api } = fakeHost();
    const html =
      '<div>Thanks</div><hr><div id="divRplyFwdMsg"><b>From:</b> Ada Lovelace &lt;ada@x.test&gt;<br><b>Sent:</b> Monday<br><b>To:</b> Jordan Rivera<br><b>Subject:</b> Plan</div><div>the original text</div>';
    mounted = await mountView(
      <Composer
        draft={draft({ subject: 'RE: Plan', body: { contentType: 'html', content: html } })}
      />,
      api
    );
    const composer = mounted.container.querySelector(
      '[role=region][aria-label="Draft"]'
    ) as HTMLElement;
    const original = mounted.container.querySelector(
      '[aria-label="Original message"]'
    ) as HTMLElement;
    expect(original.textContent).toContain('Ada Lovelace <ada@x.test>');
    expect(original.textContent).toContain('Jordan Rivera');
    expect(original.textContent).toContain('Monday');
    expect(original.textContent).toContain('the original text');
    expect(original.textContent).not.toContain('Subject:');
    // It sits in the same card, below the send bar and the fields (so the send bar stays over both).
    expect(composer.contains(original)).toBe(true);
    const subject = composer.querySelector('input[aria-label=Subject]') as HTMLElement;
    expect(
      subject.compareDocumentPosition(original) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('puts the Cc and Bcc links on the To row itself, after the field', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<Composer draft={draft({ subject: 'RE: Hello' })} />, api);
    const toField = (byLabel(mounted.container, 'To') as HTMLElement).parentElement as HTMLElement;
    expect(byText(toField, 'button', 'Cc')).toBeDefined();
    expect(byText(toField, 'button', 'Bcc')).toBeDefined();
  });

  it('is the only UI code that names the send role', () => {
    const offenders: string[] = [];
    for (const dir of ['ui', 'mail']) {
      const base = path.join(__dirname, '..', 'src', 'views', dir);
      for (const f of readdirSync(base)) {
        if (/(['"])send\1/.test(readFileSync(path.join(base, f), 'utf8')))
          offenders.push(`${dir}/${f}`);
      }
    }
    expect(offenders).toEqual(['ui/Composer.tsx']);
  });
});

describe('reading view actions', () => {
  const message = (id: string, extra: Partial<MailMessage> = {}): MailMessage => ({
    id,
    conversationId: 'C1',
    subject: 'Quarterly review',
    from: { emailAddress: { name: 'Grace', address: 'grace@x.test' } },
    toRecipients: [{ emailAddress: { name: 'Me', address: 'me@x.test' } }],
    receivedDateTime: '2026-03-01T10:00:00Z',
    isRead: false,
    body: { contentType: 'html', content: '<p>Hi <script>alert(1)</script><b>there</b></p>' },
    ...extra,
  });

  it('shows a sanitised body and the blocked-content bar', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<ReadingView initial={[message('M1')]} />, api);
    expect(mounted.container.innerHTML).not.toContain('<script');
    expect(mounted.container.textContent).toContain('Images and scripts have been blocked');
    expect(mounted.container.textContent).toContain('there');
  });

  it('fetches the HTML body and renders anchors as links, never as bracketed text', async () => {
    const html =
      '<p>See <a href="https://billing.example.test/pay">View in Notification Center</a></p><img src="https://cdn.example.test/logo.png" alt="logo">';
    const { calls, api } = fakeHost((name) =>
      name === 'tool-get'
        ? { ...message('M9', { body: { contentType: 'html', content: html } }) }
        : {}
    );
    mounted = await mountView(
      <ReadingView initial={[{ ...message('M9'), body: undefined }]} />,
      api
    );
    expect(calls).toEqual([{ name: 'tool-get', args: { messageId: 'M9', bodyFormat: 'html' } }]);
    const link = mounted.container.querySelector('a[href="https://billing.example.test/pay"]');
    expect(link?.textContent).toBe('View in Notification Center');
    expect(mounted.container.textContent).not.toMatch(/<https?:\/\//);
    expect(mounted.container.textContent).not.toMatch(/\[https?:\/\//);
    // Remote images stay blocked and the bar says so.
    expect(mounted.container.querySelector('img')).toBeNull();
    expect(mounted.container.textContent).toContain('Images and scripts have been blocked');
  });

  it('shows no blocked-content bar when nothing was blocked', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <ReadingView
        initial={[message('M1', { body: { contentType: 'html', content: '<p>plain</p>' } })]}
      />,
      api
    );
    expect(mounted.container.textContent).not.toContain('have been blocked');
  });

  it('shows display names on the To line with the address as a tooltip', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<ReadingView initial={[message('M1')]} />, api);
    const name = mounted.container.querySelector('[title="me@x.test"]') as HTMLElement;
    expect(name.textContent).toBe('Me');
    expect(mounted.container.textContent).not.toContain('<me@x.test>');
  });

  it('has no chips in the header: importance and flag are icons', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <ReadingView
        initial={[message('M1', { importance: 'high', flag: { flagStatus: 'flagged' } })]}
      />,
      api
    );
    expect(mounted.container.textContent).not.toMatch(
      /Unread|High importance|Flagged|Inbox|messages\b/
    );
    expect(mounted.container.querySelector('[title="High importance"]')).not.toBeNull();
    expect(mounted.container.querySelector('[title="Flagged"]')).not.toBeNull();
  });

  it('reply creates a draft and opens it, and never sends', async () => {
    const reply = draft({ id: 'R1', subject: 'RE: Quarterly review' });
    const { calls, api } = fakeHost((name) => (name === 'tool-reply' ? reply : {}));
    mounted = await mountView(<ReadingView initial={[message('M1')]} />, api);
    await click(byText(mounted.container, 'button', 'Reply'));
    expect(calls).toEqual([
      { name: 'tool-reply', args: { messageId: 'M1', body: {}, confirm: true } },
    ]);
    expect(mounted.container.querySelector('[role=region][aria-label="Draft"]')).not.toBeNull();
    expect(calls.some((c) => c.name === 'tool-send')).toBe(false);
  });
});

describe('inbox view', () => {
  const m = (
    id: string,
    conv: string,
    at: string,
    extra: Partial<MailMessage> = {}
  ): MailMessage => ({
    id,
    conversationId: conv,
    subject: `Subject ${conv}`,
    bodyPreview: `preview ${id}`,
    from: { emailAddress: { name: `Sender ${id}`, address: `${id}@x.test` } },
    receivedDateTime: at,
    isRead: true,
    ...extra,
  });
  const rows = (root: HTMLElement) => Array.from(root.querySelectorAll('[role=option]'));

  it('groups messages into conversations under date headers and marks unread', async () => {
    const { api } = fakeHost();
    const now = new Date();
    mounted = await mountView(
      <InboxView
        args={{ mailFolderId: 'inbox' }}
        received
        result={{
          value: [
            m('a2', 'A', now.toISOString(), { isRead: false }),
            m('a1', 'A', new Date(now.getTime() - 3600_000).toISOString()),
            m('b1', 'B', '2020-01-01T00:00:00Z'),
          ],
        }}
      />,
      api
    );
    expect(rows(mounted.container)).toHaveLength(2);
    expect(rows(mounted.container)[0].getAttribute('aria-label')).toMatch(/^Unread/);
    expect(
      mounted.container.querySelectorAll('li[role=presentation]').length
    ).toBeGreaterThanOrEqual(2);
  });

  it('pages with the same tool and the next link, keeping the original arguments', async () => {
    const { calls, api } = fakeHost(() => ({ value: [m('n1', 'N', '2026-01-01T00:00:00Z')] }));
    mounted = await mountView(
      <InboxView
        args={{ top: 10, mailFolderId: 'inbox' }}
        received
        result={{
          value: [m('x1', 'X', '2026-01-02T00:00:00Z')],
          '@odata.nextLink': 'https://graph/next?$skip=10',
        }}
      />,
      api
    );
    await click(byText(mounted.container, 'button', 'Load more'));
    expect(calls).toEqual([
      {
        name: 'tool-list-folder',
        args: { top: 10, mailFolderId: 'inbox', skiptoken: 'https://graph/next?$skip=10' },
      },
    ]);
    expect(rows(mounted.container)).toHaveLength(2);
  });

  it('opens a row with the get tool and shows the reading view with a back button', async () => {
    const full = m('x1', 'X', '2026-01-02T00:00:00Z', {
      body: { contentType: 'text', content: 'Full text' },
    });
    const { calls, api } = fakeHost((name) => (name === 'tool-get' ? full : {}));
    mounted = await mountView(
      <InboxView args={{}} received result={{ value: [m('x1', 'X', '2026-01-02T00:00:00Z')] }} />,
      api
    );
    await click(rows(mounted.container)[0]);
    expect(calls).toEqual([{ name: 'tool-get', args: { messageId: 'x1', bodyFormat: 'html' } }]);
    expect(mounted.container.textContent).toContain('Full text');
    await click(byLabel(mounted.container, 'Back to list'));
    expect(rows(mounted.container)).toHaveLength(1);
  });

  it('shows an error state', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<InboxView args={{}} received error="boom" />, api);
    expect(mounted.container.textContent).toContain('boom');
  });
});

describe('typography and theme', () => {
  it('declares a sans-serif fallback stack on the document and never loads a web font', () => {
    const html = buildViewHtml(AppViewId.Inbox, {});
    const shell = html.replace(/<script>[\s\S]*<\/script>/, '');
    expect(shell).toMatch(/font-family:'Segoe UI',system-ui[^"]*sans-serif/);
    expect(shell).not.toMatch(/@font-face|@import|<link/);
  });

  it('uses theme tokens only: no hex colours or font-family literals in the UI sources', () => {
    const base = path.join(__dirname, '..', 'src', 'views', 'ui');
    for (const f of readdirSync(base)) {
      const src = readFileSync(path.join(base, f), 'utf8');
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(src, f).not.toMatch(/fontFamily:\s*['"]/);
    }
  });

  it('renders no element with an inline font-family', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<Composer draft={draft()} />, api);
    for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
      expect(el.style?.fontFamily ?? '', el.tagName).toBe('');
    }
  });
});
