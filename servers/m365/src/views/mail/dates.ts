/** Date-group labels for the list ("Today", "Yesterday", "This week", ...). Pure and unit-tested. */

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

/** Monday as the first day of the week. */
function startOfWeek(d: Date): number {
  const day = (d.getDay() + 6) % 7;
  return startOfDay(d) - day * 86_400_000;
}

/** The group a message belongs to, relative to `now`. Older months are named. */
export function dateGroup(iso: string | undefined, now: Date = new Date()): string {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Older';
  const day = startOfDay(date);
  const today = startOfDay(now);
  if (day >= today) return 'Today';
  if (day >= today - 86_400_000) return 'Yesterday';
  const week = startOfWeek(now);
  if (day >= week) return 'This week';
  if (day >= week - 7 * 86_400_000) return 'Last week';
  if (date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth())
    return 'Earlier this month';
  return date.toLocaleString('en', { month: 'long', year: 'numeric' });
}
