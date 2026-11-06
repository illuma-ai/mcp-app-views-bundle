/**
 * The parity table: what each view state is compared to, the measured items, and the justified
 * differences. One source for three readers:
 *   - bin/measure-views.mjs measures our views and asserts every SPEC entry (--assert fails the gate
 *     on any difference that is not in JUSTIFIED);
 *   - the same script writes docs/parity-matrix.md from MATRIX plus the measured values;
 *   - test/parity-matrix.test.ts checks that every SPEC key sits in exactly one MATRIX row and that
 *     the committed matrix names every row.
 *
 * SPEC values are measured from the real app (computed styles, or pixel scans of the captures in
 * m365-setup/reference, which are 1:1 with CSS pixels). Size entries are w x h; `step` is a distance
 * between two measured edges; `gap` is the space between two elements.
 */

export const SPEC = {
  // ---- Outlook mail (outlook-spec.md, captures outlook/01..06)
  rowPlain: { h: 81 },
  rowChip: { h: 96 },
  avatar: { w: 32, h: 32, left: 32 },
  textColumn: { left: 72 },
  chevron: { left: 12 },
  sender: { fs: '14px', c: '#242424' },
  subject: { fs: '14px', c: '#242424' },
  preview: { fs: '14px', c: '#616161' },
  date: { fs: '12px', c: '#242424' },
  unreadSubject: { c: '#0f6cbd', fw: '600' },
  group: { h: 37, bg: '#f5f5f5', fs: '14px', fw: '600' },
  newMail: { h: 32, bg: '#0f6cbd', fs: '14px' },
  iconButton: { w: 32, h: 32 },
  selectedRow: { bg: '#cfe4fa' },
  cardAvatar: { w: 40, h: 40 },
  collapsed: { h: 80 },
  replyButton: { h: 32, fs: '14px' },
  attachmentCard: { w: 260, h: 48 },
  // ---- Outlook new-mail compose (pixel scan of outlook/03-new-mail-compose.jpg)
  composeBar: { h: 49 },
  composeBarGap: { gap: 12 },
  composeToBtn: { w: 50, h: 32 },
  composePitch: { step: 44 },
  composePad: { left: 12 },
  composeSubject: { h: 32 },
  composeSubjectGap: { gap: 16 },
  composeUnderline: { c: '#969696' },
  // ---- Outlook calendar (outlook-calendar/spec.md)
  calTitle: { fs: '20px', fw: '600', c: '#424242' },
  calNewEvent: { h: 32, bg: '#0f6cbd', fs: '14px' },
  // Pixel scans of calendar/03-day-view.jpg and 04-month-view.jpg (the DOM spec's 12px day number and
  // 35px half-hour row were the mini month and a denser grid; the real grid is as below).
  calDayHead: { h: 55 },
  calDayNum: { fs: '20px', fw: '600', c: '#0f6cbd' },
  calWeekday: { fs: '12px', c: '#0f6cbd' },
  calTodayBar: { bt: 3, btc: '#0f6cbd' },
  calHalf: { step: 40 },
  // calendar/06-week-view-with-event.jpg: the circled plus at the right of today's header, 8px from the
  // edge, and the current-time line (a 2px solid line over today, a 12px dot, a thin dashed line before it)
  calNewHere: { w: 24, h: 24, right: 8, label: 'New event' },
  calNowLine: { bt: 2, bs: 'solid', btc: '#0f6cbd' },
  calNowDot: { w: 12, h: 12, bg: '#0f6cbd', r: '50%' },
  calNowAcross: { bt: 1, bs: 'dashed' },
  // The toolbar stays on one line at 880px, and what does not fit is under a ... button
  // ... and at the real frame width (865px) nothing is clipped; the hours scroll inside the frame and open at the current hour
  calToolbar: { rows: 1, overflow: 'More commands', clipped: 0 },
  calToolbar865: { rows: 1, overflow: 'More commands', clipped: 0 },
  calScroll: { overflowY: 'auto', atNow: 'yes' },
  calMonthHead: { h: 29 },
  calMonthDay0: { label: 'Sunday' },
  calMonthCell: { h: 93 },
  calMonthFirst: { label: 'Mon 1' },
  calToday: { w: 20, h: 20, c: '#ffffff', bg: '#0f6cbd' },
  // calendar/05-work-week-view.jpg: five columns, the same 55px header
  calWorkWeekCols: { n: 5 },
  calWorkWeekHead: { h: 55 },
  // ---- Teams (teams/spec.md)
  teamsTitle: { fs: '18px', fw: '700', c: '#242424' },
  teamsPill: { h: 24, fs: '12px', c: '#424242' },
  teamsUnreadName: { fs: '14px', fw: '700' },
  teamsReadName: { fs: '14px', fw: '400', c: '#242424' },
  teamsRowCompact: { h: 32 },
  // teams/22-chat-list-avatars-real.png: every list avatar is 20px with an 8px gap to the title; person = circle,
  // bot/app = 2px-radius solid brand-indigo square, meeting = circle on light lavender, group of bots = grey circle.
  teamsAvatarPerson: { w: 20, h: 20, r: '10000px' },
  teamsAvatarBot: { w: 20, h: 20, r: '2px', bg: '#4f52b2' },
  teamsAvatarMeeting: { w: 20, h: 20, r: '10000px', bg: '#e8ebfa' },
  teamsAvatarGroup: { w: 20, h: 20, r: '10000px' },
  teamsAvatarGap: { gap: 8 },
  teamsAvatarBadge: { presence: 'present' },
  teamsConvTitle: { fs: '18px', fw: '700' },
  teamsMeta: { fs: '12px' },
  teamsBody: { fs: '14px', c: '#242424', r: '8px' },
  teamsComposer: { h: 38 },
  // teams/18-compose-rest.png, 19-compose-hover.png, 20-compose-focus.png: rest is a 1px #e0e0e0 border with a 6px
  // radius; hover is identical; focus keeps the border and adds a 2px brand line inside the bottom (no field border).
  teamsComposerBox: { r: '6px' },
  // One bordered box holds the field and the icons (same line while single-line); nothing else has a border.
  teamsComposeRest: {
    bw: '1px',
    bc: '#e0e0e0',
    r: '6px',
    shadow: 'none',
    field: '0px',
    boxes: 1,
    icons: 'inside',
    line: 'same',
  },
  teamsComposeHover: {
    bw: '1px',
    bc: '#e0e0e0',
    r: '6px',
    shadow: 'none',
    field: '0px',
    boxes: 1,
    icons: 'inside',
    line: 'same',
  },
  teamsComposeFocus: {
    bw: '1px',
    bc: '#e0e0e0',
    r: '6px',
    shadow: 'rgb(91, 95, 199) 0px -4px 0px -2px inset',
    field: '0px',
    boxes: 1,
    icons: 'inside',
    line: 'same',
  },
  teamsComposerPad: { pad: '10px 16px 8px 12px' },
  // teams/13-channel-posts-real.jpg
  teamsChanTabs: { label: 'Posts Shared Page Notes' },
  teamsChanPostBtn: { h: 32, label: 'Post in channel' },
  // teams/14-bot-chat-with-file-card.jpg and 15-empty-channel.jpg
  teamsChatTabs: { label: 'Chat Shared Notes Recap' },
  teamsFileCard: { h: 48 },
  teamsEmptyChannel: {
    title: 'Welcome to your new team!',
    sub: 'You got the group together. Go do things!',
  },
  // ---- To Do (pixel scan of tasks/01-tasks-list-empty.jpg and tasks/live-grid-with-task.jpg)
  todoAddTop: { h: 52 },
  todoAddFoot: { h: 45 },
  todoAddBtn: { h: 32 },
  todoTableHead: { h: 40 },
  todoTableRow: { h: 40 },
  // ---- OneDrive (onedrive/words.live.md, pixel scan of onedrive/01-my-files-list.jpg)
  odCreate: { h: 36 },
  odHead: { h: 49, fs: '14px', fw: '600', c: '#616161' },
  odRow: { h: 49 },
  // ---- People (pixel scan of contacts/01-your-contacts-empty.jpg)
  contactsBar: { h: 41 },
  contactsNewBtn: { h: 32, bg: '#0f6cbd' },
  contactsEmptyBtn: { h: 32, w: 135 },
};

