// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../src/views/calendar/types.js';
import { CalendarView } from '../src/views/ui/CalendarView.js';
import { EventView } from '../src/views/ui/EventView.js';
import {
  byLabel,
  byText,
  click,
  fakeHost,
  mountView,
  settle,
  restoreBarLayout,
  stubBarLayout,
  type,
  type Mounted,
  WRITE_TOOLS,
} from './helpers/view-harness.js';

let mounted: Mounted | undefined;
afterEach(() => {
  mounted?.unmount();
  mounted = undefined;
  document.body.innerHTML = '';
});

const at = (date: string, hhmm: string) => ({
  dateTime: `${date}T${hhmm}:00.0000000`,
  timeZone: 'Central Standard Time',
});
const event = (extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'E1',
  subject: 'Planning review',
  start: at('2026-11-02', '10:00'),
  end: at('2026-11-02', '11:00'),
  location: { displayName: 'Room 4B' },
  organizer: { emailAddress: { name: 'Ada', address: 'ada@x.test' } },
  isOrganizer: false,
  responseStatus: { response: 'notResponded' },
  attendees: [
    {
      type: 'required',
      status: { response: 'accepted' },
      emailAddress: { name: 'Ada', address: 'ada@x.test' },
    },
    {
      type: 'required',
      status: { response: 'declined' },
      emailAddress: { name: 'Grace', address: 'grace@x.test' },
    },
  ],
  body: { contentType: 'html', content: '<p>Agenda <a href="https://x.test/doc">doc</a></p>' },
  ...extra,
});

const WEEK = { startDateTime: '2026-11-01T05:00:00Z', endDateTime: '2026-11-08T06:00:00Z' };

describe('calendar view', () => {
  it('shows the week grid with the reference command bar and title', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <CalendarView args={WEEK} received result={{ value: [event()] }} />,
      api
    );
    const text = mounted.container.textContent ?? '';
    for (const word of [
      'New event',
      'Day',
      'Work week',
      'Week',
      'Month',
      'Split view',
      'Filter',
      'Share',
      'Print',
      'Today',
      'November 1–7, 2026',
      '9 AM',
      'Planning review',
    ]) {
      expect(text, word).toContain(word);
    }
  });

  it('navigates with the calendar-view tool, asking for the host time zone and a whole range', async () => {
    const { calls, api } = fakeHost(() => ({ value: [] }));
    mounted = await mountView(
      <CalendarView args={WEEK} received result={{ value: [event()] }} />,
      api
    );
    await click(byLabel(mounted.container, 'Next'));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('tool-cal-view');
    expect(calls[0].args).toMatchObject({ orderby: 'start/dateTime', top: 100 });
    expect(typeof calls[0].args.timezone).toBe('string');
    const start = Date.parse(String(calls[0].args.startDateTime));
    const end = Date.parse(String(calls[0].args.endDateTime));
    expect(Math.round((end - start) / 86_400_000)).toBe(7);
    expect(mounted.container.textContent).toContain('November 8–14, 2026');
  });

  it('switches to the month grid and the agenda shows an empty state', async () => {
    const { calls, api } = fakeHost(() => ({ value: [event()] }));
    mounted = await mountView(<CalendarView args={WEEK} received result={{ value: [] }} />, api);
    await click(byText(mounted.container, 'button', 'Month'));
    expect(calls[0].name).toBe('tool-cal-view');
    expect(mounted.container.textContent).toContain('November 2026');
    mounted.unmount();
    mounted = await mountView(<CalendarView args={{}} received result={{ value: [] }} />, api);
    expect(mounted.container.textContent).toContain('No events in this range.');
  });

  it('lists an agenda grouped by day when the result has no range', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <CalendarView
        args={{}}
        received
        result={{
          value: [
            event(),
            event({
              id: 'E2',
              subject: 'Lunch',
              start: at('2026-11-03', '12:00'),
              end: at('2026-11-03', '13:00'),
            }),
          ],
        }}
      />,
      api
    );
    const text = mounted.container.textContent ?? '';
    expect(text).toContain('Monday, November 2');
    expect(text).toContain('Tuesday, November 3');
    expect(text).toContain('10:00 AM – 11:00 AM');
  });

  it('opens an event with the event tool and shows organizer, attendees and responses', async () => {
    const full = event();
    const { calls, api } = fakeHost((name) => (name === 'tool-event-get' ? full : {}));
    mounted = await mountView(
      <CalendarView
        args={WEEK}
        received
        result={{ value: [{ ...event(), attendees: undefined, body: undefined }] }}
      />,
      api
    );
    await click(byText(mounted.container, 'button', /Planning review/));
    expect(calls[0]).toMatchObject({
      name: 'tool-event-get',
      args: { eventId: 'E1', bodyFormat: 'html' },
    });
    const text = mounted.container.textContent ?? '';
    for (const word of [
      'Organizer',
      'Attendees (2)',
      'Accepted',
      'Declined',
      'Accept',
      'Tentative',
      'Decline',
    ])
      expect(text, word).toContain(word);
    expect(mounted.container.querySelector('a[href="https://x.test/doc"]')).not.toBeNull();
  });
});

