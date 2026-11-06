/**
 * A minimal MCP Apps host for the local preview. It uses the SDK's AppBridge, so a view speaks the
 * real protocol here: handshake, host context with the chat host's own style variables, tool
 * input/result, and App-initiated tool calls that wait for an explicit approval (like the real
 * host's confirmation card). Tool calls are answered from fixtures; nothing contacts a mail service.
 */
import { AppBridge, PostMessageTransport } from '@modelcontextprotocol/ext-apps/app-bridge';
import { addDays, startOfDayIso, todayKey, weekStart } from '../src/views/calendar/logic.js';
import { buildCalendar } from './calendar-fixtures.js';
import { buildFixtures } from './fixtures.js';
import { buildFiles } from './files-fixtures.js';
import { CONTACTS, TASKS, TASK_LISTS } from './people-fixtures.js';
import { buildTeams } from './teams-fixtures.js';
import { type Result, mockTool } from './mock-tools.js';

type Theme = 'light' | 'dark';

/** The variables the chat host sends (see its host bridge): colour roles as bare "R G B" triplets. */
const HOST_VARIABLES: Record<Theme, Record<string, string>> = {
  light: {
    '--color-background-primary': '255 255 255',
    '--color-background-secondary': '247 247 248',
    '--color-background-tertiary': '236 236 236',
    '--color-background-danger': '185 28 28',
    '--color-text-primary': '33 33 33',
    '--color-text-secondary': '66 66 66',
    '--color-text-tertiary': '89 89 89',
    '--color-text-danger': '220 38 38',
    '--color-text-warning': '180 83 9',
    '--color-border-primary': '205 205 205',
    '--color-border-secondary': '227 227 227',
    '--color-border-danger': '220 38 38',
  },
  dark: {
    '--color-background-primary': '13 13 13',
    '--color-background-secondary': '33 33 33',
    '--color-background-tertiary': '47 47 47',
    '--color-background-danger': '153 27 27',
    '--color-text-primary': '236 236 236',
    '--color-text-secondary': '205 205 205',
    '--color-text-tertiary': '153 150 150',
    '--color-text-danger': '248 113 113',
    '--color-text-warning': '245 158 11',
    '--color-border-primary': '57 57 57',
    '--color-border-secondary': '33 33 33',
    '--color-border-danger': '239 68 68',
  },
};

const params = new URLSearchParams(location.search);
const view = params.get('view') ?? 'inbox';
const scenario = params.get('scenario') ?? '';
const themeParam = params.get('theme') ?? 'both';
const width = Number(params.get('width') ?? '640');
const noVars = params.get('vars') === 'none';
// A host whose dark surface is pure black (the case the dark views must not copy).
const blackHost = params.get('blackhost') === '1';
const noSandbox = params.get('nosandbox') === '1';
const compare = params.get('compare');
const fixtures = buildFixtures();

interface Scenario {
  input: Record<string, unknown>;
  result: Result;
}

