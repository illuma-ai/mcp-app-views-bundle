/** To Do logic with no UI: splitting, ordering and due dates. */
import type { Task, TaskList } from './types.js';

export const isDone = (t: Task): boolean => t.status === 'completed';

/** Open tasks first by due date (undated last), then newest; completed tasks listed apart. */
export function splitTasks(tasks: Task[]): { open: Task[]; done: Task[] } {
  const due = (t: Task): number =>
    t.dueDateTime?.dateTime
      ? Date.parse(`${t.dueDateTime.dateTime.slice(0, 10)}T00:00:00Z`)
      : Infinity;
  const open = tasks
    .filter((t) => !isDone(t))
    .sort((a, b) => {
      const d = due(a) - due(b);
      if (d !== 0 && !Number.isNaN(d)) return d;
      return (b.createdDateTime ?? '').localeCompare(a.createdDateTime ?? '');
    });
  const done = tasks
    .filter(isDone)
    .sort((a, b) =>
      (b.completedDateTime?.dateTime ?? '').localeCompare(a.completedDateTime?.dateTime ?? '')
    );
  return { open, done };
}

/** True when a task's day is before today and it is not completed. */
export function isOverdue(t: Task, today: Date = new Date()): boolean {
  if (isDone(t) || !t.dueDateTime?.dateTime) return false;
  const day = t.dueDateTime.dateTime.slice(0, 10);
  const now = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return day < now;
}

/** "Due Tue, Nov 4" (the year only when it is not the current one), from the date part alone. */
export function dueLabel(t: Task, today: Date = new Date()): string {
  const iso = t.dueDateTime?.dateTime?.slice(0, 10);
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00Z`);
  const sameYear = d.getUTCFullYear() === today.getFullYear();
  const text = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(d);
  return `Due ${text}`;
}

/** Lists with the built-in default list first, the rest by name. */
export function sortLists(lists: TaskList[]): TaskList[] {
  const rank = (l: TaskList): number => (l.wellknownListName === 'defaultList' ? 0 : 1);
  return [...lists].sort(
    (a, b) => rank(a) - rank(b) || (a.displayName ?? '').localeCompare(b.displayName ?? '')
  );
}

/** Tasks and lists arrive in the same view; a task has a title, a list a display name. */
export function looksLikeLists(items: Array<Task | TaskList>): boolean {
  const first = items[0] as Record<string, unknown> | undefined;
  return Boolean(first && 'displayName' in first && !('title' in first));
}
