/** Shapes of the Microsoft Graph calendar resources the views read. Every field is optional. */

export interface DateTimeZone {
  dateTime?: string;
  timeZone?: string;
}

export interface EventAttendee {
  type?: string;
  status?: { response?: string; time?: string };
  emailAddress?: { name?: string; address?: string };
}

export interface CalendarEvent {
  id?: string;
  subject?: string | null;
  start?: DateTimeZone;
  end?: DateTimeZone;
  isAllDay?: boolean;
  isCancelled?: boolean;
  isOrganizer?: boolean;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string } | null;
  onlineMeetingUrl?: string | null;
  location?: { displayName?: string } | null;
  organizer?: { emailAddress?: { name?: string; address?: string } };
  attendees?: EventAttendee[];
  responseStatus?: { response?: string };
  showAs?: string;
  type?: string;
  bodyPreview?: string;
  body?: { contentType?: string; content?: string };
  webLink?: string;
}

/** Tool roles the calendar views may call back (see actions.ts). */
export interface CalendarActions {
  /** Calendar view for a date range (navigation). */
  calView?: string;
  /** Plain event list (paging). */
  calList?: string;
  eventGet?: string;
  eventCreate?: string;
  eventUpdate?: string;
  eventDelete?: string;
  accept?: string;
  tentative?: string;
  decline?: string;
}
