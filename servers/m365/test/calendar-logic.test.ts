import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatHour,
  groupAgenda,
  layoutDay,
  modeForRange,
  placeEvents,
  rangeFor,
  rangeTitle,
  shiftAnchor,
  startOfDayIso,
  wallTime,
  weekStart,
} from '../src/views/calendar/logic.js';
import type { CalendarEvent } from '../src/views/calendar/types.js';

const at = (date: string, hhmm: string) => ({
  dateTime: `${date}T${hhmm}:00.0000000`,
  timeZone: 'Central Standard Time',
});
const ev = (
  id: string,
  date: string,
  from: string,
  to: string,
  extra: Partial<CalendarEvent> = {}
): CalendarEvent => ({
  id,
  subject: id,
  start: at(date, from),
  end: at(date, to),
  ...extra,
});

describe('wall-clock times', () => {
  it('reads a named-zone value as the wall clock it states', () => {
    expect(wallTime(at('2026-11-05', '09:30'), 'America/Chicago')).toEqual({
      date: '2026-11-05',
      minutes: 570,
    });
  });

  it('converts a UTC value into the host zone', () => {
    expect(
      wallTime({ dateTime: '2026-11-05T15:30:00', timeZone: 'UTC' }, 'America/Chicago')
    ).toEqual({ date: '2026-11-05', minutes: 9 * 60 + 30 });
    expect(wallTime(undefined)).toBeNull();
  });

  it('finds the instant of local midnight, across a daylight-saving change', () => {
    expect(startOfDayIso('2026-11-05', 'America/Chicago')).toBe('2026-11-05T06:00:00.000Z');
    expect(startOfDayIso('2026-11-01', 'America/Chicago')).toBe('2026-11-01T05:00:00.000Z');
  });
});

describe('ranges and titles', () => {
  it('uses Sunday-start weeks, five-day work weeks and six-week month grids', () => {
    expect(weekStart('2026-11-05')).toBe('2026-11-01');
    expect(rangeFor('week', '2026-11-05').days).toHaveLength(7);
    const work = rangeFor('workweek', '2026-11-05');
    expect(work.days).toEqual([
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
    ]);
    const month = rangeFor('month', '2026-11-05');
    expect(month.days).toHaveLength(42);
    expect(month.start).toBe('2026-11-01');
    expect(rangeFor('day', '2026-11-05').end).toBe('2026-11-06');
  });

  it('pages by a day, a week or a month', () => {
    expect(shiftAnchor('day', '2026-11-05', -1)).toBe('2026-11-04');
    expect(shiftAnchor('week', '2026-11-05', 1)).toBe('2026-11-12');
    expect(shiftAnchor('month', '2026-11-05', 1)).toBe('2026-12-01');
    expect(shiftAnchor('month', '2026-01-15', -1)).toBe('2025-12-01');
  });

  it('writes the title the way the reference client does', () => {
    expect(rangeTitle('week', '2026-11-05', 'en-US')).toBe('November 1–7, 2026');
    expect(rangeTitle('week', '2026-10-30', 'en-US')).toBe(
      'October 25 – 31, 2026'.replace(' – 31', '–31')
    );
    expect(rangeTitle('week', '2026-12-30', 'en-US')).toBe('December 27 – January 2, 2027');
    expect(rangeTitle('day', '2026-11-05', 'en-US')).toBe('Thursday, November 5, 2026');
    expect(rangeTitle('month', '2026-11-05', 'en-US')).toBe('November 2026');
    expect(formatHour(9 * 60, 'en-US')).toBe('9 AM');
    expect(formatHour(13 * 60, 'en-US')).toBe('1 PM');
  });

  it('picks the mode from the requested range, tolerating a daylight-saving hour', () => {
    expect(modeForRange('2026-11-05T06:00:00Z', '2026-11-06T06:00:00Z')).toBe('day');
    expect(modeForRange('2026-11-01T05:00:00Z', '2026-11-08T06:00:00Z')).toBe('week');
    expect(modeForRange('2026-11-01T05:00:00Z', '2026-12-01T06:00:00Z')).toBe('month');
    expect(modeForRange(undefined, undefined)).toBe('agenda');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('placing and laying out events', () => {
  it('places events on their start day, all-day first, ordered by time', () => {
    const placed = placeEvents(
      [
        ev('b', '2026-11-05', '10:00', '11:00'),
        ev('a', '2026-11-05', '09:00', '09:30'),
        ev('allday', '2026-11-05', '00:00', '00:00', { isAllDay: true }),
      ],
      'America/Chicago'
    );
    expect(placed.map((p) => p.event.id)).toEqual(['allday', 'a', 'b']);
    expect(placed[0]).toMatchObject({ allDay: true, start: 0, end: 1440 });
  });

  it('gives overlapping events side-by-side columns and leaves others full width', () => {
    const items = placeEvents(
      [
        ev('a', '2026-11-05', '10:00', '11:30'),
        ev('b', '2026-11-05', '10:30', '11:00'),
        ev('c', '2026-11-05', '10:45', '12:00'),
        ev('d', '2026-11-05', '14:00', '15:00'),
      ],
      'America/Chicago'
    );
    const slots = Object.fromEntries(
      layoutDay(items).map((s) => [s.event.id, [s.column, s.columns]])
    );
    expect(slots).toEqual({ a: [0, 3], b: [1, 3], c: [2, 3], d: [0, 1] });
  });

  it('groups an agenda by day in date order', () => {
    const groups = groupAgenda(
      placeEvents(
        [
          ev('x', '2026-11-06', '09:00', '10:00'),
          ev('y', '2026-11-05', '09:00', '10:00'),
          ev('z', '2026-11-05', '11:00', '12:00'),
        ],
        'America/Chicago'
      )
    );
    expect(groups.map((g) => [g.date, g.items.map((i) => i.event.id)])).toEqual([
      ['2026-11-05', ['y', 'z']],
      ['2026-11-06', ['x']],
    ]);
  });
});
