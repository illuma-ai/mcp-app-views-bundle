/**
 * The parity matrix source: one row per view and state, each compared with a real capture.
 *
 * A row renders `scene` in the preview at `width` and evaluates every item's `js` (run in the view
 * frame, with the helpers `__doc`, `__st`, `__byText`, `px`, `cs`, `click`, `sleep`). `expected` is the value
 * on the real page and `source` says where it came from:
 *   - "dom":     read from the real page's DOM and CSS by the owner (exact, tolerance 0);
 *   - "pixels":  measured on the capture file with the pixel tool (JPEG edges: tolerance 1).
 * `delta` is got minus expected for numbers. An item passes when the delta is within `tol` or the
 * item carries a `justified` text (shown in the matrix). `node bin/measure-views.mjs --parity` prints the
 * table, rewrites docs/parity-matrix.md with `--write`, and exits 4 on an unjustified difference.
 *
 * Rows without a capture are listed in NO_CAPTURE so the gap is explicit.
 */

import { AGILE_ROWS } from "./parity-spec-agile.mjs";

/** Capture folder, relative to the repository root of the workspace. */
export const CAPTURES = "m365-setup/reference/azure-devops";

const FORM_LABEL = `const l = __byText(/^State$/);`;

/** The shared checks of the work item form: the same page serves the new item form and the detail view. */
const formItems = (priorityText) => [
  { name: "header strip label font size", js: `const e = __byText(/^NEW (ISSUE|TASK|EPIC) \\*$/); return cs(e).fontSize;`, expected: "12px", source: "dom" },
  { name: "title input height", js: `return px(__doc().querySelector('input[aria-label="Title"]').parentElement).h;`, expected: 33, source: "dom" },
  { name: "title input font size", js: `return cs(__doc().querySelector('input[aria-label="Title"]')).fontSize;`, expected: "17px", source: "dom" },
  { name: "title placeholder", js: `return __doc().querySelector('input[aria-label="Title"]').placeholder;`, expected: "Enter title", source: "dom" },
  { name: "validation line", js: `return !!__byText(/^Field 'Title' cannot be empty\\.$/);`, expected: true, source: "dom" },
  { name: "header label font size", js: `${FORM_LABEL}; return cs(l).fontSize;`, expected: "12px", source: "dom" },
  {
    name: "header label colour",
    js: `${FORM_LABEL}; return cs(l).color;`,
    expected: "rgba(0, 0, 0, 0.55)",
    source: "dom",
    justified: "labels use the theme token colorNeutralForeground3 (#616161 light, #adadad dark) so they stay readable in the dark theme; the real page fixes rgba(0,0,0,.55)",
  },
  { name: "header label column width", js: `${FORM_LABEL}; return cs(l.parentElement).gridTemplateColumns.split(' ')[0];`, expected: "60px", source: "dom" },
  { name: "header row height", js: `${FORM_LABEL}; return px(l.parentElement).h;`, expected: 31, source: "dom" },
  { name: "header value font size", js: `${FORM_LABEL} const v = l.nextElementSibling; return cs(v).fontSize;`, expected: "14px", source: "dom" },
  { name: "header value at rest has no border", js: `${FORM_LABEL} const v = l.nextElementSibling; return cs(v).borderTopColor === 'rgba(0, 0, 0, 0)';`, expected: true, source: "dom" },
  { name: "section title font size", js: `return cs(__byText(/^Description$/, 'h2')).fontSize;`, expected: "16px", source: "dom" },
  { name: "section title weight", js: `return cs(__byText(/^Description$/, 'h2')).fontWeight;`, expected: "600", source: "dom" },
  { name: "section title divider", js: `return cs(__byText(/^Description$/, 'h2').parentElement).borderBottomWidth;`, expected: "1px", source: "dom" },
  { name: "planning label font size", js: `return cs(__byText(/^Priority$/)).fontSize;`, expected: "12px", source: "dom" },
  { name: "Priority value", js: `const l = __byText(/^Priority$/); return l.nextElementSibling.textContent.trim();`, expected: priorityText, source: "dom" },
  { name: "planning value font size", js: `const l = __byText(/^Priority$/); return cs(l.nextElementSibling).fontSize;`, expected: "14px", source: "dom" },
  {
    name: "editor height after a click (Priority)",
    js: `const l = __byText(/^Priority$/); l.nextElementSibling.click(); await sleep(250); const d = __doc().querySelector('[role=combobox][aria-label="Priority"], input[aria-label="Priority"]'); return px(d.closest('.fui-Dropdown, .fui-Input') || d).h;`,
    expected: 29,
    source: "dom",
    tol: 0,
  },
];

