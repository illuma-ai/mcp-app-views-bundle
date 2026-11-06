/** Calendar logic with no UI: wall-clock times, day layout, agenda grouping and ranges. */
import type { CalendarEvent, DateTimeZone } from './types.js';

export interface Wall {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** Minutes since local midnight. */
  minutes: number;
}

const WALL = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})/;

/**
 * Reads a Graph dateTimeTimeZone as wall-clock time. The views ask for the host's time zone, so
 * results come back as wall-clock strings in it; a value still in UTC is converted to `hostZone`.
 */
export function wallTime(value: DateTimeZone | undefined, hostZone?: string): Wall | null {
  const raw = value?.dateTime;
  if (!raw) return null;
  if (value?.timeZone && value.timeZone !== 'UTC') {
    const m = WALL.exec(raw);
    return m ? { date: m[1], minutes: Number(m[2]) * 60 + Number(m[3]) } : null;
  }
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: hostZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (t: string): string => parts.find((p) => p.type === t)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

export interface TimedEvent {
  event: CalendarEvent;
  date: string;
  start: number;
  end: number;
  allDay: boolean;
}

/** Events placed on their start day. A multi-day timed event is clipped to the end of its first day. */
export function placeEvents(events: CalendarEvent[], hostZone?: string): TimedEvent[] {
  const out: TimedEvent[] = [];
  for (const event of events) {
    const s = wallTime(event.start, hostZone);
    const e = wallTime(event.end, hostZone);
    if (!s) continue;
    const allDay = Boolean(event.isAllDay);
    const sameDay = e && e.date === s.date;
    out.push({
      event,
      date: s.date,
      allDay,
      start: allDay ? 0 : s.minutes,
      end: allDay ? 1440 : sameDay ? Math.max(e.minutes, s.minutes + 15) : 1440,
    });
  }
  return out.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || Number(b.allDay) - Number(a.allDay) || a.start - b.start
  );
}

export interface Slot extends TimedEvent {
  column: number;
  columns: number;
}

/** Side-by-side columns for overlapping events within one day. */
export function layoutDay(items: TimedEvent[]): Slot[] {
  const sorted = [...items]
    .filter((i) => !i.allDay)
    .sort((a, b) => a.start - b.start || b.end - a.end);
  const out: Slot[] = [];
  let cluster: Slot[] = [];
  let clusterEnd = -1;
  const flush = (): void => {
    const columns = cluster.reduce((m, s) => Math.max(m, s.column + 1), 1);
    for (const s of cluster) s.columns = columns;
    out.push(...cluster);
    cluster = [];
  };
  const ends: number[] = [];
  for (const item of sorted) {
    if (item.start >= clusterEnd && cluster.length) {
      flush();
      ends.length = 0;
    }
    let column = ends.findIndex((end) => end <= item.start);
    if (column < 0) column = ends.length;
    ends[column] = item.end;
    cluster.push({ ...item, column, columns: 1 });
    clusterEnd = Math.max(clusterEnd, item.end);
  }
  if (cluster.length) flush();
  return out;
}

/** Local date key helpers (no time zone maths: dates are plain calendar dates). */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + days));
  return next.toISOString().slice(0, 10);
}