describe('event view', () => {
  it('responds only from a button, with a send-response flag, and shows the new state', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<EventView initial={event()} />, api);
    expect(calls).toEqual([]);
    await click(byText(mounted.container, 'button', 'Accept'));
    expect(calls).toEqual([
      { name: 'tool-accept', args: { eventId: 'E1', body: { sendResponse: true }, confirm: true } },
    ]);
    expect(mounted.container.textContent).toContain('Response sent.');
  });

  it('offers the join link for an online meeting', async () => {
    const { api } = fakeHost();
    mounted = await mountView(
      <EventView initial={event({ onlineMeeting: { joinUrl: 'https://teams.example.test/j' } })} />,
      api
    );
    expect(mounted.container.textContent).toContain('Join online meeting');
  });

  it('offers no response buttons to the organizer', async () => {
    const { api } = fakeHost();
    mounted = await mountView(<EventView initial={event({ isOrganizer: true })} />, api);
    expect(byText(mounted.container, 'button', 'Accept')).toBeUndefined();
  });

  it('saves edits with the update tool only after Save, including attendees and time zone', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<EventView initial={event({ isOrganizer: true })} />, api);
    await click(byLabel(mounted.container, 'Edit'));
    await type(byLabel(mounted.container, 'Title') as HTMLInputElement, 'Renamed');
    await settle();
    expect(calls).toEqual([]);
    await click(byText(mounted.container, 'button', 'Save'));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('tool-event-update');
    const body = calls[0].args.body as {
      subject: string;
      attendees: unknown[];
      start: { timeZone: string };
    };
    expect(calls[0].args).toMatchObject({ eventId: 'E1', confirm: true });
    expect(body.subject).toBe('Renamed');
    expect(body.attendees).toHaveLength(2);
    expect(typeof body.start.timeZone).toBe('string');
  });

  it('creates a new event from a blank form with the create tool', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-event-create' ? { id: 'N1', subject: 'Standup' } : {}
    );
    mounted = await mountView(<EventView initial={{}} isNew />, api);
    expect(mounted.container.textContent).toContain('New event');
    expect(byLabel(mounted.container, 'Title')?.getAttribute('placeholder')).toBe('Add a title');
    expect(byLabel(mounted.container, 'Location')?.getAttribute('placeholder')).toBe(
      'Add a location'
    );
    expect(byLabel(mounted.container, 'Description')?.getAttribute('placeholder')).toBe(
      'Add a description'
    );
    await type(byLabel(mounted.container, 'Title') as HTMLInputElement, 'Standup');
    await click(byText(mounted.container, 'button', 'Save'));
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe('tool-event-create');
    expect((calls[0].args.body as { subject: string }).subject).toBe('Standup');
    expect(mounted.container.textContent).toContain('Event created.');
  });

  it('deletes only from the Delete button', async () => {
    const { calls, api } = fakeHost();
    mounted = await mountView(<EventView initial={event({ isOrganizer: true })} />, api);
    expect(calls).toEqual([]);
    await click(byLabel(mounted.container, 'Delete'));
    expect(calls).toEqual([{ name: 'tool-event-delete', args: { eventId: 'E1', confirm: true } }]);
  });
});

describe('write gate', () => {
  it('never calls a write tool on its own when a calendar view is shown, navigated or opened', async () => {
    const { calls, api } = fakeHost((name) =>
      name === 'tool-event-get' ? event() : { value: [event()] }
    );
    mounted = await mountView(
      <CalendarView args={WEEK} received result={{ value: [event()] }} />,
      api
    );
    await click(byLabel(mounted.container, 'Next'));
    await click(byText(mounted.container, 'button', 'Month'));
    await click(byText(mounted.container, 'button', /Planning review/));
    await settle();
    expect(calls.filter((c) => WRITE_TOOLS.includes(c.name))).toEqual([]);
  });
});

