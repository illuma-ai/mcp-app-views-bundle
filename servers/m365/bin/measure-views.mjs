#!/usr/bin/env node
/**
 * Parity gate: renders the views in the local preview with the system Chrome (no browser download,
 * no extra dependency: it speaks the DevTools protocol over the global WebSocket) and prints the
 * computed metrics the reference spec is built from, next to the spec values.
 *
 *   npm run measure:views                 metrics for light theme at 640px
 *   npm run measure:views -- --shots DIR  also save 640px light+dark screenshots to DIR
 *
 *   npm run measure:views -- --responsive [--widths 360,640,900] [--themes light,dark] [--shots DIR]
 *     every view at each width: screenshots and a non-zero exit when a view scrolls sideways;
 *     exit code 3 means no Chrome was found (nothing was checked)
 *
 *   npm run measure:views -- --frame
 *     list -> detail -> back in three views: the frame height the view reports never drops below
 *     its height before the click during the transition and never exceeds the 722px cap
 *
 *   npm run measure:views -- --contrast
 *     every view and state in light and dark: text under WCAG AA (4.5:1, 3:1 large) and dark
 *     surfaces not lighter than #141414 are listed and fail the run
 *
 * Set CHROME_PATH to override the Chrome location. Exit code is 0 even on differences; the table
 * is the review artifact.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MATRIX, SPEC, TOLERANCE, failures, renderMatrix } from './parity-spec.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Ports can be moved so two runs (the gate runs two) never share a preview or a debug port.
const PREVIEW_PORT = Number(process.env.MEASURE_PREVIEW_PORT ?? 6291);
const DEBUG_PORT = Number(process.env.MEASURE_DEBUG_PORT ?? 9341);
const chromePath =
  process.env.CHROME_PATH ??
  [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    '/usr/bin/google-chrome',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ].find((p) => existsSync(p));

const shotsIndex = process.argv.indexOf('--shots');
const shotsDir = shotsIndex > 0 ? process.argv[shotsIndex + 1] : null;
if (
  !chromePath &&
  ['--responsive', '--assert', '--matrix', '--contrast', '--frame'].some((flag) =>
    process.argv.includes(flag)
  )
) {
  console.log('SKIP: Chrome not found; set CHROME_PATH');
  process.exit(3);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return res;
    } catch {
      /* not up yet */
    }
    await sleep(250);
  }
  throw new Error(`timed out waiting for ${url}`);
}

/** Minimal DevTools protocol client over the global WebSocket. */
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  return { send, close: () => ws.close() };
}

/** Runs in the preview page: reads computed metrics from the (unsandboxed) view iframe. */
const PAGE_HELPERS = `
(() => {
  const P = { fontSize: 'fs', fontWeight: 'fw', lineHeight: 'lh', color: 'c', backgroundColor: 'bg', borderRadius: 'r' };
  const hex = (v) => v.replace(/rgb\\((\\d+), (\\d+), (\\d+)\\)/g, (m, a, b, c) => '#' + [a, b, c].map((n) => (+n).toString(16).padStart(2, '0')).join(''));
  window.__doc = () => document.querySelector('iframe').contentDocument;
  window.__st = (el, rel) => {
    if (!el) return null;
    const s = el.ownerDocument.defaultView.getComputedStyle(el), r = el.getBoundingClientRect();
    const o = { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    if (rel) o.left = Math.round((r.left - rel.getBoundingClientRect().left) * 10) / 10;
    for (const p in P) { const v = s[p]; if (v && v !== 'rgba(0, 0, 0, 0)') o[P[p]] = hex(v); }
    o.font = s.fontFamily.split(',')[0].replace(/"/g, '');
    return o;
  };
  window.__text = (root, re) => [...root.querySelectorAll('span,div,button')].find((e) => e.children.length === 0 && re.test(e.textContent.trim()));
})();`;

/** Every view and state the responsive and contrast gates render: [name, query, optional action]. */
const VIEW_STATES = [
  ['inbox', 'view=inbox'],
  [
    'thread',
    'view=inbox',
    "for (let i = 0; i < 80 && !d.querySelector('[role=option]'); i++) await new Promise((r) => setTimeout(r, 100)); const o = d.querySelector('[role=option]'); if (!o) throw new Error('no option: ' + d.body.innerText.slice(0, 300)); o.click(); await new Promise((r) => setTimeout(r, 2500));",
  ],
  ['reply-composer', 'view=draft&scenario=reply'],
  ['new-mail', 'view=draft&scenario=new'],
  ['calendar-week', 'view=calendar'],
  ['calendar-agenda', 'view=calendar&scenario=agenda'],
  ['event', 'view=event'],
  ['files', 'view=files'],
  ['file', 'view=file'],
  ['contacts', 'view=contacts'],
  ['contact', 'view=contact'],
  ['tasks', 'view=tasks'],
  ['tasks-empty', 'view=tasks&scenario=empty'],
  ['teams-chats', 'view=chats'],
  ['teams-conversation', 'view=conversation'],
  ['teams-channel', 'view=conversation&scenario=channel'],
  [
    'calendar-month',
    'view=calendar',
    "[...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Month')?.click(); await new Promise((r) => setTimeout(r, 1500));",
  ],
  ['event-new', 'view=event&scenario=new'],
  ['contacts-empty', 'view=contacts&scenario=empty'],
  ['teams-channel-empty', 'view=conversation&scenario=channel-empty'],
  ['teams-bot', 'view=conversation&scenario=bot'],
  ['message-html', 'view=message&scenario=html'],
  ['message-attachment', 'view=message&scenario=attachment'],
  ['draft-html', 'view=draft&scenario=html'],
];

/**
 * Runs in the preview page. For every visible text (text nodes, input values, placeholders) works out
 * the colour it is drawn in and the background it is drawn on (every translucent layer composited from
 * the outside in), and returns the ones under WCAG AA: 4.5:1, or 3:1 for large text. In dark mode it
 * also returns every painted surface at or below the Fluent dark palette's floor (#141414):
 * dark views sit on dark greys, never on black.
 */
