/**
 * Fixture calendar for the local view preview: fictional people on reserved example domains, with
 * times relative to the current week. Times are wall-clock strings in a named zone, the way Graph
 * answers when the view asks for the host's time zone.
 */
import { addDays, todayKey, weekStart } from '../src/views/calendar/logic.js';
import type { CalendarEvent } from '../src/views/calendar/types.js';

const ZONE = 'Central Standard Time';
const person = (name: string, address: string) => ({ emailAddress: { name, address } });
const at = (date: string, hhmm: string) => ({
  dateTime: `${date}T${hhmm}:00.0000000`,
  timeZone: ZONE,
});

export function buildCalendar(now: Date = new Date()): {
  events: CalendarEvent[];
  detail: Record<string, CalendarEvent>;
} {
  const monday = addDays(weekStart(todayKey(now)), 1);
  const day = (n: number): string => addDays(monday, n);
  const me = person('Jordan Rivera', 'jordan.rivera@example.test');
  const ada = person('Ada Lovelace', 'ada.lovelace@example.test');
  const grace = person('Grace Hopper', 'grace.hopper@example.test');
  const events: CalendarEvent[] = [
    {
      id: 'e-standup',
      subject: 'Team standup',
      start: at(day(0), '09:00'),
      end: at(day(0), '09:15'),
      location: { displayName: 'Teams meeting' },
      isOnlineMeeting: true,
      onlineMeeting: { joinUrl: 'https://teams.example.test/join/standup' },
      organizer: ada,
      isOrganizer: false,
      responseStatus: { response: 'accepted' },
      showAs: 'busy',
    },
    {
      id: 'e-planning',
      subject: 'Q3 planning review',
      start: at(day(0), '10:00'),
      end: at(day(0), '11:30'),
      location: { displayName: 'Room 4B' },
      organizer: ada,
      isOrganizer: false,
      responseStatus: { response: 'notResponded' },
      showAs: 'busy',
    },
    {
      id: 'e-sync',
      subject: 'Budget sync',
      start: at(day(0), '10:30'),
      end: at(day(0), '11:00'),
      location: { displayName: 'Phone' },
      organizer: grace,
      isOrganizer: false,
      responseStatus: { response: 'tentativelyAccepted' },
      showAs: 'tentative',
    },
    {
      id: 'e-offsite',
      subject: 'Company offsite',
      start: at(day(1), '00:00'),
      end: at(addDays(day(1), 1), '00:00'),
      isAllDay: true,
      organizer: grace,
      isOrganizer: false,
      responseStatus: { response: 'accepted' },
      showAs: 'free',
    },
    {
      id: 'e-lunch',
      subject: 'Lunch with Lena',
      start: at(day(1), '12:00'),
      end: at(day(1), '13:00'),
      location: { displayName: 'Corner Cafe' },
      organizer: me,
      isOrganizer: true,
      responseStatus: { response: 'organizer' },
      showAs: 'busy',
    },
    {
      id: 'e-design',
      subject: 'Design review',
      start: at(day(2), '14:00'),
      end: at(day(2), '15:00'),
      location: { displayName: 'Teams meeting' },
      isOnlineMeeting: true,
      onlineMeeting: { joinUrl: 'https://teams.example.test/join/design' },
      organizer: me,
      isOrganizer: true,
      responseStatus: { response: 'organizer' },
      showAs: 'busy',
    },
    {
      id: 'e-1on1',
      subject: 'One on one',
      start: at(day(3), '16:00'),
      end: at(day(3), '16:30'),
      organizer: ada,
      isOrganizer: false,
      responseStatus: { response: 'accepted' },
      showAs: 'busy',
    },
    {
      id: 'e-cancel',
      subject: 'Cancelled workshop',
      start: at(day(4), '09:00'),
      end: at(day(4), '10:00'),
      isCancelled: true,
      organizer: grace,
      isOrganizer: false,
      responseStatus: { response: 'accepted' },
      showAs: 'busy',
    },
  ];
  const detail: Record<string, CalendarEvent> = {};
  for (const e of events) {
    detail[e.id as string] = {
      ...e,
      attendees: [
        { type: 'required', status: { response: 'accepted' }, emailAddress: ada.emailAddress },
        {
          type: 'required',
          status: { response: 'tentativelyAccepted' },
          emailAddress: grace.emailAddress,
        },
        {
          type: 'optional',
          status: { response: 'declined' },
          emailAddress: { name: 'Finance Team', address: 'finance@example.test' },
        },
        {
          type: 'required',
          status: { response: e.responseStatus?.response ?? 'none' },
          emailAddress: me.emailAddress,
        },
      ],
      body: {
        contentType: 'html',
        content:
          '<p>Agenda:</p><ul><li>Review the numbers</li><li>Open questions</li></ul><p><a href="https://example.test/doc">Planning document</a></p>',
      },
    };
  }
  return { events, detail };
}