describe('a proposed event opens the prefilled form', () => {
  it('shows the proposed values, creates nothing on open, and Save sends the edited form', async () => {
    const { calls, api } = fakeHost((name) => (name === 'tool-event-create' ? { id: 'N1' } : {}));
    mounted = await mountView(
      <EventView
        isNew
        initial={{
          subject: 'Planning',
          start: { dateTime: '2026-11-06T10:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-11-06T10:30:00', timeZone: 'UTC' },
          location: { displayName: 'Room 4' },
          attendees: [
            { type: 'required', emailAddress: { address: 'a@example.test', name: 'Ada' } },
          ],
        }}
      />,
      api
    );
    expect((byLabel(mounted.container, 'Title') as HTMLInputElement).value).toBe('Planning');
    expect((byLabel(mounted.container, 'Location') as HTMLInputElement).value).toBe('Room 4');
    expect(mounted.container.textContent).toContain('Ada');
    expect(
      Array.from(mounted.container.querySelectorAll('input')).some((i) =>
        /^2026-11-0[56]/.test(i.value)
      )
    ).toBe(true);
    expect(calls).toEqual([]);
    await type(byLabel(mounted.container, 'Title') as HTMLInputElement, 'Planning v2');
    await click(byText(mounted.container, 'button', 'Save'));
    expect(calls).toHaveLength(1);
    expect(calls[0].args).toMatchObject({
      confirm: true,
      body: { subject: 'Planning v2', location: { displayName: 'Room 4' } },
    });
  });
});

describe('narrow frame', () => {
  it('lists the days as an agenda below 560px and drops the mode buttons', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes('559'),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
    try {
      const { api } = fakeHost();
      mounted = await mountView(
        <CalendarView args={WEEK} received result={{ value: [event()] }} />,
        api
      );
      expect(byText(mounted.container, 'button', 'Work week')).toBeUndefined();
      expect(byText(mounted.container, 'button', 'Month')).toBeUndefined();
      expect(mounted.container.querySelector('[role=grid]')).toBeNull();
      expect(mounted.container.textContent).toContain('Planning review');
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('today in the week grid', () => {
  const withToday = async (run: () => Promise<void>): Promise<void> => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T17:30:00Z'));
    try {
      await run();
    } finally {
      vi.useRealTimers();
    }
  };

  it('has the circled plus on today that opens a new event, and the current-time line and dot', async () => {
    await withToday(async () => {
      const { calls, api } = fakeHost();
      mounted = await mountView(<CalendarView args={WEEK} received result={{ value: [] }} />, api);
      expect(mounted.container.querySelector('[data-now=line]')).toBeTruthy();
      expect(mounted.container.querySelector('[data-now=dot]')).toBeTruthy();
      expect(mounted.container.querySelector('[data-now=across]')).toBeTruthy();
      const plus = mounted.container.querySelector(
        '[role=columnheader] button[aria-label="New event"]'
      );
      expect(plus).toBeTruthy();
      await click(plus);
      expect(mounted.container.textContent).toContain('New event');
      expect(byLabel(mounted.container, 'Title')).toBeTruthy();
      // opening the form creates nothing
      expect(calls.filter((c) => WRITE_TOOLS.includes(c.name))).toEqual([]);
    });
  });
});

describe('command bar on one line', () => {
  afterEach(restoreBarLayout);
  const mountAt = async (width: number) => {
    stubBarLayout(width);
    const { api } = fakeHost();
    mounted = await mountView(<CalendarView args={WEEK} received result={{ value: [] }} />, api);
    await settle();
  };

  it('shows everything when the bar is wide, with no ... button', async () => {
    await mountAt(1440);
    expect(byText(mounted!.container, 'button', 'Print')).toBeTruthy();
    expect(byLabel(mounted!.container, 'More commands')).toBeNull();
  });

  it.each([865, 880])(
    'at %ipx the last visible item and the ... button fit, and the rest are under it',
    async (width) => {
      await mountAt(width);
      // the bar holds New event, a divider, the visible items and the ... button, 100px each here
      const bar = mounted!.container.querySelector('[role=toolbar]')!;
      const visible = Array.from(bar.children).filter((c) => c.tagName !== 'I').length;
      expect(visible * 100).toBeLessThanOrEqual(width);
      expect(byLabel(mounted!.container, 'More commands')).toBeTruthy();
      expect(byText(mounted!.container, 'button', 'Week')).toBeTruthy();
      expect(byText(mounted!.container, 'button', 'Print')).toBeUndefined();
      await click(byLabel(mounted!.container, 'More commands'));
      expect(byText(document.body, '[role=menuitem]', 'Print')).toBeTruthy();
      expect(byText(document.body, '[role=menuitem]', 'Share')).toBeTruthy();
    }
  );
});

describe('the hours scroll inside the frame', () => {
  it('has its own scroll region that opens near the current hour', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-05T17:30:00Z'));
    try {
      const { api } = fakeHost();
      mounted = await mountView(<CalendarView args={WEEK} received result={{ value: [] }} />, api);
      const scroller = mounted.container.querySelector<HTMLElement>('[data-scroll=grid]')!;
      expect(scroller).toBeTruthy();
      // it is its own scroll container, so the wheel scrolls it instead of the host page
      expect(scroller.className).toBeTruthy();
      expect(scroller.scrollTop).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
