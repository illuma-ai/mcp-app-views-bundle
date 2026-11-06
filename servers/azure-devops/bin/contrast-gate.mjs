/**
 * Contrast gate: renders every view and state in the light and the dark theme and checks
 *  - every visible text node: contrast ratio against its effective background >= 4.5:1
 *    (>= 3:1 for text of 24px or more, or 18.66px bold or more), and every input placeholder the same;
 *  - dark theme only: no rendered background darker than #1f1f1f (the deepest layer of the Fluent web
 *    dark palette; pure-black surfaces are not allowed).
 * Colours come out of the browser's computed styles, so a hard-coded light grey on a dark surface fails
 * here the way it looks on screen. Used by `measure-views.mjs --contrast` and by the parity run.
 */

/** Runs in the view frame. Returns the findings for the page as shown. */
const HELPERS_SRC = `
const doc = __doc();
const win = doc.defaultView;
const parse = (c) => { const m = /rgba?\\(([^)]+)\\)/.exec(c || ""); if (!m) return null; const p = m[1].split(/[ ,\\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
const lum = (c) => { const ch = [c.r, c.g, c.b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2]; };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
// The surface the frame sits on (the host page behind the iframe).
const host = (() => { const stack = []; for (let e = document.querySelector("iframe"); e; e = e.parentElement) stack.push(e); let bg = { r: 255, g: 255, b: 255, a: 1 }; for (const e of stack.reverse()) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; })();
const bgOf = (el) => { const stack = []; for (let e = el; e; e = e.parentElement) stack.push(e); let bg = host; for (const e of stack.reverse()) { const c = parse(win.getComputedStyle(e).backgroundColor); if (c && c.a > 0) bg = over(c, bg); } return bg; };
`;
export const PAGE_CONTRAST_HELPERS = HELPERS_SRC;

export const PAGE_CONTRAST =
  HELPERS_SRC +
  `
const opacityOf = (el) => { let o = 1; for (let e = el; e; e = e.parentElement) o *= Number(win.getComputedStyle(e).opacity); return o; };
const skip = (el) => !el || el.closest("svg,script,style,[aria-hidden=true],[disabled],[aria-disabled=true],option");
const visible = (el, rect) => { const cs = win.getComputedStyle(el); return cs.display !== "none" && cs.visibility !== "hidden" && rect.width > 0 && rect.height > 0; };
const out = { low: [], dark: [], checked: 0, surfaces: {} };
const check = (label, el, fgCss, kind) => {
  const cs = win.getComputedStyle(el);
  const fs = parseFloat(cs.fontSize);
  const bold = Number(cs.fontWeight) >= 700;
  const need = fs >= 24 || (fs >= 18.66 && bold) ? 3 : 4.5;
  const bg = bgOf(el);
  let fg = parse(fgCss);
  if (!fg) return;
  fg = { ...fg, a: fg.a * opacityOf(el) };
  const ink = over(fg, bg);
  out.checked++;
  const r = ratio(ink, bg);
  if (r < need) out.low.push({ text: label.slice(0, 40), kind, fg: hex(ink), bg: hex(bg), ratio: Math.round(r * 100) / 100, need, fs });
};
const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
for (let n = walker.nextNode(); n; n = walker.nextNode()) {
  const t = n.textContent.trim();
  if (!t) continue;
  const el = n.parentElement;
  if (skip(el)) continue;
  const range = doc.createRange(); range.selectNodeContents(n);
  if (!visible(el, range.getBoundingClientRect())) continue;
  check(t, el, win.getComputedStyle(el).color, "text");
}
for (const input of doc.querySelectorAll("input[placeholder],textarea[placeholder]")) {
  if (skip(input) || input.value) continue;
  if (!visible(input, input.getBoundingClientRect())) continue;
  check("placeholder: " + input.getAttribute("placeholder"), input, win.getComputedStyle(input, "::placeholder").color, "placeholder");
}
// Surfaces: a rendered background darker than #1f1f1f is pure-black territory (checked in the dark theme).
const floor = lum({ r: 31, g: 31, b: 31 });
const seen = new Set();
for (const el of doc.querySelectorAll("body *")) {
  if (el.closest("[disabled],[aria-disabled=true]")) continue; // disabled controls take the theme's own disabled fill
  const c = parse(win.getComputedStyle(el).backgroundColor);
  if (!c || c.a <= 0) continue;
  const rect = el.getBoundingClientRect();
  if (rect.width < 4 || rect.height < 4) continue;
  const eff = over(c, bgOf(el.parentElement || el));
  out.surfaces[hex(eff)] = (out.surfaces[hex(eff)] || 0) + 1;
  if (lum(eff) < floor - 1e-6) {
    const k = hex(eff) + String(el.className || "").slice(0, 30);
    if (!seen.has(k)) { seen.add(k); out.dark.push({ el: el.tagName.toLowerCase() + "." + String(el.className || "").split(" ")[0] + " in " + (el.parentElement ? el.parentElement.tagName.toLowerCase() + "[" + (el.parentElement.getAttribute("aria-label") || el.parentElement.getAttribute("data-testid") || "") + "]" : "") + " [" + (el.textContent || "").trim().slice(0, 16) + "] " + Math.round(rect.width) + "x" + Math.round(rect.height), bg: hex(eff) }); }
  }
}
return out;`;

/**
 * Surface-role assertions: the layer each part of a page sits on, in both themes. An inset surface
 * (lane, info box) must be a different tone from the page under it; the values are the Fluent web
 * palettes (light: Background1 #ffffff, 2 #fafafa, 3 #f5f5f5; dark: 1 #292929, 2 #1f1f1f).
 * `js` runs in the view frame and returns the element whose effective background is read.
 */