const CONTRAST_JS = `
  const d = __doc(), w = d.defaultView;
  const dark = new URLSearchParams(location.search).get('theme') === 'dark';
  const num = (v) => (v.match(/-?[0-9.]+/g) || []).map(Number);
  const parse = (v) => { const n = num(v); if (v.startsWith('color(')) return [n[0]*255, n[1]*255, n[2]*255, n[3] ?? 1]; return [n[0], n[1], n[2], n[3] ?? 1]; };
  const over = (top, under) => { const a = top[3]; return [0,1,2].map((i) => top[i]*a + under[i]*(1-a)).concat([1]); };
  const chan = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126*chan(c[0]) + 0.7152*chan(c[1]) + 0.0722*chan(c[2]);
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const hex = (c) => '#' + c.slice(0, 3).map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  const DEEPEST = lum([20, 20, 20]);
  const hostBase = dark ? [13, 13, 13, 1] : [255, 255, 255, 1];
  const bgOf = (el) => {
    const chain = []; for (let e = el; e; e = e.parentElement) chain.unshift(e);
    let acc = hostBase;
    for (const e of chain) { const bg = parse(w.getComputedStyle(e).backgroundColor); if (bg[3] > 0) acc = over(bg, acc); }
    return acc;
  };
  const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(w.getComputedStyle(e).opacity); return o; };
  const visible = (el) => {
    const s = w.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && el.getClientRects().length > 0;
  };
  const out = [], seen = new Set();
  const check = (el, text, fgRaw, large) => {
    if (el.closest('script,style,[disabled],[aria-disabled=true]') || !visible(el)) return;
    const bg = bgOf(el), o = opacityOf(el);
    const fg = over([fgRaw[0], fgRaw[1], fgRaw[2], fgRaw[3] * o], bg);
    const r = ratio(fg, bg), need = large ? 3 : 4.5;
    if (r + 0.005 >= need) return;
    const key = text + hex(fg) + hex(bg);
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ kind: 'contrast', text: text.slice(0, 50), fg: hex(fg), bg: hex(bg), ratio: Math.round(r * 100) / 100, need });
  };
  const walker = d.createTreeWalker(d.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    if (!text || !n.parentElement) continue;
    const s = w.getComputedStyle(n.parentElement);
    const size = parseFloat(s.fontSize), large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    check(n.parentElement, text, parse(s.color), large);
  }
  for (const el of d.querySelectorAll('input,textarea')) {
    if (el.type === 'checkbox' || el.type === 'radio' || el.type === 'hidden') continue;
    const s = w.getComputedStyle(el), size = parseFloat(s.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(s.fontWeight) >= 700);
    if (el.value) check(el, 'value: ' + el.value, parse(s.color), large);
    else if (el.placeholder) check(el, 'placeholder: ' + el.placeholder, parse(w.getComputedStyle(el, '::placeholder').color), large);
  }
  if (dark) {
    for (const el of d.querySelectorAll('body, body *')) {
      if (!visible(el)) continue;
      const s = w.getComputedStyle(el), own = parse(s.backgroundColor);
      if (own[3] < 0.5) continue;
      const bg = bgOf(el);
      // #141414 is the floor for scroll gutters only: anything bigger than a few px must be lighter.
      const box = el.getBoundingClientRect();
      const big = box.width > 8 && box.height > 8 && box.width * box.height > 400;
      if (lum(bg) < DEEPEST - 1e-6 || (big && lum(bg) <= DEEPEST + 1e-6)) {
        const key = 'bg' + hex(bg) + el.tagName + (el.getAttribute('aria-label') || '');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ kind: 'dark-surface', text: el.tagName.toLowerCase() + (el.getAttribute('aria-label') ? '[' + el.getAttribute('aria-label') + ']' : ''), fg: '', bg: hex(bg), ratio: 0, need: 0 });
      }
    }
  }
  return out;
`;