function scenarioFor(): Scenario {
  const json = (data: unknown): Result => ({
    content: [{ type: 'text', text: JSON.stringify(data) }],
  });
  if (view === 'inbox') {
    return { input: { mailFolderId: 'inbox', top: 10 }, result: json(fixtures.inboxPage1) };
  }
  if (view === 'calendar') {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const cal = buildCalendar();
    if (scenario === 'agenda') return { input: {}, result: json({ value: cal.events }) };
    const start = weekStart(todayKey(new Date(), zone));
    return {
      input: {
        startDateTime: startOfDayIso(start, zone),
        endDateTime: startOfDayIso(addDays(start, 7), zone),
      },
      result: json({ value: cal.events }),
    };
  }
  if (view === 'files')
    return {
      input: { driveId: 'drive-1', driveItemId: 'root' },
      result: json({ value: buildFiles().root }),
    };
  if (view === 'file')
    return {
      input: { driveId: 'drive-1', driveItemId: 'i-q3' },
      result: json(buildFiles().root[2]),
    };
  if (view === 'contacts')
    return { input: {}, result: json({ value: scenario === 'empty' ? [] : CONTACTS }) };
  if (view === 'contact') return { input: { contactId: 'c1' }, result: json(CONTACTS[0]) };
  if (view === 'tasks')
    return scenario === 'lists'
      ? { input: {}, result: json({ value: TASK_LISTS }) }
      : {
          input: { todoTaskListId: 'l1' },
          result: json({ value: scenario === 'empty' ? [] : TASKS.l1 }),
        };
  if (view === 'chats') {
    const t = buildTeams();
    if (scenario === 'channels') return { input: {}, result: json({ value: t.teams }) };
    return { input: {}, result: json({ value: t.chats }) };
  }
  if (view === 'conversation') {
    const t = buildTeams();
    if (scenario === 'channel-empty')
      return { input: { teamId: 't-eng', channelId: 'c-general' }, result: json({ value: [] }) };
    if (scenario === 'bot')
      return {
        input: { chatId: 'chat-bot' },
        result: json({
          value: [
            {
              id: 'b1',
              createdDateTime: '2026-09-23T22:08:00Z',
              messageType: 'message',
              from: { user: { id: 'u-me', displayName: 'Me' } },
              body: { contentType: 'html', content: '<attachment id="f1"></attachment>' },
              attachments: [
                { id: 'f1', name: 'AI_Architect_Requirements.docx', contentType: 'reference' },
              ],
            },
            {
              id: 'b2',
              createdDateTime: '2026-09-23T22:17:00Z',
              messageType: 'message',
              from: { application: { id: 'app1', displayName: 'Remote Control Probe' } },
              body: { contentType: 'text', content: 'TOKEN-DEMO-41' },
            },
          ],
        }),
      };
    if (scenario === 'channel')
      return {
        input: { teamId: 't-eng', channelId: 'c-general' },
        result: json({ value: t.channelMessages['c-general'] }),
      };
    return { input: { chatId: 'chat-atlas' }, result: json({ value: t.messages['chat-atlas'] }) };
  }
  if (view === 'event' && scenario === 'new') {
    // What the compose tool hands the form: a prefilled new event.
    return {
      input: {},
      result: json({
        reviewRequired: true,
        proposed: {
          subject: 'Planning review',
          start: { dateTime: '2026-11-06T15:00:00', timeZone: 'UTC' },
          end: { dateTime: '2026-11-06T15:30:00', timeZone: 'UTC' },
          location: { displayName: 'Room 4' },
          attendees: [
            { type: 'required', emailAddress: { address: 'ada@example.test', name: 'Ada' } },
          ],
          body: { contentType: 'text', content: 'Walk through the CSV export' },
        },
      }),
    };
  }
  if (view === 'event') {
    const cal = buildCalendar();
    const id = scenario === 'organizer' ? 'e-design' : 'e-planning';
    return { input: { eventId: id }, result: json(cal.detail[id]) };
  }
  if (view === 'message') {
    const id = scenario === 'html' ? 'm-billing' : scenario === 'attachment' ? 'm-q3-1' : 'm-q3-3';
    return { input: { messageId: id }, result: json(fixtures.messages[id]) };
  }
  const draft =
    { html: fixtures.htmlDraft, reply: fixtures.replyDraft, new: fixtures.emptyDraft }[scenario] ??
    fixtures.agentDraft;
  return { input: { body: { subject: draft.subject } }, result: json(draft) };
}