export function todayKey(now: Date = new Date(), hostZone?: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: hostZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** Sunday of the week containing `date` (the week the reference client shows for en-US). */
export function weekStart(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return addDays(date, -new Date(Date.UTC(y, m - 1, d)).getUTCDay());
}

export type CalendarMode = 'day' | 'workweek' | 'week' | 'month' | 'agenda';

/** First day of the month containing `date`. */
export function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

/** Moves the anchor one page: a day, a week or a month. */
export function shiftAnchor(mode: CalendarMode, anchor: string, direction: 1 | -1): string {
  if (mode === 'day') return addDays(anchor, direction);
  if (mode === 'month') {
    const [y, m] = anchor.split('-').map(Number);
    const next = new Date(Date.UTC(y, m - 1 + direction, 1));
    return next.toISOString().slice(0, 10);
  }
  return addDays(anchor, 7 * direction);
}

/** The [start, end) date range a mode shows around an anchor date, and the days it lists. */
export function rangeFor(
  mode: CalendarMode,
  anchor: string
): { start: string; end: string; days: string[] } {
  let start = anchor;
  let count = 7;
  if (mode === 'day') count = 1;
  else if (mode === 'week') start = weekStart(anchor);
  else if (mode === 'workweek') {
    start = addDays(weekStart(anchor), 1);
    count = 5;
  } else if (mode === 'month') {
    start = weekStart(monthStart(anchor));
    count = 42;
  }
  return {
    start,
    end: addDays(start, count),
    days: Array.from({ length: count }, (_, i) => addDays(start, i)),
  };
}

/** Picks the initial mode from the range the model asked for. */
export function modeForRange(start: string | undefined, end: string | undefined): CalendarMode {
  if (!start || !end) return 'agenda';
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return 'agenda';
  // Rounded: a range spanning a daylight-saving change is an hour off a whole number of days.
  const days = Math.round((b - a) / 86_400_000);
  return days <= 1 ? 'day' : days <= 7 ? 'week' : days <= 42 ? 'month' : 'agenda';
}

/** The title above the grid: "November 1–7, 2026", "Thursday, November 5, 2026", "November 2026". */
export function rangeTitle(mode: CalendarMode, anchor: string, locale?: string): string {
  const fmt = (date: string, o: Intl.DateTimeFormatOptions): string => {
    const [y, m, d] = date.split('-').map(Number);
    return new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...o }).format(
      new Date(Date.UTC(y, m - 1, d))
    );
  };
  if (mode === 'day')
    return fmt(anchor, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  if (mode === 'month') return fmt(anchor, { month: 'long', year: 'numeric' });
  const { days } = rangeFor(mode, anchor);
  const first = days[0];
  const last = days[days.length - 1];
  if (first.slice(0, 7) === last.slice(0, 7))
    return `${fmt(first, { month: 'long', day: 'numeric' })}–${fmt(last, { day: 'numeric' })}, ${fmt(last, { year: 'numeric' })}`;
  return `${fmt(first, { month: 'long', day: 'numeric' })} – ${fmt(last, { month: 'long', day: 'numeric' })}, ${fmt(last, { year: 'numeric' })}`;
}

/** "9 AM" for the time gutter. */
export function formatHour(minutes: number, locale?: string): string {
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60) % 24, 0));
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', timeZone: 'UTC' }).format(d);
}

/** The instant of local midnight at the start of `date` in `hostZone`, as an ISO string. */
export function startOfDayIso(date: string, hostZone?: string): string {
  // Find the UTC instant whose wall-clock time in hostZone is date 00:00 by correcting a guess.
  const guess = Date.parse(`${date}T00:00:00Z`);
  const wall = wallTime({ dateTime: new Date(guess).toISOString() }, hostZone);
  if (!wall) return new Date(guess).toISOString();
  const [y, m, d] = wall.date.split('-').map(Number);
  const diff = Date.UTC(y, m - 1, d) + wall.minutes * 60_000 - guess;
  return new Date(guess - diff).toISOString();
}

/** Agenda: events grouped by day, in date order. */
export function groupAgenda(items: TimedEvent[]): Array<{ date: string; items: TimedEvent[] }> {
  const map = new Map<string, TimedEvent[]>();
  for (const item of items) {
    if (!map.has(item.date)) map.set(item.date, []);
    map.get(item.date)?.push(item);
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, items: list }));
}

/** "9:30 AM" from minutes since midnight. */
export function formatMinutes(minutes: number, locale?: string): string {
  const d = new Date(Date.UTC(2000, 0, 1, Math.floor(minutes / 60) % 24, minutes % 60));
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(d);
}

/** Order of response states for attendee lists. */
export function responseLabel(response: string | undefined): string {
  switch (response) {
    case 'accepted':
    case 'organizer':
      return 'Accepted';
    case 'tentativelyAccepted':
      return 'Tentative';
    case 'declined':
      return 'Declined';
    default:
      return 'No response';
  }
}
