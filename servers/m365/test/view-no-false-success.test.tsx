// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MailApi } from '../src/views/mail/api.js';
import type { MailMessage } from '../src/views/mail/types.js';
import { Composer } from '../src/views/ui/Composer.js';
import { ConversationView } from '../src/views/ui/ConversationView.js';
import { EventView } from '../src/views/ui/EventView.js';
import { FilesView } from '../src/views/ui/FilesView.js';
import { TasksView } from '../src/views/ui/TasksView.js';
import {
  ACTIONS,
  WRITE_TOOLS,
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  ok,
  settle,
  type,
  type Mounted,
} from './helpers/view-harness.js';

/**
 * Every form view shows its success state only after the tool call has resolved with a result that
 * proves the write happened, and shows an error (staying in the form) when it does not.
 */
let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

type Call = { name: string; args: Record<string, unknown> };

/** A host whose write calls stay pending until the test releases or rejects them. */
function gatedHost() {
  const base = fakeHost();
  const calls: Call[] = [];
  const pending: Array<{ resolve: (v: unknown) => void; reject: (e: Error) => void }> = [];
  const host = {
    ...base.host,
    callTool: vi.fn((name: string, args: Record<string, unknown>) => {
      // Reads answer at once; only the writes wait for the test.
      if (!WRITE_TOOLS.includes(name)) return Promise.resolve(ok({ value: [] }));
      return new Promise((resolve, reject) => {
        calls.push({ name, args });
        pending.push({ resolve: (v) => resolve(ok(v)), reject });
      });
    }),
  };
  return {
    api: new MailApi(host as never, ACTIONS),
    calls,
    resolve: async (value: unknown) => {
      pending.shift()?.resolve(value);
      await settle();
    },
    reject: async (message: string) => {
      pending.shift()?.reject(new Error(message));
      await settle();
    },
  };
}

const NOTE = 'Walk through the CSV export';
// What the compose tool hands the form, as the host delivers it after the tool input and result.
const proposed = {
  subject: 'CSV export review',
  start: { dateTime: '2026-11-06T15:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-11-06T15:30:00', timeZone: 'UTC' },
  attendees: [{ type: 'required', emailAddress: { address: 'a@example.test' } }],
  body: { contentType: 'text', content: NOTE },
};

describe('event form (the live sequence)', () => {
  it('shows the proposed description, sends the typed one once with confirm, and shows success only after the call resolves', async () => {
    const g = gatedHost();
    mounted = await mountView(<EventView isNew initial={proposed} />, g.api);
    const box = byLabel(mounted.container, 'Description') as HTMLTextAreaElement;
    expect(box.value).toBe(NOTE);
    await type(box, 'Typed by the user');
    await click(byText(mounted.container, 'button', 'Save'));
    // Pending: one call made, no success state, still the form.
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0]).toMatchObject({ name: ACTIONS.eventCreate, args: { confirm: true } });
    expect((g.calls[0].args.body as { body: { content: string } }).body.content).toBe(
      'Typed by the user'
    );
    expect(mounted.container.textContent).not.toContain('Event created.');
    expect(byLabel(mounted.container, 'Description')).toBeTruthy();
    await g.resolve({ id: 'N1', subject: 'CSV export review' });
    expect(mounted.container.textContent).toContain('Event created.');
    expect(g.calls).toHaveLength(1);
  });

  it('sends the proposed description even when the user does not touch it', async () => {
    const g = gatedHost();
    mounted = await mountView(<EventView isNew initial={proposed} />, g.api);
    await click(byText(mounted.container, 'button', 'Save'));
    expect((g.calls[0].args.body as { body: { content: string } }).body.content).toBe(NOTE);
    await g.resolve({ id: 'N1' });
  });

  it('stays in the form with an error when the call is rejected', async () => {
    const g = gatedHost();
    mounted = await mountView(<EventView isNew initial={proposed} />, g.api);
    await click(byText(mounted.container, 'button', 'Save'));
    await g.reject('Graph said no');
    expect(mounted.container.textContent).toContain('Graph said no');
    expect(mounted.container.textContent).not.toContain('Event created.');
    expect(byLabel(mounted.container, 'Description')).toBeTruthy();
  });

  it('does not claim success when the result is not the created event', async () => {
    const g = gatedHost();
    mounted = await mountView(<EventView isNew initial={proposed} />, g.api);
    await click(byText(mounted.container, 'button', 'Save'));
    // For example the proposal replayed instead of a created event.
    await g.resolve({ reviewRequired: true, proposed });
    expect(mounted.container.textContent).toContain('was not created');
    expect(mounted.container.textContent).not.toContain('Event created.');
    expect(byLabel(mounted.container, 'Description')).toBeTruthy();
  });

  it('shows no event card after Cancel on a new event, only that nothing was created', async () => {
    const g = gatedHost();
    mounted = await mountView(<EventView isNew initial={proposed} />, g.api);
    await click(byText(mounted.container, 'button', 'Cancel'));
    expect(mounted.container.textContent).toContain('Nothing was created.');
    expect(mounted.container.querySelector('[role=article]')).toBeNull();
    expect(g.calls).toEqual([]);
  });
});