export const ROWS = [
  {
    id: "new-item.blank.900",
    view: "New work item form",
    state: "blank, 900px",
    scene: "view=new-item&scenario=blank",
    width: 900,
    capture: "18-new-task-form-real.jpg",
    items: formItems("2").filter((i) => !i.name.startsWith("editor height")),
  },
  {
    id: "new-item.edit-priority.900",
    view: "New work item form",
    state: "Priority in edit mode, 900px",
    scene: "view=new-item&scenario=blank",
    width: 900,
    capture: "19-new-task-priority-edit-real.jpg",
    items: formItems("2").filter((i) => i.name.startsWith("editor height")),
  },
  {
    id: "new-item.description-editor.900",
    view: "New work item form",
    state: "Description editor open, 900px",
    scene: "view=new-item&scenario=blank",
    width: 900,
    capture: "21-new-task-description-editor-real.jpg",
    items: [
      { name: "placeholder text", js: `return !!__byText(/^Click to add Description\\.$/);`, expected: true, source: "dom" },
      {
        name: "toolbar and Markdown switch after a click",
        js: `__byText(/^Click to add Description\\.$/).click(); await sleep(300); const d = __doc(); return !!d.querySelector('[role=toolbar][aria-label=Formatting]') && !!__byText(/^switch to Markdown editor$/, 'button');`,
        expected: true,
        source: "dom",
      },
    ],
  },
  {
    id: "new-item.narrow.326",
    view: "New work item form",
    state: "phone-width frame (326px), the header grid stacks",
    scene: "view=new-item&scenario=blank",
    width: 326,
    capture: "../live/ado-new-item-form-390px.png",
    items: [
      { name: "header grid columns", js: `const l = __byText(/^State$/); return cs(l.parentElement.parentElement).gridTemplateColumns.split(' ').length;`, expected: 1, source: "dom" },
      {
        name: "no element runs past the frame",
        js: `const w = document.querySelector('iframe').clientWidth; return [...__doc().querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > w + 1; }).length;`,
        expected: 0,
        source: "dom",
      },
    ],
  },
  {
    id: "work-item.task.900",
    view: "Work item detail (Task)",
    state: "Task 31, 900px",
    scene: "view=work-item&id=31",
    width: 900,
    capture: "16-task-detail-real.jpg",
    items: formItems("2")
      .filter((i) => !["header strip label font size", "validation line", "title placeholder", "editor height after a click (Priority)"].includes(i.name))
      .concat([
        { name: "Planning has Activity", js: `return !!__byText(/^Activity$/);`, expected: true, source: "dom" },
        { name: "Discussion placeholder", js: `return !!__doc().querySelector('textarea[placeholder^="Add a comment. Use # to link a work item"]');`, expected: true, source: "dom" },
        { name: "switch to Markdown editor link", js: `return !!__byText(/^switch to Markdown editor$/, 'button');`, expected: true, source: "dom" },
      ]),
  },
  {
    id: "work-item.epic.900",
    view: "Work item detail (Epic)",
    state: "Epic 1, 900px",
    scene: "view=work-item&id=1",
    width: 900,
    capture: "17-epic-detail-real.jpg",
    items: [
      { name: "Planning has Start Date", js: `return !!__byText(/^Start Date$/);`, expected: true, source: "dom" },
      { name: "Planning has Target Date", js: `return !!__byText(/^Target Date$/);`, expected: true, source: "dom" },
      { name: "date placeholder", js: `return !!__byText(/^Select a date\\.\\.\\.$/);`, expected: true, source: "dom" },
      {
        name: "Add an existing work item as a parent",
        js: `return !!__byText(/^Add an existing work item as a parent$/, 'button') || !!__byText(/^Add an existing work item as a parent$/);`,
        expected: true,
        source: "dom",
      },
      { name: "Child group", js: `return !!__byText(/^Child$/);`, expected: true, source: "dom" },
    ],
  },
  {
    id: "pull-requests.list.900",
    view: "Pull requests",
    state: "list, Active tab, 900px",
    scene: "view=pull-requests",
    width: 900,
    capture: "12-pr-list-real.jpg",
    items: [
      { name: "New pull request button height", js: `return px(__byText(/^New pull request$/, 'button')).h;`, expected: 30, source: "pixels", tol: 1 },
      { name: "tabs", js: `return tabs();`, expected: "Mine,Active,Completed,Abandoned", source: "dom" },
      { name: "filter row height", js: `return px(__doc().querySelector('[role=search]')).h;`, expected: 52, source: "pixels", tol: 1 },
      { name: "row height", js: `return px(__doc().querySelector('[data-testid^=pr-]')).h;`, expected: 80, source: "pixels", tol: 1 },
    ],
  },
  {
    id: "pull-requests.detail.900",
    view: "Pull request detail",
    state: "Overview, 900px",
    scene: "view=pull-requests&id=1",
    width: 900,
    capture: "11-pr-detail-real.jpg",
    items: [
      { name: "Complete button height", js: `return px(__byText(/^Complete$/, 'button')).h;`, expected: 29, source: "pixels", tol: 1 },
      { name: "merge banner height", js: `return px(__byText(/^No merge conflicts$/).parentElement.parentElement).h;`, expected: 66, source: "pixels", tol: 1 },
      { name: "tabs", js: `return tabs();`, expected: "Overview,Files,Updates,Commits", source: "dom" },
      { name: "rail groups", js: `return ['Reviewers','Required','Optional','Tags','Work items'].every((t) => !!__byText(new RegExp('^' + t + '$')));`, expected: true, source: "dom" },
    ],
  },
  {
    id: "pipelines.list.900",
    view: "Pipelines",
    state: "Recent tab, 900px",
    scene: "view=pipelines",
    width: 900,
    capture: "14-pipelines-list-real.jpg",
    items: [
      { name: "New pipeline button height", js: `return px(__byText(/^New pipeline$/, 'button')).h;`, expected: 30, source: "pixels", tol: 1 },
      { name: "tabs", js: `return tabs();`, expected: "Recent,All,Runs", source: "dom" },
      { name: "card title", js: `return !!__byText(/^Recently run pipelines$/);`, expected: true, source: "dom" },
    ],
  },
  {
    id: "pipelines.runs.900",
    view: "Pipeline runs",
    state: "Runs tab, 900px",
    scene: "view=pipelines&pipeline=1",
    width: 900,
    capture: "15-pipeline-runs-real.jpg",
    items: [
      { name: "Run pipeline button height", js: `return px(__byText(/^Run pipeline$/, 'button')).h;`, expected: 30, source: "pixels", tol: 1 },
      { name: "card height (one run)", js: `return px(__doc().querySelector('[aria-label=Runs]')).h;`, expected: 109, source: "pixels", tol: 1 },
      { name: "tabs", js: `return tabs();`, expected: "Runs,Stages,Branches,Analytics", source: "dom" },
    ],
  },
  {
    id: "pipelines.run.900",
    view: "Pipeline run",
    state: "failed run, Summary, 900px",
    scene: "view=pipelines&run=1",
    width: 900,
    capture: "13-pipeline-run-detail-real.jpg",
    items: [
      { name: "Run new button height", js: `return px(__byText(/^Run new$/, 'button')).h;`, expected: 30, source: "pixels", tol: 1 },
      {
        name: "info banner height",
        js: `return px(__byText(/^This run will be cleaned up after 1 month based on your project settings\\.$/).parentElement).h;`,
        expected: 63,
        source: "pixels",
        tol: 1,
      },
      { name: "summary card sections", js: `return ['Repository and version','Related','Tests and coverage'].every((t) => !!__byText(new RegExp('^' + t + '$')));`, expected: true, source: "dom" },
      { name: "Errors list", js: `return !!__byText(/^View documentation for troubleshooting failed runs$/, 'button');`, expected: true, source: "dom" },
    ],
  },
];

