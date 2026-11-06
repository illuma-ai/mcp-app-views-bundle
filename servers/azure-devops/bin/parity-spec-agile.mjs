/**
 * Parity rows of the Agile process (project DevAgile), compared with captures agile-01 to agile-06 and the
 * "Agile process" section of words.md. The views learn the project from the opening tool call (the scenario
 * passes project "DevAgile"), so these rows also prove the views follow a project other than the default.
 * Order checks use `inOrder`: the listed lines must appear in that order in the view's text.
 */

const sections = (...titles) => ({ name: "section titles in order", js: `return inOrder(${JSON.stringify(titles)});`, expected: true, source: "dom" });
const labels = (name, ...list) => ({ name, js: `return inOrder(${JSON.stringify(list)});`, expected: true, source: "dom" });

const header = (type) => [
  { name: `header strip "NEW ${type.toUpperCase()} *"`, js: `return !!__byText(/^NEW ${type.toUpperCase()} .$/);`, expected: true, source: "dom" },
  { name: "validation line", js: `return !!__byText(/^Field 'Title' cannot be empty..$/) || !!__byText(/^Field 'Title' cannot be empty\\.$/);`, expected: true, source: "dom" },
  labels("header fields in order", "State", "New", "Area", "DevAgile", "Reason", "New", "Iteration", "DevAgile"),
  { name: "project of the view", js: `return __byText(/^Area$/).nextElementSibling.textContent.trim();`, expected: "DevAgile", source: "dom" },
];

export const AGILE_ROWS = [
  {
    id: "agile.bug-form.900",
    view: "New Bug form (Agile)",
    state: "blank, 900px",
    scene: "view=new-item&scenario=agile&type=Bug",
    width: 900,
    capture: "agile-01-bug-form-real.jpg",
    items: [
      ...header("Bug"),
      sections("Repro Steps", "System Info", "Discussion", "Planning", "Effort (Hours)", "Deployment", "Development", "Related Work", "Build"),
      { name: "Repro Steps placeholder", js: `return !!__byText(/^Click to add Repro Steps\\.$/);`, expected: true, source: "dom" },
      { name: "System Info placeholder", js: `return !!__byText(/^Click to add System Info\\.$/);`, expected: true, source: "dom" },
      labels("Planning fields in order", "Planning", "Resolved Reason", "Story Points", "Priority", "2", "Severity", "3 - Medium", "Activity", "Effort (Hours)"),
      labels("Effort (Hours) fields", "Effort (Hours)", "Original Estimate", "Remaining", "Completed"),
      labels("Build group after Related Work", "Related Work", "Found in Build", "Integrated in Build"),
      { name: "no Description section", js: `return !__byText(/^Description$/, 'h2');`, expected: true, source: "dom" },
    ],
  },
  {
    id: "agile.bug-form-editing.900",
    view: "New Bug form (Agile)",
    state: "Repro Steps in edit mode, 900px",
    scene: "view=new-item&scenario=agile&type=Bug",
    width: 900,
    capture: "agile-02-bug-form-editing-real.jpg",
    items: [
      {
        name: "editor with toolbar and the markdown note",
        js: `__byText(/^Click to add Repro Steps\.$/).click(); await sleep(400); return !!__doc().querySelector('[role=toolbar][aria-label=Formatting]') && lines().includes('We support markdown, you can') && !!__byText(/^convert this field$/, 'button');`,
        expected: true,
        source: "dom",
      },
    ],
  },
  {
    id: "agile.story-form.900",
    view: "New User Story form (Agile)",
    state: "blank, 900px",
    scene: "view=new-item&scenario=agile&type=User%20Story",
    width: 900,
    capture: "agile-03-user-story-form-real.jpg",
    items: [
      ...header("User Story"),
      sections("Description", "Acceptance Criteria", "Discussion", "Planning", "Classification", "Deployment", "Development", "Related Work"),
      { name: "Description placeholder", js: `return !!__byText(/^Click to add Description\\.$/);`, expected: true, source: "dom" },
      { name: "Acceptance Criteria placeholder", js: `return !!__byText(/^Click to add Acceptance Criteria\\.$/);`, expected: true, source: "dom" },
      labels("Planning fields in order", "Planning", "Story Points", "Priority", "2", "Risk", "Classification", "Value area", "Business"),
      { name: "Discussion comment box", js: `return !!__doc().querySelector('textarea[placeholder^="Add a comment. Use # to link a work item"]');`, expected: true, source: "dom" },
    ],
  },
  {
    id: "agile.feature-form.900",
    view: "New Feature form (Agile)",
    state: "blank, 900px",
    scene: "view=new-item&scenario=agile&type=Feature",
    width: 900,
    capture: "agile-04-feature-form-real.jpg",
    items: [
      ...header("Feature"),
      sections("Description", "Discussion", "Planning", "Classification", "Deployment", "Development", "Related Work"),
      labels("Planning fields in order", "Planning", "Priority", "2", "Risk", "Effort", "Business Value", "Time Criticality", "Start Date", "Target Date", "Classification", "Value area", "Business"),
      {
        name: "date placeholders",
        js: `return [...__doc().querySelectorAll('span')].filter((e) => !e.querySelector('span') && e.textContent.trim() === 'Select a date...').length;`,
        expected: 2,
        source: "dom",
      },
    ],
  },
  {
    id: "agile.bug-detail.900",
    view: "Bug detail (Agile)",
    state: "Bug 29, 900px (the real filled page, agile-07, is still to come: structure compared with agile-01)",
    scene: "view=work-item&id=29&scenario=agile",
    width: 900,
    capture: "agile-01-bug-form-real.jpg",
    items: [
      labels("header fields in order", "State", "New", "Area", "DevAgile", "Reason", "New", "Iteration", "DevAgile"),
      sections("Repro Steps", "System Info", "Discussion", "Planning", "Effort (Hours)", "Deployment", "Development", "Related Work", "Build"),
      labels("Planning fields in order", "Planning", "Resolved Reason", "Story Points", "Priority", "Severity", "Activity", "Effort (Hours)"),
      { name: "project of the view", js: `return __byText(/^Area$/).nextElementSibling.textContent.trim();`, expected: "DevAgile", source: "dom" },
    ],
  },
  {
    id: "agile.story-detail.900",
    view: "User Story detail (Agile)",
    state: "User Story 25, 900px (agile-07 to come: structure compared with agile-03)",
    scene: "view=work-item&id=25&scenario=agile",
    width: 900,
    capture: "agile-03-user-story-form-real.jpg",
    items: [
      sections("Description", "Acceptance Criteria", "Discussion", "Planning", "Classification", "Deployment", "Development", "Related Work"),
      labels("Planning fields in order", "Planning", "Story Points", "Priority", "Risk", "Classification", "Value area"),
    ],
  },
  {
    id: "agile.backlog.900",
    view: "Stories backlog (Agile)",
    state: "3 user stories, 900px",
    scene: "view=backlog&scenario=agile",
    width: 900,
    capture: "agile-05-stories-backlog-real.jpg",
    items: [
      labels("title", "DevAgile Team"),
      labels("columns in order", "Order", "Work Item Type", "Title", "State", "Story Points"),
      { name: "rows", js: `return [...__doc().querySelectorAll('[data-testid^=row-]')].length;`, expected: 3, source: "dom" },
      {
        name: "first row",
        js: `const r = __doc().querySelector('[data-testid=row-27]'); return r ? r.innerText.replace(/\\s+/g, ' ').trim() : 'no row';`,
        expected: "1 User Story As an admin, I want overdue invoices flagged on the dashboard New",
        source: "dom",
      },
      labels("Planning pane", "Planning", "Iteration 1", "Iteration 2", "Iteration 3", "New Sprint"),
      { name: "level picker", js: `return !!__byText(/^Stories$/, 'button');`, expected: true, source: "dom" },
    ],
  },
  {
    id: "agile.board.900",
    view: "Stories board (Agile)",
    state: "3 user stories in New, 900px",
    scene: "view=board&scenario=agile",
    width: 900,
    capture: "agile-06-stories-board-real.jpg",
    items: [
      labels("columns in order", "New", "Active", "Resolved", "Closed"),
      {
        name: "no Removed column",
        js: `return [...__doc().querySelectorAll('[data-lane]')].map((e) => e.getAttribute('data-lane')).join(',');`,
        expected: "New,Active,Resolved,Closed",
        source: "dom",
      },
      { name: "cards in New", js: `return [...__doc().querySelectorAll('[data-testid^=card-]')].length;`, expected: 3, source: "dom" },
      {
        name: "card text",
        js: `const c = __doc().querySelector('[data-testid=card-27]'); return c ? c.innerText.replace(/\\s+/g, ' ').trim() : 'no card';`,
        expected: "27 As an admin, I want overdue invoices flagged on the dashboard New",
        source: "dom",
      },
      {
        name: "columns with a limit (Active and Resolved show 0/5)",
        js: `return [...__doc().querySelectorAll('[aria-label="Work in progress limit"]')].map((e) => e.textContent.trim()).join(',');`,
        expected: "0/5,0/5",
        source: "dom",
      },
    ],
  },
];