/**
 * Differences that are kept on purpose, keyed "specKey.prop". A difference not listed here fails the
 * gate. Each entry says why it cannot or should not be closed.
 */
export const JUSTIFIED = {
  'teamsAvatarBadge.presence':
    'The presence badge (green available, yellow away) needs a presence tool the views do not have, and showing a status we cannot read would be wrong; it is omitted. Add a presence role to show it.',
  'contactsNewBtn.bg':
    'New contact is disabled here (creating contacts is not reachable from a view), so it shows the disabled style; the real button is enabled and blue.',
  'composeUnderline.c':
    'The real field underline is #969696; no Fluent token has that value and views may not use colour literals, so the nearest token (colorNeutralStroke1) is used.',
};

const CAP = 'm365-setup/reference';

/**
 * One row per view state. `keys` are SPEC keys measured for the row; `capture` is the real capture it
 * is compared with (null when none exists, and then `need` says exactly what to capture).
 */
export const MATRIX = [
  // Mail
  {
    id: 'mail-list',
    area: 'Outlook mail',
    state: 'Inbox list, populated',
    where: '640 light',
    capture: `${CAP}/outlook/01-inbox-list.jpg`,
    spec: 'outlook-spec.md',
    keys: [
      'rowPlain',
      'rowChip',
      'avatar',
      'textColumn',
      'chevron',
      'sender',
      'subject',
      'preview',
      'date',
      'unreadSubject',
      'group',
      'newMail',
      'iconButton',
      'selectedRow',
    ],
  },
  {
    id: 'mail-list-empty',
    area: 'Outlook mail',
    state: 'Inbox list, empty folder',
    where: '640 light',
    capture: null,
    need: 'The real inbox of an empty folder (e.g. Archive with nothing in it): the full pane with its empty-state text and illustration.',
  },
  {
    id: 'mail-list-loading',
    area: 'Outlook mail',
    state: 'Inbox list, loading',
    where: '640 light',
    capture: null,
    need: 'The real inbox while a folder is loading (skeleton rows, if any), captured mid-load.',
  },
  {
    id: 'mail-thread',
    area: 'Outlook mail',
    state: 'Reading pane / thread (card, collapsed message, attachment)',
    where: '640 light',
    capture: `${CAP}/outlook/02-reading-pane.jpg, 05, 06`,
    spec: 'outlook-spec.md',
    keys: ['cardAvatar', 'collapsed', 'replyButton', 'attachmentCard'],
  },
  {
    id: 'mail-compose',
    area: 'Outlook mail',
    state: 'New message compose: send bar, To/Cc rows, subject (field sizes)',
    where: '640 light',
    capture: `${CAP}/outlook/03-new-mail-compose.jpg`,
    spec: 'pixel scan of the capture',
    keys: [
      'composeBar',
      'composeBarGap',
      'composeToBtn',
      'composePitch',
      'composePad',
      'composeSubject',
      'composeSubjectGap',
      'composeUnderline',
    ],
  },
  {
    id: 'mail-compose-edit',
    area: 'Outlook mail',
    state:
      'Compose edit modes: recipient chips, invalid address, body with quoted history, attachments',
    where: '640 light',
    capture: null,
    need: 'The real compose with (a) two recipient chips and a typed partial address, (b) an invalid address, (c) an inline reply with the quoted history pill, (d) one attached file. Include the field focus state (blue underline).',
  },
  {
    id: 'mail-reply-inline',
    area: 'Outlook mail',
    state: 'Inline reply composer',
    where: '640 light',
    capture: `${CAP}/outlook/04-inline-reply.jpg`,
    spec: 'visual only',
    keys: [],
    note: 'Captured but not yet measured; the compose field sizes above apply to it.',
  },
  {
    id: 'mail-dialogs',
    area: 'Outlook mail',
    state: 'Discard confirmation, blocked-content bar, move/folder menu',
    where: '640 light',
    capture: null,
    need: 'The real discard-draft dialog, the "Images and scripts have been blocked" bar, and the Move to menu open.',
  },
  // Calendar
  {
    id: 'cal-week',
    area: 'Outlook calendar',
    state: 'Week grid',
    where: '640 light',
    capture: `${CAP}/outlook-calendar/01-week-view.jpg, 06-week-view-with-event.jpg, live/m365-calendar-real-outlook-event.jpg`,
    spec: 'outlook-calendar/spec.md',
    keys: [
      'calTitle',
      'calNewEvent',
      'calDayHead',
      'calDayNum',
      'calWeekday',
      'calTodayBar',
      'calHalf',
      'calNewHere',
      'calNowLine',
      'calNowDot',
      'calNowAcross',
      'calToolbar',
      'calToolbar865',
      'calScroll',
    ],
  },
  {
    id: 'cal-day-month',
    area: 'Outlook calendar',
    state: 'Day grid and Month grid (weekday row, week rows, today circle, month labels)',
    where: '640 light',
    capture: `${CAP}/outlook-calendar/03-day-view.jpg, 04-month-view.jpg`,
    spec: 'pixel scan of the captures; words.md "Day and Month views"',
    keys: ['calMonthHead', 'calMonthDay0', 'calMonthCell', 'calMonthFirst', 'calToday'],
    note: 'The Day grid is the week grid with one column, so its header, hour rows and today bar are the week rows above.',
  },
  {
    id: 'cal-work-week',
    area: 'Outlook calendar',
    state: 'Work week (five columns Monday to Friday)',
    where: '640 light',
    capture: `${CAP}/outlook-calendar/05-work-week-view.jpg`,
    spec: 'pixel scan of the capture; words.md "Day and Month views"',
    keys: ['calWorkWeekCols', 'calWorkWeekHead'],
    note: 'Same hour grid and header as the week row; only the number of days differs.',
  },
  {
    id: 'cal-other-modes',
    area: 'Outlook calendar',
    state: 'Narrow-window agenda',
    where: '360 light',
    capture: null,
    need: 'The real calendar at a narrow window width (does Outlook show an agenda list there, and what does its toolbar do?).',
  },
  {
    id: 'cal-event-detail',
    area: 'Outlook calendar',
    state: 'Event detail card (organizer and invitee, with Accept/Tentative/Decline)',
    where: '640 light',
    capture: null,
    need: 'The real event popup/detail for an event you organise and one you are invited to; and the online-meeting Join state.',
  },
  {
    id: 'cal-event-form',
    area: 'Outlook calendar',
    state:
      'New / edit event form (title, start, end, location, attendees, description) field sizes',
    where: '640 light',
    capture: null,
    need: 'The real New event form (compact inline fields: title, date/time pickers, location, attendees, description editor) and one with a validation error and with attendees added. Our field sizes are listed below, unmatched.',
  },
  {
    id: 'cal-empty-loading',
    area: 'Outlook calendar',
    state: 'Empty range, loading',
    where: '640 light',
    capture: null,
    need: 'A real week with no events, and the grid mid-load.',
  },
  // Teams
  {
    id: 'teams-list',
    area: 'Teams',
    state: 'Chat list (title, filter pills, rows, unread)',
    where: '640 / 360 light',
    capture: `${CAP}/teams/01-chat-conversation.jpg`,
    spec: 'teams/spec.md',
    keys: [
      'teamsTitle',
      'teamsPill',
      'teamsUnreadName',
      'teamsReadName',
      'teamsRowCompact',
      'teamsAvatarPerson',
      'teamsAvatarBot',
      'teamsAvatarMeeting',
      'teamsAvatarGroup',
      'teamsAvatarGap',
      'teamsAvatarBadge',
    ],
  },
  {
    id: 'teams-conversation',
    area: 'Teams',
    state: 'Conversation (header, messages, composer)',
    where: '640 light',
    capture: `${CAP}/teams/01-chat-conversation.jpg`,
    spec: 'teams/spec.md',
    keys: [
      'teamsConvTitle',
      'teamsMeta',
      'teamsBody',
      'teamsComposer',
      'teamsComposerBox',
      'teamsComposeRest',
      'teamsComposeHover',
      'teamsComposeFocus',
      'teamsComposerPad',
    ],
  },
  {
    id: 'teams-edit',
    area: 'Teams',
    state: 'Composer with text, multi-line, send disabled/enabled, error',
    where: '640 light',
    capture: null,
    need: 'The real composer with one line, with three lines (how it grows), and the Send arrow enabled vs disabled; plus a failed send.',
  },
  {
    id: 'teams-other',
    area: 'Teams',
    state: 'Channels and threads, cards from apps, empty chat, loading',
    where: '640 light',
    capture: null,
    need: 'An adaptive card posted by an app or bot, and the chat list while loading.',
  },
  {
    id: 'teams-bot-chat',
    area: 'Teams',
    state: 'Bot chat with a sent-file card (tabs, file card)',
    where: '640 light',
    capture: `${CAP}/teams/14-bot-chat-with-file-card.jpg`,
    spec: 'pixel scan of the capture; teams/words.md "Bot chat with a file card"',
    keys: ['teamsChatTabs', 'teamsFileCard'],
    note: 'Ours shows the file card header (icon, name, share, more) without the document preview thumbnail: Graph gives a link, not a preview image, and a view cannot fetch one.',
  },
  {
    id: 'teams-empty-channel',
    area: 'Teams',
    state: 'Empty channel ("Welcome to your new team!")',
    where: '640 light',
    capture: `${CAP}/teams/15-empty-channel.jpg`,
    spec: 'pixel scan of the capture; teams/words.md "Empty channel"',
    keys: ['teamsEmptyChannel'],
    note: 'The illustration is not reproduced (an image asset); the heading, line and Post in channel button are.',
  },
  {
    id: 'teams-channel',
    area: 'Teams',
    state: 'Channel posts (tabs, Post in channel button)',
    where: '640 light',
    capture: `${CAP}/teams/13-channel-posts-real.jpg`,
    spec: 'pixel scan of the capture; teams/words.md "Channel posts"',
    keys: ['teamsChanTabs', 'teamsChanPostBtn'],
    note: 'The real Post in channel button is Teams purple; ours uses the host brand colour, which the host sets.',
  },
  // To Do
  {
    id: 'todo-add',
    area: 'To Do',
    state: 'Add a task row and its footer (Add button)',
    where: '640 light',
    capture: `${CAP}/tasks/01-tasks-list-empty.jpg`,
    spec: 'pixel scan of the capture',
    keys: ['todoAddTop', 'todoAddFoot', 'todoAddBtn'],
  },
  {
    id: 'todo-grid',
    area: 'To Do',
    state: 'Grid table (Due Date, Importance, star)',
    where: '640 light',
    capture: `${CAP}/tasks/live-grid-with-task.jpg`,
    spec: 'pixel scan of the capture',
    keys: ['todoTableHead', 'todoTableRow'],
  },
  {
    id: 'todo-other',
    area: 'To Do',
    state:
      'List layout, completed section, overdue and due dates, list picker, add row with text, star toggled',
    where: '640 light',
    capture: null,
    need: 'The real To Do List layout with tasks (one overdue, one with a due date, one important), the Completed section expanded, the lists menu open, and the Add row focused with text typed.',
  },
  // OneDrive
  {
    id: 'od-list',
    area: 'OneDrive',
    state: 'My files list (toolbar, header row, rows)',
    where: '640 / 900 light',
    capture: `${CAP}/onedrive/01-my-files-list.jpg`,
    spec: 'onedrive/words.live.md',
    keys: ['odCreate', 'odHead', 'odRow'],
  },
  {
    id: 'od-other',
    area: 'OneDrive',
    state:
      'Grid layout, selection with command bar, Details pane, New folder / Rename dialogs, empty folder, loading',
    where: '640 light',
    capture: null,
    need: 'The real My files in tiles/grid layout; a row selected (command bar with Download/Rename/Move to/Delete); the Details pane; the New folder and Rename dialogs; an empty folder; and the list while loading.',
  },
  // People
  {
    id: 'people-empty',
    area: 'People',
    state: 'Command bar and empty state',
    where: '640 light',
    capture: `${CAP}/contacts/01-your-contacts-empty.jpg`,
    spec: 'contacts/words.live.md',
    keys: ['contactsBar', 'contactsNewBtn', 'contactsEmptyBtn'],
  },
  {
    id: 'people-other',
    area: 'People',
    state: 'Contact list with contacts, search results, contact card, no results',
    where: '640 light',
    capture: null,
    need: 'The real Your contacts with several contacts (alphabet headers, row height), a contact selected (the card/pane with Email/Call), a search with results and with none.',
  },
  // Cross-cutting
  {
    id: 'xcut-narrow',
    area: 'All views',
    state: '360 and 900 px layouts',
    where: '360, 900 light and dark',
    capture: null,
    need: 'The real apps at a 360px-wide and a 900px-wide window (mail list + reading, calendar, Teams, OneDrive, To Do, People): what they hide, stack or wrap. Ours only asserts no horizontal overflow at those widths (test/parity-matrix.test.ts).',
  },
  {
    id: 'xcut-dark',
    area: 'All views',
    state: 'Dark theme',
    where: 'dark',
    capture: null,
    need: 'The real apps in dark theme for the same states: background, row hover/selected, text and accent colours. outlook-spec.md has no dark measurement.',
  },
];

