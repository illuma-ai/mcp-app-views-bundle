// @vitest-environment happy-dom
import { act, useState, type ReactElement } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addressLine,
  contactFields,
  contactName,
  filterContacts,
  groupLetter,
  sortContacts,
} from '../src/views/contacts/logic.js';
import type { Contact } from '../src/views/contacts/types.js';
import {
  dueLabel,
  isOverdue,
  looksLikeLists,
  sortLists,
  splitTasks,
} from '../src/views/tasks/logic.js';
import type { Task, TaskList } from '../src/views/tasks/types.js';
import { ContactCard, ContactsView } from '../src/views/ui/ContactsView.js';
import { TasksView } from '../src/views/ui/TasksView.js';
import {
  ACTIONS,
  WRITE_TOOLS,
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  restoreBarLayout,
  stubBarLayout,
  type,
  type Mounted,
} from './helpers/view-harness.js';

let mounted: Mounted | undefined;
afterEach(() => {
  restoreBarLayout();
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

const writes = (calls: Array<{ name: string }>) =>
  calls.filter((c) => WRITE_TOOLS.includes(c.name));

const CONTACTS: Contact[] = [
  {
    id: 'c2',
    displayName: 'Grace Hopper',
    companyName: 'Compilers',
    emailAddresses: [{ address: 'grace@example.test' }],
  },
  {
    id: 'c1',
    displayName: 'Ada Lovelace',
    jobTitle: 'Analyst',
    companyName: 'Engines',
    emailAddresses: [{ address: 'ada@example.test' }],
    mobilePhone: '555 0100',
    businessAddress: { street: '1 Way', city: 'London', countryOrRegion: 'UK' },
  },
  { id: 'c3', displayName: '3D Shop' },
];

describe('contacts logic', () => {
  it('names, sorts, groups and filters', () => {
    expect(contactName({ givenName: 'A', surname: 'B' })).toBe('A B');
    expect(contactName({ emailAddresses: [{ address: 'x@y.test' }] })).toBe('x@y.test');
    expect(contactName({})).toBe('Unnamed contact');
    expect(sortContacts(CONTACTS).map((c) => c.id)).toEqual(['c3', 'c1', 'c2']);
    expect(groupLetter(CONTACTS[2])).toBe('#');
    expect(filterContacts(CONTACTS, 'engines').map((c) => c.id)).toEqual(['c1']);
    expect(filterContacts(CONTACTS, 'grace@').map((c) => c.id)).toEqual(['c2']);
  });

  it('builds labelled fields and skips empty ones', () => {
    expect(contactFields(CONTACTS[1]).map((f) => f.label)).toEqual([
      'Email',
      'Mobile',
      'Work address',
    ]);
    expect(addressLine({ street: '1 Way', city: 'London', state: '', countryOrRegion: 'UK' })).toBe(
      '1 Way, London, UK'
    );
    expect(contactFields({})).toEqual([]);
  });
});

describe('contacts view', () => {
  it('puts what does not fit under the ... button, measured against the bar itself', async () => {
    const { api } = fakeHost();
    const mountAt = async (width: number) => {
      stubBarLayout(width);
      mounted = await mountView(
        <ContactsView args={{}} received result={{ value: CONTACTS }} />,
        api
      );
    };
    // wide: every command shows and there is no ... button
    await mountAt(1440);
    expect(byText(mounted!.container, 'button', 'Export')).toBeTruthy();
    expect(byLabel(mounted!.container, 'More commands')).toBeNull();
    mounted!.unmount();
    // narrower: the last visible item plus the ... button fit, and the rest are in the menu
    await mountAt(640);
    expect(byText(mounted!.container, 'button', 'Email')).toBeTruthy();
    expect(byText(mounted!.container, 'button', 'Export')).toBeUndefined();
    await click(byLabel(mounted!.container, 'More commands'));
    expect(byText(document.body, '[role=menuitem]', 'Export')).toBeTruthy();
    expect(byText(document.body, '[role=menuitem]', 'Import')).toBeTruthy();
  });

  it('shows the words, groups by letter, filters, opens a card and never writes', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(
      <ContactsView args={{}} received result={{ value: CONTACTS }} />,
      api
    );
    const text = mounted.container.textContent ?? '';
    for (const w of [
      'Your contacts',
      'New contact',
      'Edit',
      'Delete',
      'Email',
      'Chat',
      'Call',
      'Share as vCard',
      'Add to favorites',
      'Add category',
      'Import',
      'Export',
      'A',
      'G',
      '#',
      'Analyst, Engines',
    ])
      expect(text, w).toContain(w);
    const search = (): HTMLInputElement =>
      byLabel(mounted!.container, 'Search contacts and directory') as HTMLInputElement;
    expect(search().placeholder).toBe('Search contacts and directory');
    await type(search(), 'zzz');
    expect(mounted.container.textContent).toContain('No results found');
    await type(search(), '');
    await click(byText(mounted.container, 'button', /Ada Lovelace/));
    for (const w of ['Email', 'Call', 'Mobile', 'Work address']) {
      expect(mounted.container.textContent, w).toContain(w);
    }
    expect(calls).toEqual([]);
  });

  it('shows the empty words', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<ContactsView args={{}} received result={{ value: [] }} />, api);
    expect(mounted.container.textContent).toContain("You haven't added any contacts yet");
    expect(byText(mounted.container, 'button', 'New contact')).toBeTruthy();
  });

  it('opens email and phone through the host links', async () => {
    const { host, api } = fakeHost();
    mounted = await mountView(<ContactCard contact={CONTACTS[1]} />, api);
    await click(byText(mounted.container, 'button', 'Email'));
    expect(host.openLink).toHaveBeenCalledWith('mailto:ada@example.test');
    await click(byText(mounted.container, 'button', 'Call'));
    expect(host.openLink).toHaveBeenCalledWith('tel:555 0100');
  });
});