/** States with no capture yet: listed in the matrix so the gap is explicit. */
export const NO_CAPTURE = [
  ["Board", "column menu, card context menu, WIP limit"],
  ["Board / Backlog", "loading state (01 exists for the backlog only; compared by eye)"],
  ["Sprint taskboard", "populated taskboard"],
  ["Work item detail", "History tab, Links tab, Attachments tab with files, edit mode of State/Iteration dropdown (20 exists for the new form)"],
  ["Work item list / Query results", "any"],
  ["Pull request list", "Mine, Completed and Abandoned tabs, empty state, filter row with a value"],
  ["Pull request detail", "Files, Updates and Commits tabs, description edit mode, Complete dialog, Approve menu, reviewer picker, discussion threads, conflict and policy banners"],
  ["New pull request form", "the real create form"],
  ["Pipelines", "All and Runs tabs, empty state with data elsewhere, filter with a value"],
  ["Pipeline runs", "Stages, Branches and Analytics tabs; Run pipeline dialog (the real dialog)"],
  ["Pipeline run", "Jobs tab, a log, a succeeded and an in-progress run"],
  ["Test plans", "everything beyond the licence wall (08); the real plan, suite and case views need an org with Test Plans"],
  [
    "Agile process",
    "agile-07 (a filled User Story page) is pending; Epic and Task forms, the Bugs backlog and board, Features and Epics backlogs, the Bug and Feature detail pages with real data, and the Agile sprint taskboard",
  ],
  ["All views", "360px and 640px captures of the real pages (only a 390px capture of the new item form exists)"],
];