describe('other forms show success only after the call resolves', () => {
  it('chat composer: no message appears before Send resolves, and a rejection shows an error', async () => {
    const g = gatedHost();
    mounted = await mountView(
      <ConversationView
        target={{ kind: 'chat', chatId: 'c1', title: 'Atlas', titleKnown: true }}
        initial={[]}
        draft="Proposed words"
      />,
      g.api
    );
    await click(byLabel(mounted.container, 'Send'));
    expect(g.calls).toHaveLength(1);
    expect(mounted.container.querySelector('[role=log]')?.textContent).not.toContain(
      'Proposed words'
    );
    await g.reject('Teams said no');
    expect(mounted.container.textContent).toContain('Teams said no');
    expect(mounted.container.querySelector('[role=log]')?.textContent).not.toContain(
      'Proposed words'
    );
    await click(byLabel(mounted.container, 'Send'));
    await g.resolve({ id: 'm1', body: { contentType: 'text', content: 'Proposed words' } });
    expect(mounted.container.querySelector('[role=log]')?.textContent).toContain('Proposed words');
  });

  it('mail composer: The sent banner appears only after the send resolves', async () => {
    const g = gatedHost();
    const draft: MailMessage = {
      id: 'D1',
      subject: 'Hello',
      isDraft: true,
      toRecipients: [{ emailAddress: { name: 'Ada', address: 'ada@x.test' } }],
      body: { contentType: 'text', content: 'Body' },
    };
    mounted = await mountView(<Composer draft={draft} />, g.api);
    await click(byText(mounted.container, 'button', 'Send'));
    expect(g.calls[0]).toMatchObject({ name: ACTIONS.send, args: { confirm: true } });
    expect(mounted.container.textContent).not.toContain('The message was sent.');
    await g.reject('Mail said no');
    expect(mounted.container.textContent).toContain('Mail said no');
    expect(mounted.container.textContent).not.toContain('The message was sent.');
    await click(byText(mounted.container, 'button', 'Send'));
    await g.resolve({ ok: true });
    expect(mounted.container.textContent).toContain('The message was sent.');
  });

  it('To Do: the task is added only after Add resolves', async () => {
    const g = gatedHost();
    mounted = await mountView(
      <TasksView
        args={{ todoTaskListId: 'l1' }}
        received
        result={{ value: [{ id: 't1', title: 'Existing', status: 'notStarted' }] }}
      />,
      g.api
    );
    await type(byLabel(mounted.container, 'Add a task') as HTMLInputElement, 'New one');
    await click(byText(mounted.container, 'button', 'Add'));
    expect(mounted.container.textContent).not.toContain('New one');
    await g.reject('Todo said no');
    expect(mounted.container.textContent).toContain('Todo said no');
    expect(mounted.container.textContent).not.toContain('New one');
    await click(byText(mounted.container, 'button', 'Add'));
    await g.resolve({ id: 't2', title: 'New one', status: 'notStarted' });
    expect(mounted.container.textContent).toContain('New one');
  });

  it('files: New folder reloads the list only after the create resolves, and shows the error otherwise', async () => {
    const g = gatedHost();
    mounted = await mountView(
      <FilesView
        args={{ driveId: 'D1', driveItemId: 'F1' }}
        received
        result={{ value: [{ id: 'a', name: 'a.pdf', file: {} }] }}
      />,
      g.api
    );
    await click(byText(mounted.container, 'button', 'Create or upload'));
    await click(byText(document.body, '[role=menuitem]', 'New folder'));
    await type(byLabel(mounted.container, 'Folder name') as HTMLInputElement, 'Archive');
    await click(byText(mounted.container, 'button', 'Create'));
    expect(g.calls).toHaveLength(1);
    expect(g.calls[0].name).toBe(ACTIONS.folderCreate);
    await g.reject('Drive said no');
    expect(mounted.container.textContent).toContain('Drive said no');
    // The form stays open and no reload was made.
    expect(byLabel(mounted.container, 'Folder name')).toBeTruthy();
    expect(g.calls).toHaveLength(1);
  });
});