const day = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const TASKS: Task[] = [
  {
    id: 't1',
    title: 'Later',
    status: 'notStarted',
    dueDateTime: { dateTime: `${day(5)}T00:00:00` },
  },
  {
    id: 't2',
    title: 'Overdue one',
    status: 'notStarted',
    importance: 'high',
    dueDateTime: { dateTime: `${day(-3)}T00:00:00` },
  },
  { id: 't3', title: 'No date', status: 'notStarted' },
  {
    id: 't4',
    title: 'Finished',
    status: 'completed',
    completedDateTime: { dateTime: '2026-10-01T00:00:00Z' },
  },
];
const LISTS: TaskList[] = [
  { id: 'l2', displayName: 'Groceries' },
  { id: 'l1', displayName: 'Tasks', wellknownListName: 'defaultList' },
];

describe('tasks logic', () => {
  it('splits open from done, orders by due date, flags overdue and words due dates', () => {
    const { open, done } = splitTasks(TASKS);
    expect(open.map((t) => t.id)).toEqual(['t2', 't1', 't3']);
    expect(done.map((t) => t.id)).toEqual(['t4']);
    expect(isOverdue(TASKS[1])).toBe(true);
    expect(isOverdue(TASKS[0])).toBe(false);
    expect(isOverdue({ ...TASKS[1], status: 'completed' })).toBe(false);
    expect(
      dueLabel(
        { dueDateTime: { dateTime: '2026-11-04T00:00:00' } },
        new Date('2026-11-01T12:00:00')
      )
    ).toBe('Due Wed, Nov 4');
    expect(
      dueLabel(
        { dueDateTime: { dateTime: '2025-11-04T00:00:00' } },
        new Date('2026-11-01T12:00:00')
      )
    ).toContain('2025');
    expect(sortLists(LISTS).map((l) => l.id)).toEqual(['l1', 'l2']);
    expect(looksLikeLists(LISTS)).toBe(true);
    expect(looksLikeLists(TASKS)).toBe(false);
  });
});