/** Interaction rows: a click must do what the real page does (they run in the same pass as the matrix). */
ROWS.push(
  {
    id: "pipelines.run.run-new",
    view: "Pipeline run",
    state: "Run new opens the pre-filled run form, 900px",
    scene: "view=pipelines&run=1",
    width: 900,
    capture: "13-pipeline-run-detail-real.jpg",
    items: [
      { name: "Run new opens the form", js: `__byText(/^Run new$/, 'button').click(); await sleep(1500); return !!__byText(/^RUN PIPELINE .$/);`, expected: true, source: "dom" },
      {
        name: "form shows Branch/tag, Variables and a Run button",
        js: `return !!__byText(/^Branch.tag$/, 'label') && !!__byText(/^Variables/, 'label') && !!__byText(/^Run$/, 'button');`,
        expected: true,
        source: "dom",
      },
    ],
  },
  {
    id: "pipelines.run.run-sends-one-write",
    view: "Pipeline run",
    state: "Run in the form issues exactly one pipelines_write call, 900px",
    scene: "view=pipelines&run=1",
    width: 900,
    capture: "13-pipeline-run-detail-real.jpg",
    items: [
      {
        name: "exactly one approved write and a created panel",
        js: `__byText(/^Run new$/, 'button').click(); await sleep(1500); __byText(/^Run$/, 'button').click(); await sleep(1800); const n = [...document.querySelectorAll('.log li')].filter((l) => l.textContent === 'approved: pipelines_write').length; return n === 1 && !!__byText(/^Run 4 created$/, 'strong');`,
        expected: true,
        source: "dom",
      },
    ],
  },
  {
    id: "pipelines.runs.run-pipeline",
    view: "Pipeline runs",
    state: "Run pipeline opens the run form, 900px",
    scene: "view=pipelines&pipeline=1",
    width: 900,
    capture: "15-pipeline-runs-real.jpg",
    items: [{ name: "Run pipeline opens the form", js: `__byText(/^Run pipeline$/, 'button').click(); await sleep(1500); return !!__byText(/^RUN PIPELINE .$/);`, expected: true, source: "dom" }],
  }
);

ROWS.push(...AGILE_ROWS);
