/** Shapes of the Microsoft Graph To Do resources the views read. Every field is optional. */

export interface TaskList {
  id?: string;
  displayName?: string;
  isOwner?: boolean;
  wellknownListName?: string;
}

export interface TaskDate {
  dateTime?: string;
  timeZone?: string;
}

export type TaskStatus = 'notStarted' | 'inProgress' | 'completed' | 'waitingOnOthers' | 'deferred';

export interface Task {
  id?: string;
  title?: string;
  status?: TaskStatus;
  importance?: 'low' | 'normal' | 'high';
  dueDateTime?: TaskDate;
  completedDateTime?: TaskDate;
  body?: { content?: string; contentType?: string };
  isReminderOn?: boolean;
  createdDateTime?: string;
}

/** Tool roles the task views may call back (see actions.ts). */
export interface TasksActions {
  taskLists?: string;
  tasksList?: string;
  taskUpdate?: string;
  taskCreate?: string;
}
