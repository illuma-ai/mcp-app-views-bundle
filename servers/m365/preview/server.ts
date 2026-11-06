/**
 * Local design-review server: `npm run preview:views`, then open http://127.0.0.1:6280.
 *
 * It serves the real view documents (the same HTML the server returns for the ui:// resources) and
 * a small MCP Apps host (preview/host.ts, built with esbuild at start) that feeds them fixture
 * data, in light and dark. Binds to loopback only. No mail service is contacted.
 */
import { readFileSync } from 'fs';
import { createServer } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { AppViewId, buildViewHtml } from '../src/views/app-views.js';
import type { MailActions } from '../src/views/mail/types.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = '127.0.0.1';
const PORT = Number(process.env.PREVIEW_PORT ?? 6280);
/** Where the reference captures for &compare=outlook are read from. */
const REFERENCE_DIR =
  process.env.PREVIEW_REFERENCE_DIR ??
  path.join(here, '..', '..', 'm365-setup', 'reference', 'outlook');

/** The roles the views may call, resolved from endpoints.json exactly as the server does. */
function actionsFromEndpoints(): MailActions {
  const endpoints = JSON.parse(
    readFileSync(path.join(here, '..', 'src', 'endpoints.json'), 'utf8')
  ) as Array<{ toolName: string; appViewAction?: string }>;
  const actions: Record<string, string> = {};
  for (const e of endpoints) if (e.appViewAction) actions[e.appViewAction] = e.toolName;
  return actions as MailActions;
}

const bundle = await build({
  entryPoints: [path.join(here, 'host.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  jsx: 'automatic',
  target: 'es2020',
  platform: 'browser',
  logLevel: 'warning',
});
const hostJs = bundle.outputFiles[0].text;

const SCENES: Array<{ title: string; query: string }> = [
  { title: 'Inbox list', query: 'view=inbox' },
  { title: 'Message / conversation', query: 'view=message' },
  { title: 'Message with hostile HTML body', query: 'view=message&scenario=html' },
  { title: 'Draft review (agent-created, text)', query: 'view=draft' },
  { title: 'Draft review (HTML body)', query: 'view=draft&scenario=html' },
  { title: 'Reply draft (history collapsed)', query: 'view=draft&scenario=reply' },
  { title: 'New mail', query: 'view=draft&scenario=new' },
  { title: 'Calendar week', query: 'view=calendar' },
  { title: 'Calendar agenda', query: 'view=calendar&scenario=agenda' },
  { title: 'Event (invitation)', query: 'view=event' },
  { title: 'Files explorer', query: 'view=files' },
  { title: 'File detail', query: 'view=file' },
  { title: 'Contacts', query: 'view=contacts' },
  { title: 'Contact card', query: 'view=contact' },
  { title: 'To Do', query: 'view=tasks' },
  { title: 'To Do (empty list)', query: 'view=tasks&scenario=empty' },
  { title: 'Contacts (empty)', query: 'view=contacts&scenario=empty' },
  { title: 'Teams chat list', query: 'view=chats' },
  { title: 'Teams channels', query: 'view=chats&scenario=channels' },
  { title: 'Teams conversation', query: 'view=conversation' },
  { title: 'Teams channel conversation', query: 'view=conversation&scenario=channel' },
  { title: 'Event (organizer)', query: 'view=event&scenario=organizer' },
  {
    title: 'Inbox, no host style variables (fallback tokens)',
    query: 'view=inbox&vars=none&theme=light',
  },
];

const page = (body: string, extra = ''): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>View preview</title>` +
  `<style>body{margin:0;padding:16px;font:14px/1.4 "Segoe UI",system-ui,sans-serif;background:#e9e9ec;color:#222}` +
  `#columns{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}.frame{background:#fff;border-radius:8px}.frame[data-theme=dark]{background:#0d0d0d}` +
  `.label{font:12px monospace;color:#555;padding:4px 0}.frame[data-theme=dark] .label{color:#aaa}iframe{display:block;width:100%;border:0}` +
  `.approval{margin:8px 0;padding:8px;border:2px solid #c2410c;background:#fff7ed;color:#222;border-radius:6px}.approval pre{max-height:160px;overflow:auto;margin:4px 0;font-size:12px}` +
  `.log{font:12px monospace;color:#555;list-style:none;margin:4px 0;padding:0}a{color:#2563eb}li{margin:2px 0}${extra}</style></head><body>${body}</body></html>`;

const indexHtml = page(
  `<h1>Mail views preview</h1><p>Each link shows the view in light and dark inside a minimal MCP Apps host. Tool calls from a view wait for Approve, like the real host. Add <code>&amp;theme=light</code> or <code>dark</code> to show one, <code>&amp;width=900</code> to resize.</p><ul>` +
    SCENES.map((s) => `<li><a href="/host.html?${s.query}">${s.title}</a></li>`).join('') +
    '</ul>'
);

const hostHtml = page(
  `<label><input type="checkbox" id="auto"> auto-approve view tool calls</label><div id="columns"></div><script>${hostJs.replace(/<\/script/gi, '<\\/script')}</script>`
);

const actions = actionsFromEndpoints();

createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://${HOST}`);
  const send = (type: string, body: string, status = 200): void => {
    res.writeHead(status, {
      'content-type': `${type}; charset=utf-8`,
      'cache-control': 'no-store',
    });
    res.end(body);
  };
  const viewMatch =
    /^\/view\/(inbox|message|draft|calendar|event|chats|conversation|files|file|contacts|contact|tasks)\.html$/.exec(
      url.pathname
    );
  if (viewMatch) return send('text/html', buildViewHtml(viewMatch[1] as AppViewId, actions));
  const ref = /^\/reference\/([\w.-]+\.jpg)$/.exec(url.pathname);
  if (ref) {
    // Reference captures live outside the repository (they are real mail); serve them if present.
    try {
      const data = readFileSync(path.join(REFERENCE_DIR, ref[1]));
      res.writeHead(200, { 'content-type': 'image/jpeg', 'cache-control': 'no-store' });
      return void res.end(data);
    } catch {
      return send('text/plain', 'Reference capture not found', 404);
    }
  }
  if (url.pathname === '/host.html') return send('text/html', hostHtml);
  if (url.pathname === '/') return send('text/html', indexHtml);
  send('text/plain', 'Not found', 404);
}).listen(PORT, HOST, () => {
  console.log(`View preview: http://${HOST}:${PORT}`);
});