/** The unmatched field sizes of our compose/create forms, shown beside the "no capture" form rows. */
export const OURS_ONLY = {
  'cal-event-form': ['eventTitle', 'eventDate', 'eventLocation', 'eventAttendees', 'eventBody'],
  'teams-edit': [],
};

/** Sizes must match to the pixel; half a pixel absorbs fractional layout, nothing more. */
export const TOLERANCE = 0.5;

const fmt = (v) => (v === undefined || v === null ? 'n/a' : String(v));

/** Renders docs/parity-matrix.md from the rows and a map of measured values (key -> {prop: value}). */
/**
 * Dark theme: the Fluent web dark palette token each surface and text role uses. There is no real dark
 * capture of these yet, so the palette is the spec; `npm run measure:views -- --contrast` asserts every
 * text is at least 4.5:1 (3:1 large) on its background and that no surface larger than a few px is painted at or below #141414.
 */
export const DARK_SURFACES = [
  ['View frame, list panes, cards, headers', 'colorNeutralBackground1', '#292929'],
  ['Pane behind a list, secondary bands, inputs on a card', 'colorNeutralBackground2', '#1f1f1f'],
  [
    'Group headers, agenda day bands, disabled controls (one step below the rows, as the light page layers them)',
    'colorNeutralBackground3 (remapped to the second layer in `src/views/ui/dark-theme.ts`)',
    '#1f1f1f',
  ],
  [
    'Chat message pane (cards sit one layer above it; asserted by the contrast gate)',
    'colorNeutralBackground5 (set to the second layer in `src/views/ui/dark-theme.ts`)',
    '#1f1f1f',
  ],
  ['Chat message cards', 'colorNeutralBackground6 (set to the first layer)', '#292929'],
  [
    'Palette floor: scroll gutters only, never a surface',
    'colorNeutralBackground3 (palette value)',
    '#141414',
  ],
  ['Hover and selected rows', 'colorNeutralBackground1Hover / Selected', '#3d3d3d / #383838'],
  ['Borders and dividers', 'colorNeutralStroke1 / colorNeutralStroke2', '#666666 / #525252'],
  ['Primary text (sender, subject, titles)', 'colorNeutralForeground1', '#ffffff'],
  ['Secondary text (preview, time, labels)', 'colorNeutralForeground2', '#d6d6d6'],
  ['Hints, placeholders, meta', 'colorNeutralForeground3', '#adadad'],
  ['Links and accents', 'colorBrandForegroundLink / colorBrandForeground1', '#479ef5'],
];