export const SURFACE_ROLES = [
  {
    name: "work item page opened from a board card (the columns)",
    scene: "view=board&scenario=agile",
    act: "document.querySelector('iframe').contentDocument.querySelector('[data-card-id]').click(); await window.sleep(1500);",
    js: "const d = document.querySelector('iframe').contentDocument; return [...d.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Description' || h.textContent.trim() === 'Repro Steps');",
    light: "#ffffff",
    dark: "#292929",
  },
  {
    name: "work item info box opened from a board card",
    scene: "view=board&scenario=agile",
    act: "document.querySelector('iframe').contentDocument.querySelector('[data-card-id]').click(); await window.sleep(1500);",
    js: "const d = document.querySelector('iframe').contentDocument; return [...d.querySelectorAll('div')].filter((e) => e.textContent.trim().startsWith('To track releases')).pop();",
    light: "#f5f5f5",
    dark: "#1f1f1f",
  },
  { name: "board page", scene: "view=board", js: "return document.querySelector('iframe').contentDocument.querySelector('[data-intended-scroll]').parentElement;", light: "#fafafa", dark: "#292929" },
  { name: "board lane", scene: "view=board", js: "return document.querySelector('iframe').contentDocument.querySelector('[data-lane]');", light: "#f5f5f5", dark: "#1f1f1f" },
  { name: "board card", scene: "view=board", js: "return document.querySelector('iframe').contentDocument.querySelector('[data-card-id]');", light: "#ffffff", dark: "#292929" },
  {
    name: "work item page (the columns)",
    scene: "view=work-item&id=10",
    js: "const d = document.querySelector('iframe').contentDocument; return [...d.querySelectorAll('h2')].find((h) => h.textContent.trim() === 'Description');",
    light: "#ffffff",
    dark: "#292929",
  },
  {
    name: "work item info box (Deployment)",
    scene: "view=work-item&id=10",
    js: "const d = document.querySelector('iframe').contentDocument; return [...d.querySelectorAll('div')].filter((e) => e.textContent.trim().startsWith('To track releases')).pop();",
    light: "#f5f5f5",
    dark: "#1f1f1f",
  },
];

/**
 * Renders every scene in both themes and collects the findings.
 * @param {(query: string, theme: string, width?: number) => Promise<void>} open
 * @param {(body: string) => Promise<any>} run
 * @param {[string, string][]} scenes
 */
export async function runSurfaceRoles(open, run, sleep) {
  const out = [];
  for (const theme of ["light", "dark"]) {
    for (const role of SURFACE_ROLES) {
      await open(role.scene, theme, 900);
      await sleep(700);
      const got = await run((role.act ?? "") + PAGE_CONTRAST_HELPERS + "const el = (() => {" + role.js + '})(); return el ? hex(bgOf(el)) : "no element";');
      out.push({ name: role.name, theme, expected: role[theme], got, ok: got === role[theme] });
    }
  }
  return out;
}

export async function runContrast(open, run, scenes, sleep) {
  const result = { light: { checked: 0, failures: [], surfaces: {} }, dark: { checked: 0, failures: [], pureBlack: [], surfaces: {} } };
  for (const theme of ["light", "dark"]) {
    for (const [name, query] of scenes) {
      await open(query, theme, 640);
      await sleep(700);
      const r = await run(PAGE_CONTRAST);
      result[theme].checked += r.checked;
      for (const [k, n] of Object.entries(r.surfaces)) result[theme].surfaces[k] = (result[theme].surfaces[k] || 0) + n;
      for (const f of r.low) result[theme].failures.push({ scene: name, ...f });
      if (theme === "dark") for (const d of r.dark) result.dark.pureBlack.push({ scene: name, ...d });
    }
    // The same finding in many scenes is one defect: keep the first scene and list the rest.
    const merged = new Map();
    for (const f of result[theme].failures) {
      const key = `${f.text}|${f.fg}|${f.bg}`;
      const m = merged.get(key);
      if (m) m.scenes.push(f.scene);
      else merged.set(key, { ...f, scenes: [f.scene] });
    }
    result[theme].failures = [...merged.values()];
  }
  const seen = new Set();
  result.dark.pureBlack = result.dark.pureBlack.filter((d) => (seen.has(`${d.el}|${d.bg}`) ? false : (seen.add(`${d.el}|${d.bg}`), true)));
  return result;
}

/** Printable lines of a result. */
export function reportContrast(result) {
  const lines = [];
  for (const theme of ["light", "dark"]) {
    const r = result[theme];
    lines.push(
      `CONTRAST ${theme}: ${r.checked} text nodes and placeholders checked, ${r.failures.length} below the ratio${theme === "dark" ? `, ${r.pureBlack.length} backgrounds darker than #1f1f1f` : ""}`
    );
    lines.push(
      `  ${theme} surfaces rendered: ${Object.entries(r.surfaces)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => k + " x" + n)
        .join(", ")}`
    );
    for (const f of r.failures) lines.push(`  ${theme} ${f.scenes.join(",")}: "${f.text}" (${f.kind}) ${f.fg} on ${f.bg} = ${f.ratio}:1, needs ${f.need}:1`);
    if (theme === "dark") for (const d of r.pureBlack) lines.push(`  dark ${d.scene}: ${d.el} background ${d.bg} is darker than #1f1f1f`);
  }
  return lines;
}