describe('tasks view', () => {
  it('shows the reference words and never writes while reading or switching lists', async () => {
    const { calls, api } = fakeHost((name) =>
      name === ACTIONS.tasksList
        ? { value: [{ id: 'g1', title: 'Oat milk', status: 'notStarted' }] }
        : {}
    );
    mounted = await mountView(
      <TasksView args={{ todoTaskListId: 'l1' }} received result={{ value: TASKS }} />,
      api
    );
    // lists arrive by a callback when the model asked for tasks
    expect(byLabel(mounted.container, 'Add a task')).toBeTruthy();
    for (const l of ['Add due date', 'Remind me', 'Repeat']) {
      expect(byLabel(mounted.container, l), l).toBeTruthy();
    }
    for (const w of [
      'Tasks',
      'Grid',
      'List',
      'Sort',
      'Group',
      'Add',
      'Later',
      'Overdue one',
      'Completed 1',
    ]) {
      expect(mounted.container.textContent, w).toContain(w);
    }
    expect(mounted.container.textContent).not.toContain('Finished');
    await click(byText(mounted.container, 'button', /Completed 1/));
    expect(mounted.container.textContent).toContain('Finished');
    expect(byLabel(mounted.container, 'Important')).toBeTruthy();
    expect(writes(calls)).toEqual([]);
  });

  it('starts from a list of lists and loads the default list', async () => {
    const { calls, api } = fakeHost((name) =>
      name === ACTIONS.tasksList ? { value: TASKS } : { value: LISTS }
    );
    mounted = await mountView(<TasksView args={{}} received result={{ value: LISTS }} />, api);
    expect(calls[0]).toMatchObject({ name: ACTIONS.tasksList, args: { todoTaskListId: 'l1' } });
    await click(byLabel(mounted.container, 'Lists'));
    for (const w of ['My Day', 'Important', 'Planned', 'Assigned to me', 'Groceries', 'New list']) {
      expect(document.body.textContent, w).toContain(w);
    }
    expect(writes(calls)).toEqual([]);
  });

  it('shows the empty words', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<TasksView args={{}} received result={{ value: [] }} />, api);
    // the real empty list is blank: no illustration and no message
    expect(mounted.container.querySelector('[role=list]')).toBeNull();
    expect(mounted.container.textContent).not.toContain('Waiting');
  });

  it('checks a task off only when its circle is pressed, with confirm: true', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(
      <TasksView args={{ todoTaskListId: 'l1' }} received result={{ value: TASKS }} />,
      api
    );
    expect(writes(calls)).toEqual([]);
    const box = byLabel(mounted.container, 'Mark Later as completed')?.querySelector('input');
    await click(box ?? byLabel(mounted.container, 'Mark Later as completed'));
    const w = writes(calls);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({
      name: ACTIONS.taskUpdate,
      args: {
        todoTaskListId: 'l1',
        todoTaskId: 't1',
        body: { status: 'completed' },
        confirm: true,
      },
    });
  });

  it('adds a task only when Add is pressed', async () => {
    const { calls, api } = fakeHost((name) =>
      name === ACTIONS.taskCreate ? { id: 'n1', title: 'Buy ink', status: 'notStarted' } : {}
    );
    mounted = await mountView(
      <TasksView args={{ todoTaskListId: 'l1' }} received result={{ value: TASKS }} />,
      api
    );
    await type(byLabel(mounted.container, 'Add a task') as HTMLInputElement, 'Buy ink');
    expect(writes(calls)).toEqual([]);
    await click(byText(mounted.container, 'button', 'Add'));
    expect(calls.find((c) => c.name === ACTIONS.taskCreate)?.args).toMatchObject({
      todoTaskListId: 'l1',
      body: { title: 'Buy ink' },
      confirm: true,
    });
    expect(mounted.container.textContent).toContain('Buy ink');
  });
});

