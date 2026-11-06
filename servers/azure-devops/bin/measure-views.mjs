#!/usr/bin/env node
/**
 * Parity gate: renders the views in the local preview with the system Chrome (no browser download,
 * no extra dependency: it speaks the DevTools protocol over the global WebSocket) and prints the
 * computed metrics next to the reference values read from the Azure DevOps captures.
 *
 *   npm run measure:views                 metrics for the light theme at 640px
 *   npm run measure:views -- --shots DIR  also save 640px light and dark screenshots to DIR
 *
 * Set CHROME_PATH to override the Chrome location. The exit code is 0 even on differences; the
 * table and the screenshots are the review artifact.
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { CAPTURES, NO_CAPTURE, ROWS } from "./parity-spec.mjs";
import { reportContrast, runContrast, runSurfaceRoles } from "./contrast-gate.mjs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
/** MEASURE_PORT moves both ports, so two runs (the layout and parity tests) can go side by side. */
const PREVIEW_PORT = Number(process.env.MEASURE_PORT ?? 6293);
const DEBUG_PORT = PREVIEW_PORT + 3050;
const chromePath =
  process.env.CHROME_PATH ??
  [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].find((p) => existsSync(p));

const overflowOnly = process.argv.includes("--overflow-only");
/** --parity compares every row of bin/parity-spec.mjs with its capture; --write also rewrites docs/parity-matrix.md. */
const parity = process.argv.includes("--parity");
/** --contrast checks text contrast and dark surfaces in both themes (also part of --parity). */
const contrast = process.argv.includes("--contrast");
const writeMatrix = process.argv.includes("--write");
/** MEASURE_ONLY=test- limits the screenshots and the overflow check to views whose name starts with it (no metrics, no interaction checks). */
const only = process.env.MEASURE_ONLY ?? "";
const shotsIndex = process.argv.indexOf("--shots");
const shotsDir = shotsIndex > 0 ? process.argv[shotsIndex + 1] : null;
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
  window.__st = (el) => {
    if (!el) return null;
    const s = el.ownerDocument.defaultView.getComputedStyle(el), r = el.getBoundingClientRect();
    const o = { w: Math.round(r.width * 10) / 10, h: Math.round(r.height * 10) / 10 };
    for (const p in P) { const v = s[p]; if (v && v !== 'rgba(0, 0, 0, 0)') o[P[p]] = hex(v); }
    o.font = s.fontFamily.split(',')[0].replace(/"/g, '');
    return o;
  };
  window.px = (el) => { const r = el.getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.x), y: Math.round(r.y) }; };
  window.tabs = () => [...__doc().querySelectorAll('[role=tab]')].map((e) => { const t = e.textContent.trim(); const h = t.length / 2; return t.slice(0, h) === t.slice(h) ? t.slice(0, h) : t; }).join(',');
  window.lines = () => __doc().body.innerText.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
  window.inOrder = (want) => { const l = window.lines(); let at = 0; for (const w of want) { const i = l.indexOf(w, at); if (i < 0) return 'missing ' + w + ' after ' + (l[at - 1] || 'start'); at = i + 1; } return true; };
  window.cs = (el) => el.ownerDocument.defaultView.getComputedStyle(el);
  window.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  window.__byText = (re, sel = 'span,div,h1,h2') => [...__doc().querySelectorAll(sel)].find((e) => re.test(e.textContent.trim()) && (sel === 'button' || ![...e.children].some((c) => re.test(c.textContent.trim()))));
})();`;

/** Computed metrics per scene. */
const SCENES = {
  board: `
    return {
      pageTitle: __st(__doc().querySelector('h1')),
      viewAsBacklog: __st(__byText(/^View as backlog$/, 'button')),
      laneHeadTodo: __st(__byText(/^To Do$/)),
      newItem: __st(__byText(/^New item$/, 'button')),
      card: __st(__doc().querySelector('[data-testid^=card-]')),
      lanes: [...__doc().querySelectorAll('[data-testid^=card-]')].length,
    };`,
  sprint: `
    return {
      pageTitle: __st(__doc().querySelector('h1')),
      newWorkItem: __st(__byText(/^New Work Item$/, 'button')),
      sprintPicker: __st(__byText(/^Sprint 1/, 'button')),
      personPicker: __st(__byText(/^Person: All$/, 'button')),
    };`,
};

/** Reference values read from the Azure DevOps captures (reference/azure-devops/03, 05; 1440px wide capture). */
const SPEC = {
  pageTitle: { fs: "20px" },
  newItem: { h: 28 },
  newWorkItem: { h: 32 },
  sprintPicker: { h: 32 },
  personPicker: { h: 32 },
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
      const ok = String(actual) === String(expected) || (typeof expected === "number" && Math.abs(Number(actual) - expected) <= 1);
      lines.push(`${key.padEnd(16)} ${prop.padEnd(5)} spec ${String(expected).padEnd(9)} got ${String(actual).padEnd(9)} ${ok ? "ok" : "DIFF"}`);
    }
  }
  return lines;
}

/** Frame widths every view must lay out at: a narrow sidebar or phone, a normal chat column, a wide pane. */
const WIDTHS = [360, 640, 900];

const ALL_SHOTS = [
  ["board", "view=board"],
  ["board-empty", "view=board&scenario=empty"],
  ["backlog", "view=backlog"],
  ["backlog-empty", "view=backlog&scenario=empty"],
  ["sprint-taskboard", "view=sprint"],
  ["work-item", "view=work-item&id=10"],
  ["work-item-task", "view=work-item&id=31"],
  ["work-item-epic", "view=work-item&id=1"],
  ["query", "view=query"],
  ["pull-requests", "view=pull-requests"],
  ["pull-request", "view=pull-requests&id=1"],
  ["pr-form", "view=pr-form"],
  ["pipelines", "view=pipelines"],
  ["pipeline-runs", "view=pipelines&pipeline=1"],
  ["pipeline-run", "view=pipelines&run=1"],
  ["pipeline-form", "view=pipeline-form"],
  ["test-plans", "view=test-plans"],
  ["test-case", "view=test-case"],
  ["test-results", "view=test-results"],
  ["sprint-empty", "view=sprint&scenario=empty"],
  ["agile-bug-form", "view=new-item&scenario=agile&type=Bug"],
  ["agile-story-form", "view=new-item&scenario=agile&type=User%20Story"],
  ["agile-feature-form", "view=new-item&scenario=agile&type=Feature"],
  ["agile-backlog", "view=backlog&scenario=agile"],
  ["agile-board", "view=board&scenario=agile"],
  ["agile-work-item-bug", "view=work-item&id=29&scenario=agile"],
  ["new-item", "view=new-item"],
  ["new-item-blank", "view=new-item&scenario=blank"],
];
const SHOTS = only ? ALL_SHOTS.filter(([name]) => name.startsWith(only)) : ALL_SHOTS;

/** Renders every parity row and prints the matrix; returns the rows with their results. */
async function runParity(open, run, cdp, sleepFn = sleep) {
  const results = [];
  for (const row of ROWS.filter((r) => !process.env.PARITY_ONLY || r.id.startsWith(process.env.PARITY_ONLY))) {
    // Rows wider than the default window (the captures are 1440px wide) widen the viewport first.
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: Math.max(1000, row.width + 80), height: 1500, deviceScaleFactor: 1, mobile: false });
    await open(row.scene, "light", row.width);
    await sleep(1500);
    // Errors thrown in the view while an item runs are shown with a failing item: a blank view is otherwise silent.
    const items = [];
    const watch = () =>
      run(
        "window.__perr = []; const w = __doc().defaultView; w.addEventListener('error', (e) => window.__perr.push(String(e.message) + ' ' + String((e.error && e.error.stack) || '').split(String.fromCharCode(10)).slice(0, 4).join(' | ')));"
      ).catch(() => undefined);
    const evaluate = async (item) => {
      await watch();
      let got;
      try {
        got = await run(`const { px, cs, sleep, tabs, lines, inOrder } = window; ${item.js}`);
      } catch (e) {
        got = `ERROR ${String(e.message ?? e).split("\n")[0]}`;
      }
      const numeric = typeof item.expected === "number" && typeof got === "number";
      const delta = numeric ? Math.round((got - item.expected) * 10) / 10 : String(got) === String(item.expected) ? 0 : "differs";
      const within = numeric ? Math.abs(delta) <= (item.tol ?? 0) : delta === 0;
      return { got, delta, within };
    };
    for (const item of row.items) {
      let r = await evaluate(item);
      if (!r.within) {
        // A loaded machine can make a view late: reload the scene and measure once more before reporting a difference.
        await open(row.scene, "light", row.width);
        await sleep(2000);
        r = await evaluate(item);
      }
      const perr = r.within ? [] : await run("return window.__perr || [];").catch(() => []);
      if (!r.within) console.log(`  view text after "${item.name}": ${String(await run("return __doc().body.innerText.replace(/\s+/g, ' ').slice(0, 220);").catch(() => ""))}`);
      if (perr.length > 0) console.log(`  view error in ${row.id}: ${perr.join(" ; ")}`);
      items.push({ ...item, got: r.got, delta: r.delta, status: r.within ? "ok" : item.justified ? "justified" : "FAIL" });
    }
    results.push({ ...row, items });
  }
  // Both themes: text contrast and dark surfaces (see contrast-gate.mjs).
  const contrastResult = await runContrast(open, run, SHOTS, sleepFn);
  const roles = await runSurfaceRoles(open, run, sleepFn);
  contrastResult.roles = roles;
  for (const r of roles) console.log(`${r.ok ? "ok " : "FAIL"} surface role ${r.name} (${r.theme}): spec ${r.expected} got ${r.got}`);
  const contrastBad = roles.filter((r) => !r.ok).length + contrastResult.light.failures.length + contrastResult.dark.failures.length + contrastResult.dark.pureBlack.length;
  const lines = [];
  for (const r of results)
    for (const i of r.items) lines.push(`${i.status.padEnd(9)} ${r.id.padEnd(30)} ${i.name.padEnd(42)} spec ${String(i.expected).padEnd(22)} got ${String(i.got).padEnd(22)} delta ${i.delta}`);
  console.log(lines.join("\n"));
  const failed = results.flatMap((r) => r.items).filter((i) => i.status === "FAIL");
  console.log(`\nPARITY: ${results.flatMap((r) => r.items).length} items, ${failed.length} unjustified differences`);
  if (writeMatrix) {
    writeFileSync(path.join(root, "docs", "parity-matrix.md"), renderMatrix(results, contrastResult));
    console.log("wrote docs/parity-matrix.md");
  }
  console.log(reportContrast(contrastResult).join(String.fromCharCode(10)));
  if (failed.length > 0) process.exitCode = 4;
  else if (contrastBad > 0) process.exitCode = 6;
}

function renderMatrix(results, contrastResult) {
  const esc = (v) => String(v).replace(/\|/g, "\|");
  const out = [
    "# Parity matrix",
    "",
    "Every view and state compared with a real capture of the web UI. Generated by `npm run parity:write` (`node bin/measure-views.mjs --parity --write`); do not edit by hand. The gate (`npm run parity`, and the jest test `parity.test.ts` where Chrome is installed) fails on a difference that is neither within the tolerance nor justified below.",
    "",
    `Captures: \`${CAPTURES}/\`. Source \`dom\` = read from the real page's DOM and CSS (exact, tolerance 0); \`pixels\` = measured on the capture file (JPEG edges, tolerance 1). Our values are measured in the preview with Chrome at the row's frame width (the captures are 1440px wide, so only sizes that do not depend on width are compared as numbers).`,
    "",
    "| View | State | Capture | Item | Spec | Ours | Delta | Status |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const r of results)
    for (const i of r.items)
      out.push(
        `| ${esc(r.view)} | ${esc(r.state)} | ${r.capture} | ${esc(i.name)} | ${esc(i.expected)} (${i.source}) | ${esc(i.got)} | ${i.delta} | ${i.status === "justified" ? `justified: ${esc(i.justified)}` : i.status} |`
      );
  const c = contrastResult;
  out.push(
    "",
    "## Dark theme and contrast",
    "",
    "Every view and state is rendered in the light and the dark theme (`bin/contrast-gate.mjs`, run by `npm run parity` and `npm run contrast`). The gate fails on a text node or placeholder below 4.5:1 against its effective background (3:1 for text of 24px or more, or 18.66px bold or more) and, in the dark theme, on any background darker than #1f1f1f (the page layer; #141414 is the floor for scroll gutters only, not for surfaces).",
    "",
    "| Theme | Text nodes and placeholders checked | Below the ratio | Backgrounds darker than #1f1f1f |",
    "| --- | --- | --- | --- |",
    `| light | ${c.light.checked} | ${c.light.failures.length} | not checked |`,
    `| dark | ${c.dark.checked} | ${c.dark.failures.length} | ${c.dark.pureBlack.length} |`,
    "",
    "Surface roles asserted in both themes (an inset surface must differ from its page):",
    "",
    "| Role | Theme | Spec | Ours |",
    "| --- | --- | --- | --- |",
    ...c.roles.map((r) => `| ${r.name} | ${r.theme} | ${r.expected} | ${r.got}${r.ok ? "" : " (differs)"} |`),
    "",
    "Dark column: the token each surface and text role uses (the values webDarkTheme ships).",
    "",
    "| Surface or text | Token | Dark value |",
    "| --- | --- | --- |",
    "| Frame (from the host's variables) | `--color-background-secondary` | host value, never pure black |",
    "| Page, panes, band behind the fields | `colorNeutralBackground2` | #1f1f1f |",
    "| Cards, panels, inputs, discussion box, board page | `colorNeutralBackground1` | #292929 |",
    "| Inset surfaces: board lanes, info boxes (Deployment, Development, Related Work), tag chips | `colorNeutralBackground2` in dark, `colorNeutralBackground3` in light (role `--kInset`) | #1f1f1f |",
    "| Dividers, card and chip borders | `colorNeutralStroke1`, `colorNeutralStroke2` | theme strokes |",
    "| Values, headings, titles | `colorNeutralForeground1` | #ffffff |",
    "| Secondary text | `colorNeutralForeground2` | #d6d6d6 |",
    "| Field labels, hints, placeholders, empty-field text | `colorNeutralForeground3` | #adadad |",
    "| Links | `colorBrandForegroundLink` | theme link colour |",
    ""
  );
  out.push("", "## No capture yet", "", "| View | States still to capture from the real org |", "| --- | --- |");
  for (const [v, s] of NO_CAPTURE) out.push(`| ${esc(v)} | ${esc(s)} |`);
  out.push(
    "",
    "## Responsive widths",
    "",
    "The overflow check renders every view at 360, 640 and 900px and fails on any element that runs past the frame edge or any scroll container (other than a log) whose content is wider than it is. Real captures at those widths: only `m365-setup/reference/live/ado-new-item-form-390px.png` (new item form at a 326px frame). The real page at narrow widths is still to be captured for every other view.",
    ""
  );
  return out.join("\n");
}