export function renderMatrix(measured, oursOnly = {}) {
  const lines = [];
  lines.push('# Parity matrix');
  lines.push('');
  lines.push(
    'Generated by `npm run measure:views -- --matrix` from `bin/parity-spec.mjs` and the measured values of the preview in Chrome. Do not edit by hand.'
  );
  lines.push('');
  lines.push(
    'One row per view state. **Spec** is measured from the real app (computed style, or a pixel scan of the 1:1 capture). **Ours** is measured in the preview. **Delta** is ours minus spec (px; colours and fonts compare equal or differ). `ok` is a zero delta (sizes to the pixel); `justified` is a kept difference with its reason; anything else fails the gate. Rows with no capture say exactly what to capture next.'
  );
  lines.push('');
  const keysSeen = new Set();
  for (const row of MATRIX) {
    lines.push(`## ${row.area}: ${row.state}`);
    lines.push('');
    lines.push(`- Row: \`${row.id}\``);
    lines.push(`- Width and theme: ${row.where}`);
    if (!row.capture) {
      lines.push('- Capture: **no capture**');
      lines.push(`- Needed: ${row.need}`);
      const mine = oursOnly[row.id];
      if (mine && Object.keys(mine).length) {
        lines.push('');
        lines.push('Our measured sizes (no real value to compare with yet):');
        lines.push('');
        lines.push('| Item | Ours |');
        lines.push('| --- | --- |');
        for (const [k, v] of Object.entries(mine)) lines.push(`| ${k} | ${v} |`);
      }
      lines.push('');
      continue;
    }
    lines.push(`- Capture: ${row.capture}`);
    lines.push(`- Spec source: ${row.spec}`);
    if (row.note) lines.push(`- Note: ${row.note}`);
    lines.push('');
    if (row.keys.length) {
      lines.push('| Item | Property | Spec | Ours | Delta | Status |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      for (const key of row.keys) {
        keysSeen.add(key);
        for (const [prop, want] of Object.entries(SPEC[key])) {
          const got = measured[key]?.[prop];
          const numeric =
            typeof want === 'number' && got !== undefined && !Number.isNaN(Number(got));
          const delta = numeric ? Number(got) - want : String(got) === String(want) ? 0 : 'differs';
          const equal = numeric
            ? Math.abs(Number(got) - want) <= TOLERANCE
            : String(got) === String(want);
          const why = JUSTIFIED[`${key}.${prop}`];
          const status = equal ? 'ok' : why ? `justified: ${why}` : 'DIFF';
          lines.push(
            `| ${key} | ${prop} | ${fmt(want)} | ${fmt(got)} | ${fmt(delta)} | ${status} |`
          );
        }
      }
      lines.push('');
    }
  }
  lines.push('## Dark theme surfaces');
  lines.push('');
  lines.push(
    'No real dark capture yet: the Fluent web dark palette is the spec. The contrast gate (`npm run measure:views -- --contrast`) fails on any text under 4.5:1 (3:1 large) and on any surface larger than a few px painted at or below #141414.'
  );
  lines.push('');
  lines.push('| Surface or role | Token | Value |');
  lines.push('| --- | --- | --- |');
  for (const [role, token, value] of DARK_SURFACES)
    lines.push(`| ${role} | \`${token}\` | ${value} |`);
  lines.push('');
  return lines.join('\n') + '\n';
}

/** The SPEC entries that fail: a difference with no justification, or a value that was not measured. */
export function failures(measured) {
  const out = [];
  for (const [key, want] of Object.entries(SPEC)) {
    const got = measured[key];
    if (!got) {
      out.push(`${key}: not measured`);
      continue;
    }
    for (const [prop, expected] of Object.entries(want)) {
      const actual = got[prop];
      const ok =
        String(actual) === String(expected) ||
        (typeof expected === 'number' && Math.abs(Number(actual) - expected) <= TOLERANCE);
      if (!ok && !JUSTIFIED[`${key}.${prop}`])
        out.push(`${key}.${prop}: spec ${expected}, ours ${actual}`);
    }
  }
  return out;
}