function mount(column: HTMLElement, theme: Theme): void {
  const frame = document.createElement('div');
  frame.className = 'frame';
  frame.style.width = `${width}px`;
  frame.dataset.theme = theme;
  const title = document.createElement('div');
  title.className = 'label';
  title.textContent = `${view}${scenario ? ` / ${scenario}` : ''} · ${theme}`;
  const iframe = document.createElement('iframe');
  iframe.title = `${view} view (${theme})`;
  // The measure script needs to read the view's DOM, so it loads the page without the sandbox.
  if (!noSandbox) iframe.setAttribute('sandbox', 'allow-scripts');
  // A real host starts the frame small and grows it to the size the view reports; startheight reproduces that,
  // and shrinkto makes the host take the frame back to a smaller size after it has granted the view's size.
  iframe.style.height = `${Number(params.get('startheight')) || 120}px`;
  const approvals = document.createElement('div');
  approvals.className = 'approvals';
  const log = document.createElement('ul');
  log.className = 'log';
  frame.append(title, iframe, approvals, log);
  column.appendChild(frame);

  const note = (text: string): void => {
    const li = document.createElement('li');
    li.textContent = text;
    log.prepend(li);
  };

  const context = (): Record<string, unknown> => ({
    theme,
    platform: 'web',
    locale: navigator.language,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    displayMode: 'inline',
    availableDisplayModes: ['inline'],
    containerDimensions: { width, maxHeight: 4000 },
    styles: {
      variables: noVars
        ? {}
        : blackHost
          ? {
              ...HOST_VARIABLES[theme],
              '--color-background-secondary': '0 0 0',
              '--color-background-primary': '0 0 0',
            }
          : HOST_VARIABLES[theme],
    },
  });

  const bridge = new AppBridge(
    null,
    { name: 'preview-host', version: '1.0.0' },
    { openLinks: {}, serverTools: {}, serverResources: {}, message: { text: {} }, logging: {} },
    { hostContext: context() as never }
  );
  bridge.onsizechange = ({ height }) => {
    if (typeof height === 'number') {
      iframe.style.height = `${Math.ceil(height)}px`;
      const shrink = Number(params.get('shrinkto'));
      if (shrink && Math.ceil(height) > shrink + 2)
        setTimeout(() => (iframe.style.height = `${shrink}px`), 800);
      // The frame-height trace the measure script reads (npm run measure:views -- --frame).
      ((window as unknown as { __sizes?: Array<[number, number]> }).__sizes ??= []).push([
        Math.round(performance.now()),
        Math.ceil(height),
      ]);
    }
  };
  bridge.onopenlink = async ({ url }) => {
    note(`open link: ${url}`);
    return {};
  };
  bridge.onmessage = async ({ content }) => {
    note(`message to chat: ${JSON.stringify(content)}`);
    return {};
  };
  bridge.oncalltool = ({ name, arguments: args }) =>
    new Promise((resolve, reject) => {
      const card = document.createElement('div');
      card.className = 'approval';
      card.setAttribute('role', 'alertdialog');
      const heading = document.createElement('strong');
      heading.textContent = `Allow this view to run ${name}?`;
      const pre = document.createElement('pre');
      pre.textContent = JSON.stringify(args ?? {}, null, 2);
      const yes = document.createElement('button');
      yes.textContent = 'Approve';
      yes.dataset.testid = 'approve';
      const no = document.createElement('button');
      no.textContent = 'Reject';
      const done = (): void => card.remove();
      yes.onclick = () => {
        done();
        note(`approved: ${name}`);
        resolve(mockTool(name, (args ?? {}) as Record<string, unknown>, fixtures) as never);
      };
      no.onclick = () => {
        done();
        note(`rejected: ${name}`);
        reject(new Error('Rejected by the user'));
      };
      card.append(heading, pre, yes, no);
      approvals.appendChild(card);
      if ((document.getElementById('auto') as HTMLInputElement | null)?.checked) yes.click();
    });

  const scene = scenarioFor();
  bridge.oninitialized = () => {
    void bridge.sendToolInput({ arguments: scene.input });
    void bridge.sendToolResult(scene.result as never);
  };
  // Connect before navigating: the window proxy survives navigation, so the bridge is already
  // listening when the view posts its first message.
  const win = iframe.contentWindow;
  if (win)
    bridge
      .connect(new PostMessageTransport(win, win))
      .catch((e: Error) => note(`host bridge error: ${e.message}`));
  iframe.src = `/view/${view}.html`;
}

const column = document.getElementById('columns') as HTMLElement;
const themes: Theme[] =
  themeParam === 'both' ? ['light', 'dark'] : [themeParam === 'dark' ? 'dark' : 'light'];
for (const theme of themes) mount(column, theme);
if (params.get('auto') === '1')
  (document.getElementById('auto') as HTMLInputElement).checked = true;

/** Reference capture to eyeball against, cropped to the region of the view being compared. */
const REFERENCE: Record<string, { file: string; x: number; y: number; w: number }> = {
  inbox: { file: '01-inbox-list.jpg', x: 50, y: 130, w: 520 },
  message: { file: '05-thread-list-and-latest.jpg', x: 575, y: 135, w: 850 },
  'message/html': { file: '02-reading-pane.jpg', x: 575, y: 135, w: 850 },
  draft: { file: '04-inline-reply.jpg', x: 575, y: 135, w: 850 },
  'draft/reply': { file: '04-inline-reply.jpg', x: 575, y: 135, w: 850 },
  'draft/new': { file: '03-new-mail-compose.jpg', x: 575, y: 130, w: 850 },
};
if (compare === 'outlook') {
  const ref = REFERENCE[`${view}/${scenario}`] ?? REFERENCE[view];
  const box = document.createElement('div');
  box.className = 'frame';
  const label = document.createElement('div');
  label.className = 'label';
  label.textContent = `reference capture (${ref.file}) at natural size`;
  const crop = document.createElement('div');
  crop.style.cssText = `width:${ref.w}px;height:700px;overflow:hidden;background:url(/reference/${ref.file}) -${ref.x}px -${ref.y}px no-repeat`;
  box.append(label, crop);
  column.appendChild(box);
}