const SCENES = {
  compose: `
    const d = __doc();
    const card = d.querySelector('[aria-label=Draft]');
    const bar = card.children[0], toRow = card.children[1], ccRow = card.children[2];
    const toBtn = toRow.querySelector('button'), ccBtn = ccRow.querySelector('button');
    const subject = card.querySelector('input[aria-label=Subject]');
    const r = (e) => e.getBoundingClientRect();
    const field = toRow.querySelector('input').parentElement;
    const rgb = getComputedStyle(field).borderBottomColor;
    return {
      composeBar: { h: Math.round(r(bar).height) },
      composeBarGap: { gap: Math.round(r(toBtn).top - r(bar).bottom) },
      composeToBtn: { w: Math.round(r(toBtn).width), h: Math.round(r(toBtn).height) },
      composePitch: { step: Math.round(r(ccBtn).top - r(toBtn).top) },
      composePad: { left: Math.round(r(toBtn).left - r(card).left) },
      composeSubject: { h: Math.round(r(subject.parentElement).height) },
      composeSubjectGap: { gap: Math.round(r(subject.parentElement).top - r(ccBtn).bottom) },
      composeUnderline: { c: '#' + (rgb.match(/[0-9]+/g) || []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') },
    };`,
  eventForm: `
    const d = __doc();
    const form = d.querySelector('[aria-label="Edit event"]');
    const size = (e) => { const b = e && e.getBoundingClientRect(); return b ? b.width + 'x' + b.height : 'n/a'; };
    const pick = (label) => form.querySelector('[aria-label="' + label + '"]');
    return {
      'Title input': size(pick('Title')),
      'Start / End inputs': size(pick('Start')),
      'Location input': size(pick('Location')),
      'Attendees row': size(form.querySelector('input[aria-label=Invite]')),
      'Description box': size(pick('Description')),
      'Save button': size([...form.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Save')),
    };`,
  todo: `
    const d = __doc();
    const input = d.querySelector('input[aria-label="Add a task"]');
    let box = input;
    while (box && !(getComputedStyle(box).borderTopWidth === '1px' && parseFloat(getComputedStyle(box).borderTopLeftRadius) > 0)) box = box.parentElement;
    const top = box.children[0], foot = box.children[1];
    const addBtn = [...foot.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Add');
    const table = d.querySelector('[role=list][aria-label=Tasks]');
    return {
      todoAddTop: __st(top),
      todoAddFoot: { h: Math.round(foot.getBoundingClientRect().height) },
      todoAddBtn: __st(addBtn),
      todoTableHead: __st(table.children[0]),
      todoTableRow: __st(table.children[1]),
    };`,
  files: `
    const d = __doc();
    const list = d.querySelector('[role=list][aria-label=Files]');
    const head = list.children[0];
    return {
      odCreate: __st([...d.querySelectorAll('button')].find((b) => /Create or upload/.test(b.textContent))),
      odHead: Object.assign(__st(head), { fs: getComputedStyle(head).fontSize, fw: getComputedStyle(head).fontWeight }),
      odRow: __st(list.children[1]),
    };`,
  contacts: `
    const d = __doc();
    const bar = d.querySelector('[role=toolbar][aria-label="Contact commands"]');
    return {
      contactsBar: __st(bar),
      contactsNewBtn: __st([...bar.querySelectorAll('button')].find((b) => /New contact/.test(b.textContent))),
    };`,
  contactsEmpty: `
    const d = __doc();
    const btn = [...d.querySelectorAll('[role=status] button')].find((b) => /New contact/.test(b.textContent));
    return { contactsEmptyBtn: __st(btn) };`,
  teamsChats: `
    const d = __doc();
    const rows = [...d.querySelectorAll('button[aria-label]')].filter((b) => b.parentElement.getAttribute('role') !== 'toolbar' && b.className && b.children.length === 3);
    const unread = rows.find((r) => r.getAttribute('aria-label').startsWith('Unread'));
    const read = rows.find((r) => !r.getAttribute('aria-label').startsWith('Unread'));
    const pill = [...d.querySelectorAll('[role=group] button')].find((b) => b.textContent === 'Unread');
    return {
      teamsTitle: __st(d.querySelector('[role=heading][aria-level="1"]')),
      teamsPill: __st(pill),
      teamsUnreadName: __st(unread && unread.children[1].children[0]),
      teamsReadName: __st(read && read.children[1].children[0]),
    };`,
  teamsRowCompact: `
    const d = __doc();
    const row = [...d.querySelectorAll('button[aria-label]')].find((b) => b.children.length === 3 && b.getAttribute('aria-label') !== 'Send');
    return { teamsRowCompact: __st(row) };`,
  teamsAvatars: `
    const d = __doc();
    const hex = (v) => '#' + (v.match(/[0-9]+/g) || []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
    const row = (re) => [...d.querySelectorAll('button[aria-label]')].find((b) => re.test(b.getAttribute('aria-label')));
    const shape = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return { w: Math.round(r.width), h: Math.round(r.height), r: cs.borderTopLeftRadius, bg: hex(cs.backgroundColor) }; };
    const person = row(/Ada Lovelace/).querySelector('.fui-Avatar');
    const bot = row(/PM Agent/).querySelector('[data-avatar=bot]');
    const meeting = row(/Meeting with/).querySelector('[data-avatar=meeting]');
    const group = row(/Atlas Eng/).querySelector('[data-avatar=group]');
    const text = row(/Ada Lovelace/).children[1];
    const gap = Math.round(text.getBoundingClientRect().left - person.getBoundingClientRect().right);
    return {
      teamsAvatarPerson: { w: shape(person).w, h: shape(person).h, r: shape(person).r },
      teamsAvatarBot: shape(bot),
      teamsAvatarMeeting: shape(meeting),
      teamsAvatarGroup: { w: shape(group).w, h: shape(group).h, r: shape(group).r },
      teamsAvatarGap: { gap },
      teamsAvatarBadge: { presence: d.querySelector('.fui-PresenceBadge') ? 'present' : 'none' },
    };`,
  teamsConv: `
    const d = __doc();
    const log = d.querySelector('[role=log]');
    const head = log.previousElementSibling;
    const title = [...head.querySelectorAll('span')].find((e) => e.textContent === 'Atlas Eng' && e.children.length === 0 && getComputedStyle(e).fontWeight === '700');
    const other = log.querySelector('div > div > div');
    const bubble = [...log.querySelectorAll('div')].find((e) => getComputedStyle(e).borderRadius === '8px');
    const area = d.querySelector('textarea');
    let box = area;
    while (box && getComputedStyle(box).borderTopWidth !== '1px') box = box.parentElement;
    const cs = getComputedStyle(area);
    return {
      teamsConvTitle: __st(title),
      teamsMeta: __st([...log.querySelectorAll('div')].find((e) => e.children.length === 1 && e.firstElementChild.tagName === 'SPAN' && /[0-9]+[/][0-9]+/.test(e.textContent) && e.textContent.length < 40)),
      teamsBody: __st(bubble),
      teamsBubble: __st(bubble),
      teamsComposer: __st(area),
      teamsComposerBox: __st(box),
      teamsComposerPad: { pad: cs.paddingTop + ' ' + cs.paddingRight + ' ' + cs.paddingBottom + ' ' + cs.paddingLeft },
    };`,
  calendar: `
    const d = __doc();
    const heads = [...d.querySelectorAll('[role=columnheader]')];
    const rgb = (c) => '#' + (c.match(/[0-9]+/g) || []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
    const todayHead = heads.find((h) => getComputedStyle(h).borderTopColor !== 'rgba(0, 0, 0, 0)' && getComputedStyle(h).borderTopWidth === '3px');
    const dashed = [...d.querySelectorAll('[role=grid] div')].find((e) => getComputedStyle(e).borderTopStyle === 'dashed' && getComputedStyle(e).position === 'absolute');
    const dashedTop = parseFloat(dashed && dashed.style.top);
    const solidTops = [...d.querySelectorAll('[role=grid] div')].filter((e) => getComputedStyle(e).position === 'absolute' && getComputedStyle(e).borderTopStyle === 'solid' && e.style.top && !e.hasAttribute('data-now')).map((e) => parseFloat(e.style.top));
    const nextSolid = Math.min(...solidTops.filter((t) => t > dashedTop));
    const bar = todayHead && getComputedStyle(todayHead);
    return {
      calTitle: __st(d.querySelector('[role=heading]')),
      calNewEvent: __st([...d.querySelectorAll('button')].find((b) => /New event/.test(b.textContent))),
      calDayHead: __st(heads[0]),
      calDayNum: __st(todayHead && todayHead.firstElementChild),
      calWeekday: __st(todayHead && todayHead.children[1]),
      calTodayBar: { bt: bar && parseFloat(bar.borderTopWidth), btc: bar && rgb(bar.borderTopColor) },
      calHalf: { step: nextSolid - dashedTop },
      ...(() => {
        const plus = todayHead && todayHead.querySelector('button[aria-label="New event"]');
        const pr = plus && plus.getBoundingClientRect();
        const hr = todayHead && todayHead.getBoundingClientRect();
        const line = d.querySelector('[data-now=line]');
        const dot = d.querySelector('[data-now=dot]');
        const across = d.querySelector('[data-now=across]');
        const ls = line && getComputedStyle(line);
        const as = across && getComputedStyle(across);
        const ds = dot && getComputedStyle(dot);
        return {
          calNewHere: { w: pr && Math.round(pr.width), h: pr && Math.round(pr.height), right: pr && Math.round(hr.right - pr.right), label: plus && plus.getAttribute('aria-label') },
          calNowLine: { bt: ls && parseFloat(ls.borderTopWidth), bs: ls && ls.borderTopStyle, btc: ls && rgb(ls.borderTopColor) },
          calNowDot: { w: dot && Math.round(dot.getBoundingClientRect().width), h: dot && Math.round(dot.getBoundingClientRect().height), bg: ds && rgb(ds.backgroundColor), r: ds && ds.borderTopLeftRadius },
          calNowAcross: { bt: as && parseFloat(as.borderTopWidth), bs: as && as.borderTopStyle },
        };
      })(),
    };`,
  calendarToolbar: `
    const d = __doc();
    const bar = d.querySelector('[role=toolbar][aria-label="Calendar commands"]');
    const tops = new Set([...bar.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().top)));
    const more = bar.querySelector('button[aria-label="More commands"]');
    const edge = bar.getBoundingClientRect().right;
    const clipped = [...bar.querySelectorAll('button')].filter((b) => b.getBoundingClientRect().right > edge + 0.5).length;
    return { calToolbar: { rows: tops.size, overflow: more ? 'More commands' : 'none', clipped } };`,
  calendarScroll: `
    const d = __doc();
    await new Promise((r) => setTimeout(r, 1200));
    const sc = d.querySelector('[data-scroll=grid]');
    const line = d.querySelector('[data-now=line]');
    const r = sc.getBoundingClientRect();
    const l = line ? line.getBoundingClientRect() : null;
    return { calScroll: { overflowY: getComputedStyle(sc).overflowY, atNow: l && l.top >= r.top && l.bottom <= r.bottom ? 'yes' : 'no' } };`,
  calendarMonth: `
    const d = __doc();
    [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Month').click();
    await new Promise((r) => setTimeout(r, 1500));
    const grid = d.querySelector('[role=grid][aria-label=Month]');
    const heads = [...grid.querySelectorAll('[role=columnheader]')];
    const cells = [...grid.querySelectorAll('[role=gridcell]')];
    const todayNum = cells.map((c) => c.firstElementChild).find((e) => getComputedStyle(e).borderRadius === '50%');
    return {
      calMonthHead: __st(heads[0]),
      calMonthDay0: { label: heads[0].textContent.trim() },
      calMonthCell: __st(cells[0]),
      calMonthFirst: { label: cells[0].firstElementChild.textContent.trim().replace(/^[A-Za-z]{3}/, 'Mon') },
      calToday: __st(todayNum),
    };`,
  calendarWorkWeek: `
    const d = __doc();
    [...d.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Work week').click();
    await new Promise((r) => setTimeout(r, 1500));
    const heads = [...d.querySelectorAll('[role=columnheader]')];
    return { calWorkWeekCols: { n: heads.length }, calWorkWeekHead: __st(heads[0]) };`,
  teamsBot: `
    const d = __doc();
    const tabs = [...d.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim().replace(/^([A-Za-z]+?)\\1$/, '$1'));
    const card = d.querySelector('[role=group][aria-label*=docx]');
    return { teamsChatTabs: { label: tabs.join(' ') }, teamsFileCard: __st(card) };`,
  teamsEmpty: `
    const d = __doc();
    const w = [...d.querySelectorAll('span')].find((e) => /Welcome to your new team/.test(e.textContent) && e.children.length === 0);
    return { teamsEmptyChannel: { title: w.textContent.trim(), sub: w.nextElementSibling.textContent.trim() } };`,
  teamsChannel: `
    const d = __doc();
    const tabs = [...d.querySelectorAll('[role=tab]')].map((t) => t.textContent.trim().replace(/^([A-Za-z]+?)\\1$/, '$1'));
    const post = [...d.querySelectorAll('button')].find((b) => /Post in channel/.test(b.textContent));
    return {
      teamsChanTabs: { label: tabs.join(' ') },
      teamsChanPostBtn: Object.assign(__st(post), { label: post.textContent.trim() }),
    };`,
  inbox: `
    const d = __doc();
    const rows = [...d.querySelectorAll('[role=option]')];
    const plain = rows.find((r) => !/Attachment/.test(r.textContent) && r.getAttribute('aria-label').startsWith('Unread') === false);
    const chip = rows.find((r) => /Attachment/.test(r.textContent));
    const unread = rows.find((r) => r.getAttribute('aria-label').startsWith('Unread'));
    const out = {};
    out.rowPlain = __st(plain);
    out.rowChip = __st(chip);
    const lead = plain.querySelector('span:nth-child(2)');
    out.avatar = __st(plain.querySelector('.fui-Avatar'), plain);
    out.textColumn = __st(plain.children[2], plain);
    out.sender = __st(plain.children[2].children[0].children[0]);
    out.subject = __st(plain.children[2].children[1].children[0]);
    out.preview = __st(plain.children[2].children[2].children[0]);
    out.date = __st(plain.children[2].children[1].lastElementChild);
    out.unreadSubject = __st(unread.children[2].children[1].children[0]);
    out.unreadBar = unread && getComputedStyle(unread).boxShadow;
    const chev = rows.find((r) => r.querySelector('[aria-expanded]'));
    out.chevron = __st(chev && chev.querySelector('[aria-expanded]'), chev);
    out.group = __st(d.querySelector('li[role=presentation] button'));
    out.newMail = __st([...d.querySelectorAll('button')].find((b) => /New mail/.test(b.textContent)));
    out.iconButton = __st([...d.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'More commands'));
    out.body = { font: getComputedStyle(d.body).fontFamily.split(',')[0] };
    return out;`,
  selected: `
    const d = __doc();
    const row = d.querySelector('[role=option]');
    row.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    row.querySelector('input[type=checkbox]')?.click();
    await new Promise((r) => setTimeout(r, 300));
    return { selectedRow: __st(d.querySelector('[role=option][aria-selected=true]')) };`,
  thread: `
    const d = __doc();
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    d.querySelector('[role=option]').click();
    await wait(1500);
    const out = {};
    const card = d.querySelector('[role=article]');
    out.card = __st(card);
    out.cardAvatar = __st(card.querySelector('.fui-Avatar'));
    out.cardName = __st(card.querySelector('.fui-Persona__primaryText'));
    out.subjectBar = __st(d.querySelector('h1'));
    out.collapsed = __st([...d.querySelectorAll('button[aria-expanded=false]')].find((b) => /Expand message/.test(b.getAttribute('aria-label') || '')));
    out.replyButton = __st([...card.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Reply'));
    out.iconButton = __st(card.querySelector('button[aria-label="Forward"]'));
    return out;`,
  attachment: `
    const d = __doc();
    const find = () => [...d.querySelectorAll('div')].find((e) => Math.round(e.getBoundingClientRect().width) === 260 && /pptx/.test(e.textContent));
    for (let i = 0; i < 20 && !find(); i++) await new Promise((r) => setTimeout(r, 250));
    return { attachmentCard: __st(find()) };`,
};