AGILE_ROWS.push({
  id: "agile.board-card.1180",
  view: "Stories board (Agile)",
  state: "card layout at a frame wide enough for 267px columns, 1180px",
  scene: "view=board&scenario=agile",
  width: 1180,
  capture: "agile-06-stories-board-real.jpg",
  items: [
    { name: "card 27 width", js: `return px(__doc().querySelector('[data-testid=card-27]')).w;`, expected: 267, source: "pixels", tol: 1 },
    { name: "card 27 height", js: `return px(__doc().querySelector('[data-testid=card-27]')).h;`, expected: 83, source: "pixels", tol: 1 },
    {
      name: "title is one text run with the id (no narrow right column)",
      js: `const c = __doc().querySelector('[data-testid=card-27]'); const t = [...c.querySelectorAll('span')].find((e) => e.textContent.includes('As an admin')); return t.getBoundingClientRect().width > c.getBoundingClientRect().width * 0.5;`,
      expected: true,
      source: "dom",
    },
  ],
});

AGILE_ROWS.push({
  id: "agile.board-card-details.1180",
  view: "Stories board (Agile)",
  state: "card with an assignee and Story Points, 1180px",
  scene: "view=board&scenario=agile",
  width: 1180,
  capture: "agile-06-stories-board-real.jpg",
  items: [
    {
      name: "card shows the assignee's name under the state and the Story Points row",
      js: `const c = __doc().querySelector('[data-testid=card-25]'); return c ? c.innerText.split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean).join(' | ') : 'no card';`,
      expected: "25 As a finance user, I want a monthly CSV export of invoices | New | KH | Kavya H | Story Points | 5",
      source: "dom",
    },
  ],
});