/** Children this run started; killed with their process trees on exit so a failed run never leaves a Chrome or a preview server holding the ports. */
const children = [];
function killTree(child) {
  if (!child?.pid) return;
  try {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else child.kill("SIGKILL");
  } catch {
    /* already gone */
  }
}
process.on("exit", () => children.forEach(killTree));
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => process.exit(130));
/** The run stops itself: MEASURE_TIMEOUT_MS (default 9 minutes) bounds the whole run, including the Chrome it started. */
const watchdog = setTimeout(
  () => {
    console.error(`measure-views: timed out after ${process.env.MEASURE_TIMEOUT_MS ?? 540000} ms`);
    process.exit(5);
  },
  Number(process.env.MEASURE_TIMEOUT_MS ?? 540000)
);
watchdog.unref();

async function main() {
  if (!chromePath) throw new Error("Chrome not found; set CHROME_PATH");
  const server = spawn(process.execPath, [path.join(root, "node_modules", "tsx", "dist", "cli.mjs"), "preview/server.ts"], {
    cwd: root,
    env: { ...process.env, PREVIEW_PORT: String(PREVIEW_PORT) },
    stdio: "ignore",
  });
  children.push(server);
  const profile = mkdtempSync(path.join(tmpdir(), "view-measure-"));
  const chrome = spawn(
    chromePath,
    [`--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "--headless=new", "--no-first-run", "--hide-scrollbars", "--window-size=1000,1500", "about:blank"],
    {
      stdio: "ignore",
    }
  );
  children.push(chrome);
  try {
    await waitFor(`http://127.0.0.1:${PREVIEW_PORT}/`);
    await waitFor(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    const tab = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?about:blank`, { method: "PUT" })).json();
    const cdp = await connect(tab.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: 1000, height: 1500, deviceScaleFactor: 1, mobile: false });

    const open = async (query, themeName, width = 640, extra = "auto=1") => {
      await cdp.send("Page.navigate", { url: `http://127.0.0.1:${PREVIEW_PORT}/host.html?${query}&theme=${themeName}&nosandbox=1&${extra}&width=${width}` });
      await sleep(2500);
      await cdp.send("Runtime.evaluate", { expression: PAGE_HELPERS });
    };
    const run = async (body) => {
      const r = await cdp.send("Runtime.evaluate", { expression: `(async () => { ${body} })()`, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? "evaluate failed");
      return r.result.value;
    };
    const shot = async (name) => {
      if (!shotsDir) return;
      mkdirSync(shotsDir, { recursive: true });
      const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      writeFileSync(path.join(shotsDir, `${name}.png`), Buffer.from(data, "base64"));
    };

    if (contrast) {
      const result = process.env.ROLES_ONLY
        ? { light: { checked: 0, failures: [], surfaces: {} }, dark: { checked: 0, failures: [], pureBlack: [], surfaces: {} } }
        : await runContrast(open, run, SHOTS, sleep);
      result.roles = await runSurfaceRoles(open, run, sleep);
      for (const r of result.roles) console.log(`${r.ok ? "ok " : "FAIL"} surface role ${r.name} (${r.theme}): spec ${r.expected} got ${r.got}`);
      console.log(reportContrast(result).join(String.fromCharCode(10)));
      if (result.light.failures.length + result.dark.failures.length + result.dark.pureBlack.length + result.roles.filter((r) => !r.ok).length > 0) process.exitCode = 6;
      cdp.close();
      return;
    }

    if (parity) {
      await runParity(open, run, cdp);
      cdp.close();
      return;
    }

    if (!overflowOnly && !only) {
      const all = {};
      await open("view=board", "light");
      Object.assign(all, await run(SCENES.board));
      await open("view=sprint", "light");
      Object.assign(all, await run(SCENES.sprint));

      console.log("METRICS (computed, light theme, 640px frame)");
      console.log(JSON.stringify(all, null, 1));
      console.log("\nCOMPARISON WITH THE REFERENCE CAPTURES");
      console.log(compare(all).join("\n"));
    }

    if (shotsDir && !overflowOnly) {
      for (const width of WIDTHS) {
        for (const themeName of ["light", "dark"]) {
          for (const [name, query] of SHOTS) {
            await open(query, themeName, width);
            await sleep(500);
            await shot(`${name}-${width}-${themeName}`);
          }
        }
      }
      console.log(`\nScreenshots written to ${shotsDir}`);
    }

    // Interaction checks against the built view with real mouse events: drag a card to another column,
    // approve (the card moves) and reject (it snaps back), then the filter bar and column collapse.
    const interactions = [];
    if (!overflowOnly && !only) {
      const point = (js) =>
        run(
          `const f = document.querySelector('iframe'); const fr = f.getBoundingClientRect(); const d = __doc(); const r = (${js}); if (!r) return null; const b = r.getBoundingClientRect(); return { x: fr.left + b.left + b.width / 2, y: fr.top + b.top + b.height / 2 };`
        );
      const mouse = (type, x, y) => cdp.send("Input.dispatchMouseEvent", { type, x, y, button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1 });
      const inLane = (lane, id) => run(`return !!__doc().querySelector('[data-lane="${lane}"] [data-card-id="${id}"]');`);
      const count = (sel) => run(`return document.querySelectorAll(${JSON.stringify(sel)}).length;`);
      const dragCard = async (id, laneName, shotName) => {
        const from = await point(`d.querySelector('[data-card-id="${id}"]')`);
        const to = await point(`d.querySelector('[data-lane="${laneName}"]')`);
        await mouse("mouseMoved", from.x, from.y);
        await mouse("mousePressed", from.x, from.y);
        for (let i = 1; i <= 8; i++) {
          await mouse("mouseMoved", from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8);
          await sleep(30);
        }
        const mid = await run(`const d = __doc(); return { ghost: !!d.querySelector('[data-testid=drag-ghost]'), placeholder: !!d.querySelector('[data-testid=drop-placeholder]') };`);
        if (shotsDir && shotName) await shot(shotName);
        await mouse("mouseReleased", to.x, to.y);
        await sleep(400);
        return mid;
      };
      await open("view=board", "light", 640, "auto=0");
      const mid = await dragCard(11, "Done", "drag-mid-640-light");
      interactions.push(["ghost and drop placeholder while dragging", mid.ghost && mid.placeholder]);
      interactions.push(["the write waits for the host approval card", (await count(".approval")) === 1]);
      await run("document.querySelector('[data-testid=approve]').click();");
      await sleep(900);
      interactions.push(["approved: the card is now in Done", await inLane("Done", 11)]);
      await dragCard(12, "Done");
      await run("[...document.querySelectorAll('.approval button')].find((b) => b.textContent === 'Reject').click();");
      await sleep(600);
      interactions.push(["rejected: the card snaps back to To Do", await inLane("To Do", 12)]);
      await open("view=board", "light", 640);
      const before = await run("return __doc().querySelectorAll('[data-card-id]').length;");
      await run("__doc().querySelector('[aria-label=Filter]').click();");
      await sleep(300);
      await run(
        `const i = __doc().querySelector('input[aria-label="Filter by keyword"]'); const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; set.call(i, 'email'); i.dispatchEvent(new Event('input', { bubbles: true }));`
      );
      await sleep(300);
      const after = await run("return __doc().querySelectorAll('[data-card-id]').length;");
      interactions.push([`the keyword filter narrows the cards (${before} to ${after})`, after > 0 && after < before]);
      await run(`[...__doc().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Clear').click();`);
      await sleep(300);
      interactions.push(["Clear restores them", (await run("return __doc().querySelectorAll('[data-card-id]').length;")) === before]);
      await run(`__doc().querySelector('[aria-label="Collapse To Do"]').click();`);
      await sleep(300);
      interactions.push([
        "a collapsed column shows a vertical label",
        await run(`return [...__doc().querySelectorAll('span')].some((e) => getComputedStyle(e).writingMode === 'vertical-rl' && e.textContent === 'To Do');`),
      ]);
    }
    // Navigation must not shake the page: the frame height the host sees never dips below the lower of the
    // before and after heights during board -> detail -> back, and never passes the cap.
    if (!overflowOnly && !only) {
      const watch = () =>
        run(
          "const f = document.querySelector('iframe'); window.__hs = [f.offsetHeight]; if (window.__hobs) window.__hobs.disconnect(); window.__hobs = new MutationObserver(() => window.__hs.push(f.offsetHeight)); window.__hobs.observe(f, { attributes: true, attributeFilter: ['style'] }); return 1;"
        );
      const series = () => run("return window.__hs.slice();");
      const noDip = (hs) => hs.length > 0 && Math.min(...hs) >= Math.min(hs[0], hs[hs.length - 1]) - 1;
      const cap = 720 + 24;
      for (const [label, query, openSel] of [
        ["board", "view=board", "[data-card-id]"],
        ["pull requests", "view=pull-requests", "[data-testid^=pr-] button"],
        ["pipelines", "view=pipelines", "[data-testid^=pipeline-] button"],
      ]) {
        await open(query, "light", 640);
        await sleep(1800);
        await watch();
        await run(`__doc().querySelector(${JSON.stringify(openSel)}).click();`);
        await sleep(3000);
        const forward = await series();
        await watch();
        await run("__doc().querySelector('button[aria-label^=Back]').click();");
        await sleep(3000);
        const backward = await series();
        console.log(`
FRAME HEIGHT TRACE ${label} (px the host sees)
  list -> detail: ${forward.join(" -> ")}
  detail -> list: ${backward.join(" -> ")}`);
        interactions.push([`${label}: list -> detail, the frame never dips below the lower of its start and end height`, noDip(forward)]);
        interactions.push([`${label}: detail -> list, the frame never dips below the lower of its start and end height`, noDip(backward)]);
        interactions.push([`${label}: the frame never passes the ${cap}px cap`, Math.max(...forward, ...backward) <= cap]);
      }
    }
    console.log(`\nINTERACTIONS (real mouse events, 640px)\n${interactions.map(([n, ok]) => `${ok ? "pass" : "FAIL"}  ${n}`).join("\n")}`);
    if (interactions.some(([, ok]) => !ok)) process.exitCode = 3;

    // Layout check: no view may be wider than its frame (no horizontal page scroll) at 360, 640 and 900px.
    const overflowing = [];
    for (const width of WIDTHS) {
      for (const [name, query] of SHOTS) {
        await open(query, "light", width);
        await sleep(400);
        const r = await run(`const d = __doc(); const frame = document.querySelector('iframe'); const w = frame.clientWidth; const bad = [];
          const inScroll = (e) => { for (let p = e.parentElement; p && p !== d.body; p = p.parentElement) { const o = getComputedStyle(p).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
          for (const e of d.querySelectorAll('body *')) {
            const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || e.closest('[aria-hidden=true],svg')) continue;
            const b = e.getBoundingClientRect(); if (b.width === 0 || b.height === 0) continue;
            if (b.right > w + 1 && !inScroll(e) && !e.closest('[data-intended-scroll]')) bad.push('element runs past the frame edge: ' + e.tagName.toLowerCase() + (e.getAttribute('aria-label') ? '[' + e.getAttribute('aria-label') + ']' : '') + ' ' + (e.textContent || '').trim().slice(0, 24));
            if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && e.scrollWidth > e.clientWidth + 1 && e.tagName !== 'PRE' && !e.closest('[data-intended-scroll]')) bad.push('scroll container wider than itself: ' + e.tagName.toLowerCase() + ' ' + e.scrollWidth + ' > ' + e.clientWidth);
          }
          return { scroll: d.documentElement.scrollWidth, client: w, bad: bad.slice(0, 3) };`);
        if (r.scroll > r.client + 1) overflowing.push(`${name} at ${width}px: content ${r.scroll}px wide in a ${r.client}px frame`);
        for (const b of r.bad) overflowing.push(`${name} at ${width}px: ${b}`);
      }
    }
    console.log(overflowing.length ? `\nOVERFLOW\n${overflowing.join("\n")}` : `\nNo horizontal overflow at ${WIDTHS.join(", ")}px (${SHOTS.length} views).`);
    if (overflowing.length) process.exitCode = 2;
    cdp.close();
  } finally {
    children.forEach(killTree);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