describe('tasks view opened the way the host opens it', () => {
  it('takes the list from a tool input that arrives after the view mounted, then enables Add', async () => {
    // The host starts the view, then sends the tool input, then the result.
    let push: (next: { args: Record<string, unknown>; received: boolean }) => void = () =>
      undefined;
    const Live = (): ReactElement => {
      const [s, set] = useState<{ args: Record<string, unknown>; received: boolean }>({
        args: {},
        received: false,
      });
      push = set;
      return (
        <TasksView
          args={s.args}
          received={s.received}
          result={s.received ? { value: TASKS } : undefined}
        />
      );
    };
    const { calls, api } = fakeHost((name) =>
      name === ACTIONS.taskCreate ? { id: 'n1', title: 'Buy ink', status: 'notStarted' } : {}
    );
    mounted = await mountView(<Live />, api);
    const box = (): HTMLInputElement =>
      byLabel(mounted!.container, 'Add a task') as HTMLInputElement;
    expect(box().disabled).toBe(true);
    await act(async () => push({ args: { todoTaskListId: 'l1', top: 50 }, received: false }));
    await act(async () => push({ args: { todoTaskListId: 'l1', top: 50 }, received: true }));
    expect(box().disabled).toBe(false);
    await type(box(), 'Buy ink');
    await click(byText(mounted.container, 'button', 'Add'));
    expect(calls.find((c) => c.name === ACTIONS.taskCreate)?.args).toMatchObject({
      todoTaskListId: 'l1',
      body: { title: 'Buy ink' },
      confirm: true,
    });
  });
});

describe('tasks grid and list', () => {
  const open = async (api: ReturnType<typeof fakeHost>['api']) =>
    mountView(
      <TasksView args={{ todoTaskListId: 'l1' }} received result={{ value: TASKS }} />,
      api
    );

  it('grid is a table with Due Date and Importance columns and a star on every row', async () => {
    const { api } = fakeHost();
    mounted = await open(api);
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('Due Date');
    expect(text).toContain('Importance');
    const rows = mounted.container.querySelectorAll('[role=listitem]');
    expect(rows.length).toBe(3);
    for (const r of Array.from(rows)) expect(r.querySelector('button[aria-pressed]')).toBeTruthy();
    // the due date has no "Due" prefix in its own column
    expect(text).not.toContain('Due Tue');
  });

  it('list is compact rows without the table header', async () => {
    const { api } = fakeHost();
    mounted = await open(api);
    await click(byText(mounted.container, '[role=tab]', /^List/));
    expect(mounted.container.textContent).not.toContain('Importance');
    expect(mounted.container.querySelectorAll('[role=listitem] button[aria-pressed]').length).toBe(
      3
    );
  });

  it('the star changes importance only when pressed, with one confirmed update', async () => {
    const { calls, api } = fakeHost();
    mounted = await open(api);
    expect(writes(calls)).toEqual([]);
    await click(byLabel(mounted.container, 'Mark Later as important'));
    expect(writes(calls)).toHaveLength(1);
    expect(writes(calls)[0]).toMatchObject({
      name: ACTIONS.taskUpdate,
      args: { todoTaskListId: 'l1', todoTaskId: 't1', body: { importance: 'high' }, confirm: true },
    });
    // a high-importance task toggles back
    await click(byLabel(mounted.container, 'Remove importance from Overdue one'));
    expect(writes(calls)[1].args.body).toEqual({ importance: 'normal' });
  });

  it('a rejected star keeps the old importance and shows the error', async () => {
    const { api } = fakeHost((name) => {
      if (name === ACTIONS.taskUpdate) throw new Error('Todo said no');
      return {};
    });
    mounted = await open(api);
    await click(byLabel(mounted.container, 'Mark Later as important'));
    expect(mounted.container.textContent).toContain('Todo said no');
    expect(byLabel(mounted.container, 'Mark Later as important')).toBeTruthy();
  });
});
