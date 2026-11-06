/**
 * The tool roles a view may call back, across every area. The server fills this from endpoints.json
 * (`appViewAction`) for the tools that are actually enabled; a missing role means "not available"
 * and the matching control is disabled rather than guessed.
 */
import type { CalendarActions } from './calendar/types.js';
import type { ContactsActions } from './contacts/types.js';
import type { FilesActions } from './files/types.js';
import type { MailActions } from './mail/types.js';
import type { TasksActions } from './tasks/types.js';
import type { TeamsActions } from './teams/types.js';

export type ViewActions = MailActions &
  CalendarActions &
  TeamsActions &
  FilesActions &
  ContactsActions &
  TasksActions;
export type ActionRole = keyof ViewActions;
