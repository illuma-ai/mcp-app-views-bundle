/** Locale-aware formatting shared by every view. The host supplies locale and time zone. */

export interface FormatContext {
  locale?: string;
  timeZone?: string;
}

const ctx: FormatContext = {};

/** Called whenever the host context changes. */
export function setFormatContext(next: FormatContext): void {
  if (typeof next.locale === 'string') ctx.locale = next.locale;
  if (typeof next.timeZone === 'string') ctx.timeZone = next.timeZone;
}

function fmt(date: Date, options: Intl.DateTimeFormatOptions): string {
  try {
    return new Intl.DateTimeFormat(ctx.locale, { timeZone: ctx.timeZone, ...options }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

function dayKey(date: Date): string {
  return fmt(date, { year: 'numeric', month: '2-digit', day: '2-digit' });
}

/** Compact list time: clock time today, weekday this week, month and day this year, else date. */
export function formatListTime(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  if (dayKey(date) === dayKey(now)) return fmt(date, { hour: 'numeric', minute: '2-digit' });
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days >= 0 && days < 6) return fmt(date, { weekday: 'short' });
  if (fmt(date, { year: 'numeric' }) === fmt(now, { year: 'numeric' })) {
    return fmt(date, { month: 'short', day: 'numeric' });
  }
  return fmt(date, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "March 10" this year, "February 26, 2025" otherwise: the date style of the files list. */
export function formatMonthDay(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = fmt(date, { year: 'numeric' }) === fmt(now, { year: 'numeric' });
  return fmt(date, { month: 'long', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** Full date and time for headers. */
export function formatFullTime(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : fmt(date, { dateStyle: 'full', timeStyle: 'short' });
}

/** Byte count as B / KB / MB. */
export function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== 'number' || !Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** One or two initials for an avatar. */
export function initials(label: string): string {
  const words = label
    .replace(/<[^>]*>/g, '')
    .split(/[\s@._-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? (words[words.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** Header date as the reference client writes it: "Tue 7/14/2026 8:28 AM". */
export function formatOutlookDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const day = fmt(date, {
    weekday: 'short',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).replace(',', '');
  return `${day} ${fmt(date, { hour: 'numeric', minute: '2-digit' })}`;
}

/** Numeric date for child rows: "7/14/2026". */
export function formatNumericDate(iso: string | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ''
    : fmt(date, { year: 'numeric', month: 'numeric', day: 'numeric' });
}

/** The host's IANA time zone (from the host context, else the browser's). */
export function hostTimeZone(): string {
  return ctx.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** Long date for headers: "Tuesday, March 10". */
export function formatDayLabel(
  dateKey: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'long', month: 'long', day: 'numeric' }
): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat(ctx.locale, { timeZone: 'UTC', ...options }).format(
    new Date(Date.UTC(y, m - 1, d))
  );
}