function compare(all) {
  const lines = [];
  for (const [key, want] of Object.entries(SPEC)) {
    const got = all[key];
    if (!got) {
      lines.push(`${key.padEnd(16)} MISSING`);
      continue;
    }
    for (const [prop, expected] of Object.entries(want)) {
      const actual = got[prop];
      const ok =
        String(actual) === String(expected) ||
        (typeof expected === 'number' && Math.abs(Number(actual) - expected) <= TOLERANCE);
      lines.push(
        `${key.padEnd(16)} ${prop.padEnd(5)} spec ${String(expected).padEnd(9)} got ${String(actual).padEnd(9)} ${ok ? 'ok' : 'DIFF'}`
      );
    }
  }
  return lines;
}

async function main() {
  if (!chromePath) throw new Error('Chrome not found; set CHROME_PATH');
  const server = spawn(
    process.execPath,
    [path.join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs'), 'preview/server.ts'],
    {
      cwd: root,
      env: { ...process.env, PREVIEW_PORT: String(PREVIEW_PORT) },
      stdio: 'ignore',
    }
  );
  const profile = mkdtempSync(path.join(tmpdir(), 'view-measure-'));
  const chrome = spawn(
    chromePath,
    [
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${profile}`,
      '--headless=new',
      '--no-first-run',
      '--hide-scrollbars',
      '--window-size=1000,1500',
      'about:blank',
    ],
    { stdio: 'ignore' }
  );
  try {
    await waitFor(`http://127.0.0.1:${PREVIEW_PORT}/`);
    await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const tab = await (
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: 'PUT' })
    ).json();
    const cdp = await connect(tab.webSocketDebuggerUrl);
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 1000,
      height: 1500,
      deviceScaleFactor: 1,
      mobile: false,
    });

    const open = async (query, themeName, width = 640) => {
      await cdp.send('Page.navigate', {
        url: `http://127.0.0.1:${PREVIEW_PORT}/host.html?${query}&theme=${themeName}&nosandbox=1&auto=1&width=${width}`,
      });
      await sleep(2500);
      await cdp.send('Runtime.evaluate', { expression: PAGE_HELPERS });
    };
    const run = async (body) => {
      const r = await cdp.send('Runtime.evaluate', {
        expression: `(async () => { ${body} })()`,
        awaitPromise: true,
        returnByValue: true,
      });
      if (r.exceptionDetails)
        throw new Error(r.exceptionDetails.exception?.description ?? 'evaluate failed');
      return r.result.value;
    };
    const shot = async (name) => {
      if (!shotsDir) return;
      mkdirSync(shotsDir, { recursive: true });
      const { data } = await cdp.send('Page.captureScreenshot', {
        format: 'png',
        captureBeyondViewport: true,
      });
      writeFileSync(path.join(shotsDir, `${name}.png`), Buffer.from(data, 'base64'));
    };

    // Debug: open one scene and print what a snippet returns (npm run measure:views -- --eval QUERY JS).
    const evalAt = process.argv.indexOf('--eval');
    if (evalAt > 0) {
      await open(process.argv[evalAt + 1], process.argv.includes('--dark') ? 'dark' : 'light');
      await sleep(600);
      console.log(
        JSON.stringify(await run('const d = __doc(); ' + process.argv[evalAt + 2]), null, 1)
      );
      cdp.close();
      return;
    }

    if (process.argv.includes('--frame')) {
      // The frame the host sees while navigating: list -> detail -> back. The preview host records every
      // size the view reports; during a transition it must never drop below the height before the click
      // and never exceed the cap.
      const CAP = 722;
      const TRACE_JS = `return window.__sizes ? window.__sizes.slice() : [];`;
      const FLOWS = [
        [
          'teams chat list -> conversation -> back',
          'view=chats',
          `const row = [...d.querySelectorAll('button')].find((b) => /Atlas Eng/.test(b.getAttribute('aria-label') || b.textContent)); if (!row) throw new Error('no chat row'); row.click();`,
        ],
        [
          'inbox -> message -> back',
          'view=inbox',
          `for (let i = 0; i < 80 && !d.querySelector('[role=option]'); i++) await new Promise((r) => setTimeout(r, 100)); d.querySelector('[role=option]').click();`,
        ],
        [
          'contacts -> card -> back',
          'view=contacts',
          `const row = [...d.querySelectorAll('button,[role=option],li')].find((b) => /Ada|Grace|Bilal/.test(b.textContent)); if (!row) throw new Error('no contact row'); row.click();`,
        ],
      ];
      const problems = [];
      // The host starts the iframe small and grows it to what the view reports (it must not be taken as a
      // cap), and a host that later takes the frame back to a smaller size is followed.
      const SIZE_JS = `return { frame: document.querySelector('iframe').getBoundingClientRect().height, inner: __doc().documentElement.scrollHeight, sizes: window.__sizes ? window.__sizes.slice() : [] };`;
      await open('view=inbox&startheight=320', 'light', 640);
      await sleep(2500);
      const grown = await run(SIZE_JS);
      const wanted = grown.sizes.length ? grown.sizes[grown.sizes.length - 1][1] : 0;
      console.log(
        'host starts at 320px: reported ' +
          (grown.sizes.map((t) => t[1]).join(' > ') || '(nothing)') +
          ', frame now ' +
          Math.round(grown.frame) +
          'px'
      );
      if (!(grown.frame > 330))
        problems.push(
          'a host that starts at 320px never grew (the initial size was taken as the cap): frame ' +
            Math.round(grown.frame) +
            'px'
        );
      if (wanted < 600) problems.push('the view asked for only ' + wanted + 'px from a 320px host');
      await open('view=inbox&startheight=320&shrinkto=420', 'light', 640);
      await sleep(3500);
      const shrunk = await run(SIZE_JS);
      const last = shrunk.sizes.length ? shrunk.sizes[shrunk.sizes.length - 1][1] : 0;
      console.log(
        'host shrinks to 420px: reported ' +
          shrunk.sizes.map((t) => t[1]).join(' > ') +
          ', frame now ' +
          Math.round(shrunk.frame) +
          'px'
      );
      if (Math.abs(last - 420) > 4)
        problems.push(
          'the view did not follow a host that took the frame back to 420px (last reported ' +
            last +
            'px)'
        );
      for (const [name, query, click] of FLOWS) {
        await open(query, 'light', 640);
        await sleep(1500);
        const before = await run(TRACE_JS);
        const start = before.length ? before[before.length - 1][1] : 0;
        await run('const d = __doc(); ' + click);
        await sleep(2500);
        await run(
          "const d = __doc(); const b = d.querySelector('button[aria-label=Back]'); if (b) b.click();"
        );
        await sleep(2000);
        const trace = (await run(TRACE_JS)).slice(before.length);
        const heights = trace.map((t) => t[1]);
        const dropped = heights.some((h) => h < start);
        const over = heights.some((h) => h > CAP);
        console.log(
          name + ': before ' + start + 'px, reported ' + (heights.join(' > ') || '(no change)')
        );
        if (dropped) problems.push(name + ': the reported height dropped below ' + start + 'px');
        if (over) problems.push(name + ': the reported height exceeded ' + CAP + 'px');
      }
      // One scroll container only: the page itself never scrolls (no scrollbar beside the frame's own)
      // and no vertical scroller sits inside another.
      const SCROLLERS_JS = `
        const d = __doc(), w = d.defaultView;
        const label = (e) => e.tagName.toLowerCase() + (e.getAttribute('data-frame') ? '[frame]' : '') + (e.getAttribute('data-scroll') ? '[' + e.getAttribute('data-scroll') + ']' : '') + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : '');
        const scrolling = (e) => /(auto|scroll)/.test(w.getComputedStyle(e).overflowY) && e.scrollHeight > e.clientHeight + 1;
        const all = [...d.querySelectorAll('body *')].filter(scrolling);
        const page = [d.documentElement, d.body].some((e) => e.scrollHeight > e.clientHeight + 1 && w.getComputedStyle(e).overflowY !== 'hidden');
        // The root fits its frame exactly: the page never overflows, hidden or not.
        const root = { html: d.documentElement.scrollHeight - d.documentElement.clientHeight, body: d.body.scrollHeight - d.body.clientHeight };
        const nested = all.filter((a) => all.some((b) => a !== b && a.contains(b))).map(label);
        return { page, root, scrollers: all.map(label), nested };`;
      // Headers stay and the composer stays at the bottom while the body scrolls: squeeze the frame so the
      // body overflows, scroll it to the bottom, and read where the marked elements are.
      const STICKY_JS = `
        const d = __doc();
        const outer = d.querySelector('[data-frame=stable]');
        outer.style.maxHeight = '150px';
        outer.style.minHeight = '0px';
        await new Promise((r) => setTimeout(r, 400));
        const scrolls = outer.scrollHeight > outer.clientHeight + 1;
        outer.scrollTop = outer.scrollHeight;
        await new Promise((r) => setTimeout(r, 200));
        const box = outer.getBoundingClientRect();
        const tops = [...d.querySelectorAll('[data-sticky=top]')].map((e) => Math.round(e.getBoundingClientRect().top - box.top));
        const bottoms = [...d.querySelectorAll('[data-sticky=bottom]')].map((e) => Math.round(box.bottom - e.getBoundingClientRect().bottom));
        return { scrolls, tops, bottoms, scrolledTo: Math.round(outer.scrollTop) };`;
      for (const [name, query, action] of VIEW_STATES) {
        await open(query, 'light', 640);
        if (action) await run('const d = __doc(); ' + action);
        await sleep(600);
        const r = await run(SCROLLERS_JS);
        const st = await run(STICKY_JS);
        if (!st.tops.length)
          problems.push(name + ': no fixed header (nothing is marked data-sticky="top")');
        else if (st.scrolledTo > 0 && st.tops[0] !== 0)
          problems.push(
            name +
              ': the header scrolled away (top ' +
              st.tops[0] +
              'px after scrolling ' +
              st.scrolledTo +
              'px)'
          );
        else if (st.scrolls && st.tops.some((t, i) => i > 0 && t < st.tops[i - 1]))
          problems.push(name + ': stacked headers overlap (' + st.tops.join(', ') + ')');
        if (st.bottoms.some((b) => b < 0 || b > 1))
          problems.push(
            name +
              ': the composer left the bottom of the frame (' +
              st.bottoms.join(', ') +
              'px from it)'
          );
        console.log(
          name +
            ': header tops ' +
            st.tops.join('/') +
            (st.bottoms.length ? ', composer ' + st.bottoms.join('/') + 'px from the bottom' : '') +
            (st.scrolls ? ' (scrolled ' + st.scrolledTo + 'px)' : ' (fits)')
        );
        if (r.page) problems.push(name + ': the page itself scrolls (a second scrollbar)');
        if (r.root.html > 1 || r.root.body > 1)
          problems.push(
            name +
              ': the root is taller than its frame (scrollHeight - clientHeight: html ' +
              r.root.html +
              ', body ' +
              r.root.body +
              ')'
          );
        if (r.nested.length)
          problems.push(
            name +
              ': nested vertical scrollers ' +
              r.nested.join(', ') +
              ' contain ' +
              r.scrollers.join(', ')
          );
      }
      if (problems.length) {
        console.log('FRAME JUMPS:\n' + problems.join('\n'));
        process.exitCode = 1;
      } else {
        console.log(
          'Frame: no view reports a smaller size during navigation, and none exceeds ' + CAP + 'px'
        );
      }
      cdp.close();
      return;
    }

    if (process.argv.includes('--contrast')) {
      // Every view and state, light and dark: a failure for any text under WCAG AA and, in dark mode,
      // for any surface not lighter than #141414. The views follow the host's theme signal (the preview
      // sends it as the host context theme); the browser is also set to prefers-color-scheme to match.
      const violations = [];
      for (const themeName of ['light', 'dark']) {
        await cdp.send('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-color-scheme', value: themeName }],
        });
        for (const [name, query, action] of VIEW_STATES) {
          await open(query, themeName, 640);
          if (action) await run('const d = __doc(); ' + action);
          await sleep(500);
          for (const v of await run(CONTRAST_JS))
            violations.push({ view: name, theme: themeName, ...v });
        }
        if (themeName === 'dark') {
          // A host whose own dark surface is pure black must not pull the view down to black.
          for (const [name, query] of VIEW_STATES.slice(0, 5)) {
            await open(query + '&blackhost=1', themeName, 640);
            await sleep(500);
            for (const v of await run(CONTRAST_JS))
              violations.push({ view: name + ' (black host)', theme: themeName, ...v });
          }
        }
      }
      // The message pane sits one layer below the message cards: #1f1f1f pane, #292929 cards.
      const LAYERS_JS = `
        const d = __doc();
        const hexOf = (e) => '#' + (getComputedStyle(e).backgroundColor.match(/[0-9]+/g) || []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
        const grey = (e) => { const m = getComputedStyle(e).backgroundColor.match(/[0-9]+/g); return m && m[0] === m[1] && m[1] === m[2]; };
        const log = d.querySelector('[role=log]');
        const card = [...log.querySelectorAll('div')].find((e) => getComputedStyle(e).borderRadius === '8px' && grey(e));
        return { pane: hexOf(log), card: card ? hexOf(card) : 'none' };`;
      for (const query of ['view=conversation', 'view=conversation&scenario=channel']) {
        await open(query, 'dark', 640);
        await sleep(500);
        const layers = await run(LAYERS_JS);
        if (layers.pane !== '#1f1f1f' || layers.card !== '#292929')
          violations.push({
            view: query,
            theme: 'dark',
            kind: 'contrast',
            text: 'message pane vs card',
            fg: layers.card,
            bg: layers.pane,
            ratio: 0,
            need: 0,
          });
      }
      if (violations.length) {
        for (const v of violations)
          console.log(
            v.kind === 'dark-surface'
              ? 'DARK SURFACE ' +
                  v.view +
                  ' [' +
                  v.theme +
                  '] ' +
                  v.text +
                  ' ' +
                  v.bg +
                  ' is not lighter than #141414'
              : 'CONTRAST ' +
                  v.view +
                  ' [' +
                  v.theme +
                  '] "' +
                  v.text +
                  '" ' +
                  v.fg +
                  ' on ' +
                  v.bg +
                  ' = ' +
                  v.ratio +
                  ':1 (needs ' +
                  v.need +
                  ')'
          );
        console.log(violations.length + ' violation(s)');
        process.exitCode = 1;
      } else {
        console.log(
          'Contrast: every visible text meets WCAG AA and no dark surface is at or below #141414 in ' +
            VIEW_STATES.length +
            ' views, light and dark'
        );
      }
      cdp.close();
      return;
    }

    if (process.argv.includes('--responsive')) {
      // Every view at three widths, light and dark: screenshots, and a failure when the page
      // scrolls sideways (the frame is the page the user sees).
      const list = (flag, all) => {
        const at = process.argv.indexOf(flag);
        return at > 0 ? process.argv[at + 1].split(',') : all;
      };
      const WIDTHS = list('--widths', ['360', '640', '900']).map(Number);
      const THEMES = list('--themes', ['light', 'dark']);
      const SCENES_RESPONSIVE = VIEW_STATES;
      const overflowing = [];
      for (const width of WIDTHS) {
        for (const themeName of THEMES) {
          for (const [name, query, action] of SCENES_RESPONSIVE) {
            await open(query, themeName, width);
            if (action) await run('const d = __doc(); ' + action);
            await sleep(400);
            const m = await run(
              'const e = __doc().documentElement; return { sw: e.scrollWidth, cw: e.clientWidth };'
            );
            if (m.sw > m.cw + 1)
              overflowing.push(name + ' at ' + width + 'px (' + m.sw + ' > ' + m.cw + ')');
            await shot(name + '-w' + width + '-' + themeName);
          }
        }
      }
      if (overflowing.length) {
        console.log('HORIZONTAL OVERFLOW:\n' + [...new Set(overflowing)].join('\n'));
        process.exitCode = 1;
      } else {
        console.log('No horizontal overflow at ' + WIDTHS.join(', ') + 'px');
      }
      cdp.close();
      return;
    }

    const all = {};
    await open('view=inbox', 'light');
    Object.assign(all, await run(SCENES.inbox));
    await shot('inbox-light');
    Object.assign(all, await run(SCENES.selected));
    await open('view=inbox', 'light');
    Object.assign(all, await run(SCENES.thread));
    await shot('thread-view-light');
    await open('view=message&scenario=attachment', 'light');
    Object.assign(all, await run(SCENES.attachment));
    await open('view=calendar', 'light');
    Object.assign(all, await run(SCENES.calendar));
    await open('view=chats', 'light');
    Object.assign(all, await run(SCENES.teamsChats));
    await open('view=calendar', 'light', 880);
    Object.assign(all, await run(SCENES.calendarToolbar));
    await open('view=calendar', 'light', 865);
    Object.assign(all, await run(SCENES.calendarToolbar.replace('calToolbar:', 'calToolbar865:')));
    await open('view=calendar', 'light');
    Object.assign(all, await run(SCENES.calendarScroll));
    await open('view=calendar', 'light');
    Object.assign(all, await run(SCENES.calendarMonth));
    await open('view=conversation&scenario=channel', 'light');
    Object.assign(all, await run(SCENES.teamsChannel));
    await open('view=conversation&scenario=channel-empty', 'light');
    Object.assign(all, await run(SCENES.teamsEmpty));
    await open('view=conversation&scenario=bot', 'light');
    Object.assign(all, await run(SCENES.teamsBot));
    await open('view=calendar', 'light');
    Object.assign(all, await run(SCENES.calendarWorkWeek));
    await open('view=chats', 'light', 360);
    Object.assign(all, await run(SCENES.teamsRowCompact));
    await open('view=chats', 'light');
    Object.assign(all, await run(SCENES.teamsAvatars));
    await open('view=conversation', 'light');
    Object.assign(all, await run(SCENES.teamsConv));
    // The compose box at rest, hovered and focused: a real pointer move and a real focus.
    {
      const COMPOSE = `
        const d = __doc();
        const area = d.querySelector('textarea');
        let box = area;
        while (box && getComputedStyle(box).borderTopWidth !== '1px') box = box.parentElement;
        const cs = getComputedStyle(box), root = getComputedStyle(area.parentElement);
        const hex = (v) => '#' + (v.match(/[0-9]+/g) || []).slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('');
        const r = box.getBoundingClientRect(), f = document.querySelector('iframe').getBoundingClientRect();
        const visibleBorder = (e) => { const c = getComputedStyle(e); return ['Top', 'Right', 'Bottom', 'Left'].some((side) => parseFloat(c['border' + side + 'Width']) > 0 && c['border' + side + 'Style'] !== 'none' && !/rgba\\(.*, 0\\)$/.test(c['border' + side + 'Color'])); };
        const bordered = [box, ...box.querySelectorAll('*')].filter(visibleBorder).length;
        const send = [...box.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'Send').getBoundingClientRect();
        const rb = box.getBoundingClientRect(), ar = area.getBoundingClientRect();
        const inside = send.left >= rb.left && send.right <= rb.right && send.top >= rb.top && send.bottom <= rb.bottom;
        const sameLine = send.top + send.height / 2 >= ar.top && send.top + send.height / 2 <= ar.bottom;
        return { bw: cs.borderTopWidth, bc: hex(cs.borderTopColor), r: cs.borderTopLeftRadius, shadow: cs.boxShadow, field: root.borderBottomWidth, boxes: bordered, icons: inside ? 'inside' : 'outside', line: sameLine ? 'same' : 'below', x: f.left + r.left + r.width / 2, y: f.top + r.top + r.height / 2 };`;
      const rest = await run(COMPOSE);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rest.x, y: rest.y });
      await sleep(400);
      const hover = await run(COMPOSE);
      await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
      await run("__doc().querySelector('textarea').focus();");
      await sleep(400);
      const focus = await run(COMPOSE);
      const pick = ({ bw, bc, r, shadow, field, boxes, icons, line }) => ({
        bw,
        bc,
        r,
        shadow,
        field,
        boxes,
        icons,
        line,
      });
      all.teamsComposeRest = pick(rest);
      all.teamsComposeHover = pick(hover);
      all.teamsComposeFocus = pick(focus);
    }
    await open('view=draft&scenario=new', 'light');
    Object.assign(all, await run(SCENES.compose));
    await open('view=tasks', 'light');
    Object.assign(all, await run(SCENES.todo));
    await open('view=files', 'light');
    Object.assign(all, await run(SCENES.files));
    await open('view=contacts', 'light');
    Object.assign(all, await run(SCENES.contacts));
    await open('view=contacts&scenario=empty', 'light');
    Object.assign(all, await run(SCENES.contactsEmpty));
    // Our event form field sizes: no real capture to compare with, so they are listed, not asserted.
    await open('view=event&scenario=new', 'light');
    const eventSizes = await run(SCENES.eventForm);

    console.log('METRICS (computed, light theme, 640px frame)');
    console.log(JSON.stringify(all, null, 1));
    console.log('\nCOMPARISON WITH SPEC (m365-setup/outlook-spec.md)');
    console.log(compare(all).join('\n'));

    const failed = failures(all);
    if (process.argv.includes('--matrix')) {
      const { writeFileSync: write } = await import('node:fs');
      write(
        path.join(root, 'docs', 'parity-matrix.md'),
        renderMatrix(all, { 'cal-event-form': eventSizes })
      );
      console.log('Wrote docs/parity-matrix.md');
    }
    if (process.argv.includes('--assert') || process.argv.includes('--matrix')) {
      if (failed.length) {
        console.log('PARITY FAILURES (unjustified differences):\n' + failed.join('\n'));
        process.exitCode = 1;
      } else {
        console.log(
          'Parity: every row matches its spec or is justified (' + MATRIX.length + ' rows)'
        );
      }
    }

    if (shotsDir) {
      for (const themeName of ['light', 'dark']) {
        await open('view=inbox', themeName);
        await shot(`inbox-${themeName}`);
        await run(
          `const d = __doc(); const chev = d.querySelector('[aria-label="Expand conversation"]'); chev && chev.click(); await new Promise((r) => setTimeout(r, 1200));`
        );
        await shot(`inbox-expanded-row-${themeName}`);
        await open('view=inbox', themeName);
        await run(
          `const d = __doc(); d.querySelector('[role=option]').click(); await new Promise((r) => setTimeout(r, 2500));`
        );
        await shot(`thread-view-${themeName}`);
        await open('view=draft&scenario=reply', themeName);
        await shot(`reply-composer-${themeName}`);
        await open('view=draft&scenario=new', themeName);
        await shot(`new-mail-${themeName}`);
      }
      for (const themeName of ['light', 'dark']) {
        for (const [name, query] of [
          ['calendar-week', 'view=calendar'],
          ['calendar-agenda', 'view=calendar&scenario=agenda'],
          ['event', 'view=event'],
          ['files', 'view=files'],
          ['file', 'view=file'],
          ['contacts', 'view=contacts'],
          ['contact', 'view=contact'],
          ['tasks', 'view=tasks'],
          ['tasks-empty', 'view=tasks&scenario=empty'],
          ['contacts-empty', 'view=contacts&scenario=empty'],
          ['teams-chats', 'view=chats'],
          ['teams-conversation', 'view=conversation'],
          ['teams-channel', 'view=conversation&scenario=channel'],
        ]) {
          await open(query, themeName);
          await sleep(500);
          await shot(`${name}-${themeName}`);
        }
      }
      console.log(`\nScreenshots written to ${shotsDir}`);
    }
    cdp.close();
  } finally {
    chrome.kill();
    server.kill();
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
