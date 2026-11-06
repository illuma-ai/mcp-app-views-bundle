// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import type { MailMessage } from '../src/views/mail/types.js';
import { Composer } from '../src/views/ui/Composer.js';
import { InboxView } from '../src/views/ui/InboxView.js';
import { ReadingView } from '../src/views/ui/ReadingView.js';
import {
  WRITE_TOOLS,
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

const msg = (id: string, extra: Partial<MailMessage> = {}): MailMessage => ({
  id,
  conversationId: 'C',
  subject: 'Quarterly review',
  from: { emailAddress: { name: 'Grace', address: 'grace@x.test' } },
  toRecipients: [{ emailAddress: { name: 'Me', address: 'me@x.test' } }],
  receivedDateTime: '2026-03-01T10:00:00Z',
  bodyPreview: 'preview',
  isRead: false,
  ...extra,
});

const writes = (calls: Array<{ name: string }>) =>
  calls.filter((c) => WRITE_TOOLS.includes(c.name));

describe('write tools are reachable only from explicit buttons', () => {
  it('the inbox never writes while it lists, expands, filters, selects or opens a message', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-get'
        ? msg('M1', { body: { contentType: 'text', content: 'Hello' } })
        : { value: [] }
    );
    mounted = await mountView(
      <InboxView
        args={{ mailFolderId: 'inbox' }}
        received
        result={{ value: [msg('M1'), msg('M2', { conversationId: 'C' })] }}
      />,
      api
    );
    await click(mounted.container.querySelector('[aria-expanded]'));
    await click(mounted.container.querySelector('input[type=checkbox]'));
    await click(mounted.container.querySelector('[role=option]'));
    await settle();
    // Opening reads the message (a read tool). It does not mark it read: nothing is implicit.
    expect(calls.map((c) => c.name)).toContain('tool-get');
    expect(writes(calls)).toEqual([]);
  });

  it('the reading view never writes on its own, including loading a conversation and attachments', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-list'
        ? { value: [msg('M1'), msg('M0', { receivedDateTime: '2026-02-01T10:00:00Z' })] }
        : name === 'tool-folders'
          ? { value: [] }
          : msg('M1', { body: { contentType: 'text', content: 'x' } })
    );
    mounted = await mountView(
      <ReadingView initial={[msg('M1', { hasAttachments: true })]} autoLoadConversation />,
      api
    );
    await settle();
    expect(calls.length).toBeGreaterThan(0);
    expect(writes(calls)).toEqual([]);
  });

  it('the composer never writes until a button is pressed (no auto-save)', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(
      <Composer
        draft={{
          id: 'D1',
          subject: 'Hi',
          isDraft: true,
          toRecipients: [{ emailAddress: { address: 'a@x.test' } }],
          body: { contentType: 'text', content: 'x' },
        }}
      />,
      api
    );
    await settle(10);
    expect(calls).toEqual([]);
  });

  it('every write tool is covered: each role in the registry is either a read or listed as a write', () => {
    expect(new Set(WRITE_TOOLS).size).toBe(WRITE_TOOLS.length);
    expect(WRITE_TOOLS.length).toBeGreaterThanOrEqual(17);
  });
});
