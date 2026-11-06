/** Fixture contacts and tasks for the local view preview. Fictional names only. */
import type { Contact } from '../src/views/contacts/types.js';
import type { Task, TaskList } from '../src/views/tasks/types.js';

export const CONTACTS: Contact[] = [
  {
    id: 'c1',
    displayName: 'Ada Lovelace',
    jobTitle: 'Analyst',
    companyName: 'Analytical Engines',
    emailAddresses: [{ address: 'ada@example.test' }],
    mobilePhone: '+1 555 0100',
    businessAddress: { street: '1 Engine Way', city: 'London', countryOrRegion: 'UK' },
  },
  {
    id: 'c2',
    displayName: 'Grace Hopper',
    companyName: 'Compilers Inc',
    emailAddresses: [{ address: 'grace@example.test' }],
    businessPhones: ['+1 555 0111'],
  },
  { id: 'c3', displayName: 'Alan Turing', emailAddresses: [{ address: 'alan@example.test' }] },
  { id: 'c4', givenName: 'Katherine', surname: 'Johnson', jobTitle: 'Mathematician' },
  { id: 'c5', displayName: '3D Print Shop', businessPhones: ['+1 555 0123'] },
];

export const TASK_LISTS: TaskList[] = [
  { id: 'l1', displayName: 'Tasks', wellknownListName: 'defaultList' },
  { id: 'l2', displayName: 'Groceries' },
];

const day = (n: number): string => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export const TASKS: Record<string, Task[]> = {
  l1: [
    {
      id: 't1',
      title: 'Send the Q3 plan to finance',
      status: 'notStarted',
      importance: 'high',
      dueDateTime: { dateTime: `${day(1)}T00:00:00.0000000`, timeZone: 'UTC' },
      createdDateTime: new Date().toISOString(),
    },
    {
      id: 't2',
      title: 'Book travel',
      status: 'notStarted',
      dueDateTime: { dateTime: `${day(-2)}T00:00:00.0000000`, timeZone: 'UTC' },
      createdDateTime: new Date().toISOString(),
    },
    {
      id: 't3',
      title: 'Review the spec',
      status: 'inProgress',
      createdDateTime: new Date().toISOString(),
    },
    {
      id: 't4',
      title: 'Renew parking permit',
      status: 'completed',
      completedDateTime: { dateTime: new Date().toISOString(), timeZone: 'UTC' },
    },
  ],
  l2: [
    {
      id: 't5',
      title: 'Oat milk',
      status: 'notStarted',
      createdDateTime: new Date().toISOString(),
    },
  ],
};
