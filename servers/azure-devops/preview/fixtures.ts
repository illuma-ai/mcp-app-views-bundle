/**
 * Fixture data for the local view preview. Mirrors the shape of the seeded Dev project (Basic
 * process): 2 epics, 8 issues, 12 tasks across Sprint 1 (current) and Sprint 2, plus a test plan
 * added in a later phase. Not part of the runtime path: nothing under src imports this.
 */

export interface FixtureItem {
  id: number;
  rev: number;
  type: "Epic" | "Issue" | "Task" | "Test Case" | "Feature" | "User Story" | "Bug";
  title: string;
  state: string;
  assignee?: string;
  tags?: string;
  parent?: number;
  effort?: number;
  remaining?: number;
  iteration?: "Sprint 1" | "Sprint 2" | "Iteration 1";
  /** Test cases: steps as "action|expected" lines and priority. */
  steps?: string[];
  priority?: number;
  rank: number;
}

const PEOPLE = ["Kavya H <kavya@gaavi.test>", "Marcus Webb <marcus@gaavi.test>", "Priya Nair <priya@gaavi.test>"];

export function buildItems(): FixtureItem[] {
  const items: FixtureItem[] = [
    { id: 1, rev: 3, type: "Epic", title: "Customer onboarding revamp", state: "Doing", assignee: PEOPLE[0], tags: "q4", rank: 1 },
    { id: 2, rev: 1, type: "Epic", title: "Reporting and exports", state: "To Do", rank: 2 },
  ];
  const issues: [string, string, number, number, string | undefined, "Sprint 1" | "Sprint 2" | undefined, string?][] = [
    ["Sign-up form validation", "Doing", 1, 3, PEOPLE[1], "Sprint 1", "frontend"],
    ["Welcome email sequence", "To Do", 1, 5, PEOPLE[2], "Sprint 1", "email; content"],
    ["Import existing accounts", "To Do", 1, 8, undefined, "Sprint 2"],
    ["SSO sign-in with the company directory", "Doing", 1, 5, PEOPLE[0], "Sprint 1", "security"],
    ["Onboarding checklist widget", "Done", 1, 2, PEOPLE[1], "Sprint 1"],
    ["CSV export of usage report", "To Do", 2, 3, undefined, "Sprint 2", "reports"],
    ["Scheduled weekly report email", "To Do", 2, 5, PEOPLE[2], undefined],
    ["Dashboard filters remember the last choice", "Doing", 2, 2, PEOPLE[0], "Sprint 1"],
  ];
  issues.forEach(([title, state, parent, effort, assignee, iteration, tags], i) => {
    items.push({ id: 10 + i, rev: 2, type: "Issue", title, state, parent, effort, assignee, iteration, tags, rank: 10 + i });
  });
  const tasks: [number, string, string, number, string | undefined][] = [
    [10, "Write the field rules", "Done", 0, PEOPLE[1]],
    [10, "Show inline error messages", "Doing", 3, PEOPLE[1]],
    [10, "Add unit tests", "To Do", 4, undefined],
    [11, "Draft the three emails", "Doing", 6, PEOPLE[2]],
    [11, "Set up the send schedule", "To Do", 2, PEOPLE[2]],
    [13, "Register the app with the directory", "Done", 0, PEOPLE[0]],
    [13, "Handle the callback", "Doing", 5, PEOPLE[0]],
    [13, "Sign-out and token refresh", "To Do", 4, PEOPLE[0]],
    [14, "Checklist component", "Done", 0, PEOPLE[1]],
    [17, "Persist filters per user", "Doing", 2, PEOPLE[0]],
    [17, "Reset filters control", "To Do", 1, undefined],
    [12, "Map the account fields", "To Do", 3, undefined],
  ];
  tasks.forEach(([parent, title, state, remaining, assignee], i) => {
    const parentItem = items.find((x) => x.id === parent);
    items.push({ id: 30 + i, rev: 1, type: "Task", title, state, parent, remaining, assignee, iteration: parentItem?.iteration, rank: 30 + i });
  });
  return items;
}

const DAY = 86_400_000;

/** Sprint 1 started on Monday of the current week and runs two weeks; Sprint 2 follows. */
export function buildIterations(now: Date = new Date()): unknown {
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  const iso = (d: number): string => new Date(d).toISOString();
  const s1 = monday.getTime();
  return {
    value: [
      { id: "it-1", name: "Sprint 1", path: "Dev\\Sprint 1", attributes: { startDate: iso(s1), finishDate: iso(s1 + 11 * DAY), timeFrame: "current" } },
      { id: "it-2", name: "Sprint 2", path: "Dev\\Sprint 2", attributes: { startDate: iso(s1 + 14 * DAY), finishDate: iso(s1 + 25 * DAY), timeFrame: "future" } },
    ],
  };
}

const STATES = [
  { name: "To Do", color: "b2b2b2", category: "Proposed" },
  { name: "Doing", color: "007acc", category: "InProgress" },
  { name: "Done", color: "339933", category: "Completed" },
];

/** Field list of a Basic-process type: the common fields plus these. */
function refs(...extra: string[]): { referenceName: string }[] {
  return ["System.Title", "System.Description", "Microsoft.VSTS.Common.Priority", ...extra].map((referenceName) => ({ referenceName }));
}

export const TYPES: Record<string, unknown> = {
  Epic: { name: "Epic", color: "FF7B00", icon: { id: "icon_crown" }, states: STATES, fields: refs("Microsoft.VSTS.Scheduling.StartDate", "Microsoft.VSTS.Scheduling.TargetDate") },
  Issue: { name: "Issue", color: "339933", icon: { id: "icon_clipboard" }, states: STATES, fields: refs("Microsoft.VSTS.Scheduling.Effort") },
  Task: { name: "Task", color: "F2CB1D", icon: { id: "icon_check_box" }, states: STATES, fields: refs("Microsoft.VSTS.Common.Activity", "Microsoft.VSTS.Scheduling.RemainingWork") },
};

export const LEVELS = [
  { id: "Microsoft.EpicCategory", name: "Epics", rank: 3, workItemTypes: [{ name: "Epic" }] },
  { id: "Microsoft.RequirementCategory", name: "Issues", rank: 2, workItemTypes: [{ name: "Issue" }] },
  { id: "Microsoft.TaskCategory", name: "Tasks", rank: 1, workItemTypes: [{ name: "Task" }] },
];

export interface FixturePlan {
  id: number;
  name: string;
  state: string;
  iteration: string;
  rootSuiteId: number;
}

export interface FixtureSuite {
  id: number;
  planId: number;
  name: string;
  parent?: number;
  cases: number[];
}

/** One test plan with a suite and three test cases, like the seeded Dev project. */
export function buildTestPlans(): { plans: FixturePlan[]; suites: FixtureSuite[]; cases: FixtureItem[] } {
  const cases: FixtureItem[] = [
    {
      id: 50,
      rev: 1,
      type: "Test Case",
      title: "Sign up with a valid email",
      state: "Design",
      priority: 1,
      rank: 50,
      steps: ["Open the sign-up page|The form is shown", "Enter a valid email and password|The fields accept the values", "Press Sign up|The account is created and a welcome page is shown"],
    },
    {
      id: 51,
      rev: 1,
      type: "Test Case",
      title: "Sign up rejects a short password",
      state: "Design",
      priority: 2,
      rank: 51,
      steps: ["Open the sign-up page|The form is shown", "Enter a 3 character password|An inline error explains the minimum length"],
    },
    {
      id: 52,
      rev: 1,
      type: "Test Case",
      title: "Welcome email arrives within a minute",
      state: "Ready",
      priority: 2,
      rank: 52,
      steps: ["Sign up with a new email|The sign-up succeeds", "Check the inbox|The welcome email arrives within one minute"],
    },
  ];
  return {
    plans: [{ id: 1, name: "Release 1 acceptance", state: "Active", iteration: "Dev\\Sprint 1", rootSuiteId: 10 }],
    suites: [
      { id: 10, planId: 1, name: "Release 1 acceptance", cases: [] },
      { id: 11, planId: 1, name: "Sign-up", parent: 10, cases: [50, 51, 52] },
    ],
    cases,
  };
}

/** A failing build's results for the results view. */
export function buildResults(): unknown[] {
  return [
    { id: 1, testCaseTitle: "SignUp.accepts_valid_email", outcome: "Passed", durationInMs: 420, runId: 7 },
    { id: 2, testCaseTitle: "SignUp.rejects_short_password", outcome: "Passed", durationInMs: 310, runId: 7 },
    {
      id: 3,
      testCaseTitle: "Welcome.email_arrives",
      outcome: "Failed",
      durationInMs: 61250,
      errorMessage: "Timed out after 60 s waiting for the welcome email",
      stackTrace: "at Welcome.waitForEmail (welcome.spec.ts:41)\n at Object.<anonymous> (welcome.spec.ts:18)",
      runId: 7,
    },
    { id: 4, testCaseTitle: "Reports.export_csv", outcome: "Aborted", durationInMs: 90, runId: 8 },
    { id: 5, testCaseTitle: "Reports.schedule_weekly", outcome: "NotExecuted", runId: 8 },
  ];
}

export interface FixturePull {
  id: number;
  title: string;
  status: "active" | "completed" | "abandoned";
  isDraft?: boolean;
  author: string;
  source: string;
  target: string;
  description: string;
  hoursAgo: number;
  reviewers: { name: string; vote: number; required?: boolean }[];
}

export const REPOS = [{ id: "11111111-2222-3333-4444-555555555555", name: "Dev" }];
export const BRANCHES = ["main", "feature/signup-validation", "feature/welcome-emails", "fix/login-redirect"];

export function buildPulls(): FixturePull[] {
  return [
    {
      id: 1,
      title: "Validate the sign-up form",
      status: "active",
      author: "Marcus Webb",
      source: "feature/signup-validation",
      target: "main",
      description: "Adds field rules and inline errors.\n\n- email format\n- password length\n\nCloses #10.",
      hoursAgo: 3,
      reviewers: [
        { name: "Kavya H", vote: 10, required: true },
        { name: "Priya Nair", vote: -5 },
        { name: "Alex Chen", vote: 0 },
      ],
    },
    {
      id: 2,
      title: "Welcome email sequence",
      status: "active",
      isDraft: true,
      author: "Priya Nair",
      source: "feature/welcome-emails",
      target: "main",
      description: "Work in progress.",
      hoursAgo: 26,
      reviewers: [{ name: "Kavya H", vote: 0 }],
    },
    {
      id: 3,
      title: "Fix the login redirect loop",
      status: "completed",
      author: "Kavya H",
      source: "fix/login-redirect",
      target: "main",
      description: "Fixes the loop after sign-out.",
      hoursAgo: 120,
      reviewers: [{ name: "Marcus Webb", vote: 10 }],
    },
  ];
}

export const PULL_FILES = [
  { path: "/src/forms/signup.ts", change: "edit" },
  { path: "/src/forms/rules.ts", change: "add" },
  { path: "/src/forms/legacy-validate.ts", change: "delete" },
  { path: "/test/forms/signup.test.ts", change: "add" },
];

// ---- pipelines ----------------------------------------------------------------------------------

const ago = (minutes: number): string => new Date(Date.now() - minutes * 60_000).toISOString();

/** Pipelines with their latest build, as the definition list returns them. */
export function buildDefinitions(): Record<string, unknown>[] {
  const builds = buildRuns();
  return [
    { id: 1, name: "Dev", path: "\\", latestBuild: builds.find((b) => (b.definition as { id: number }).id === 1) },
    { id: 2, name: "Release", path: "\\", latestBuild: builds.find((b) => (b.definition as { id: number }).id === 2) },
  ];
}

/** Builds, newest first, in the shape of the build list. */
export function buildRuns(): Record<string, unknown>[] {
  const base = { repository: { name: "Dev" }, requestedFor: { displayName: "Kavya H", uniqueName: "kavya@gaavi.test" } };
  return [
    {
      ...base,
      id: 3,
      buildNumber: "20261105.3",
      status: "inProgress",
      definition: { id: 2, name: "Release" },
      sourceBranch: "refs/heads/main",
      sourceVersion: "9f8e7d6c5b4a3210",
      reason: "manual",
      queueTime: ago(2),
      startTime: ago(1),
      triggerInfo: {},
    },
    {
      ...base,
      id: 2,
      buildNumber: "20261105.2",
      status: "completed",
      result: "succeeded",
      definition: { id: 2, name: "Release" },
      sourceBranch: "refs/heads/main",
      sourceVersion: "a1b2c3d4e5f60718",
      reason: "individualCI",
      queueTime: ago(60),
      startTime: ago(59),
      finishTime: ago(54),
      triggerInfo: { "ci.message": "Publish the welcome emails" },
    },
    {
      ...base,
      id: 1,
      buildNumber: "20261105.1",
      status: "completed",
      result: "failed",
      definition: { id: 1, name: "Dev" },
      sourceBranch: "refs/heads/main",
      sourceVersion: "4672446d5a1c9e03",
      reason: "individualCI",
      queueTime: ago(5),
      startTime: ago(5),
      finishTime: new Date(Date.now() - 5 * 60_000 + 600).toISOString(),
      triggerInfo: { "ci.message": "Set up CI with Azure Pipelines" },
    },
  ];
}

/** The timeline of a build: one stage, one job, and for the failed run the error the service reports. */
export function buildTimeline(buildId: number): Record<string, unknown>[] {
  const failed = buildId === 1;
  const start = ago(5);
  const finish = new Date(Date.now() - 5 * 60_000 + 600).toISOString();
  return [
    { id: "s1", type: "Stage", name: "Stage", state: "completed", result: failed ? "failed" : "succeeded", startTime: start, finishTime: finish, order: 1, issues: [] },
    { id: "p1", parentId: "s1", type: "Phase", name: "Job", state: "completed", result: failed ? "failed" : "succeeded", startTime: start, finishTime: finish, order: 1, issues: [] },
    {
      id: "j1",
      parentId: "p1",
      type: "Job",
      name: "Job",
      state: "completed",
      result: failed ? "failed" : "succeeded",
      startTime: start,
      finishTime: finish,
      order: 1,
      logId: failed ? undefined : 4,
      issues: failed
        ? [{ type: "error", message: "No hosted parallelism has been purchased or granted. Please set up billing or purchase parallel jobs. Learn more: https://aka.ms/ci-cd-concurrent-pipelines" }]
        : [],
    },
  ];
}

export const BUILD_LOG_LINES = ["Starting: Checkout Dev@main to s", "Syncing repository: Dev (Git)", "Finishing: Checkout Dev@main to s", "Starting: echo", "Hello, world!", "Finishing: echo"];

// ---- Agile process (project DevAgile) -----------------------------------------------------------

const AGILE_STATES = [
  { name: "New", color: "b2b2b2", category: "Proposed" },
  { name: "Active", color: "007acc", category: "InProgress" },
  { name: "Resolved", color: "ff9d00", category: "Resolved" },
  { name: "Closed", color: "339933", category: "Completed" },
  { name: "Removed", color: "ffffff", category: "Removed" },
];

const S = "Microsoft.VSTS.Scheduling.";
const C = "Microsoft.VSTS.Common.";

/** Field lists of the Agile types, as the type definitions report them. */
export const AGILE_TYPES: Record<string, unknown> = {
  "Epic": {
    name: "Epic",
    color: "FF7B00",
    icon: { id: "icon_crown" },
    states: AGILE_STATES,
    fields: refs(C + "Risk", S + "Effort", C + "BusinessValue", C + "TimeCriticality", C + "ValueArea", S + "StartDate", S + "TargetDate"),
  },
  "Feature": {
    name: "Feature",
    color: "773B93",
    icon: { id: "icon_trophy" },
    states: AGILE_STATES,
    fields: refs(C + "Risk", S + "Effort", C + "BusinessValue", C + "TimeCriticality", C + "ValueArea", S + "StartDate", S + "TargetDate"),
  },
  "User Story": {
    name: "User Story",
    color: "009CCC",
    icon: { id: "icon_book" },
    states: AGILE_STATES,
    fields: refs(S + "StoryPoints", C + "Risk", C + "ValueArea", C + "AcceptanceCriteria"),
  },
  "Bug": {
    name: "Bug",
    color: "CC293D",
    icon: { id: "icon_insect" },
    states: AGILE_STATES,
    fields: refs(
      C + "ResolvedReason",
      S + "StoryPoints",
      C + "Severity",
      C + "Activity",
      S + "OriginalEstimate",
      S + "RemainingWork",
      S + "CompletedWork",
      "Microsoft.VSTS.TCM.ReproSteps",
      "Microsoft.VSTS.TCM.SystemInfo",
      "Microsoft.VSTS.Build.FoundIn",
      "Microsoft.VSTS.Build.IntegrationBuild"
    ).filter((f) => f.referenceName !== "System.Description"),
  },
  "Task": { name: "Task", color: "F2CB1D", icon: { id: "icon_check_box" }, states: AGILE_STATES, fields: refs(C + "Activity", S + "OriginalEstimate", S + "RemainingWork", S + "CompletedWork") },
};

export const AGILE_LEVELS = [
  { id: "Microsoft.EpicCategory", name: "Epics", rank: 4, workItemTypes: [{ name: "Epic" }] },
  { id: "Microsoft.FeatureCategory", name: "Features", rank: 3, workItemTypes: [{ name: "Feature" }] },
  { id: "Microsoft.RequirementCategory", name: "Stories", rank: 2, workItemTypes: [{ name: "User Story" }] },
  { id: "Microsoft.TaskCategory", name: "Tasks", rank: 1, workItemTypes: [{ name: "Task" }] },
];

/** The seed of the DevAgile project: three user stories, a feature and a bug (items 25 to 29). */
export function buildAgileItems(): FixtureItem[] {
  return [
    { id: 25, rev: 1, type: "User Story", title: "As a finance user, I want a monthly CSV export of invoices", state: "New", rank: 3, iteration: "Iteration 1", assignee: PEOPLE[0], effort: 5 },
    { id: 26, rev: 1, type: "User Story", title: "As a customer, I want to pay an invoice by card", state: "New", rank: 2, iteration: "Iteration 1" },
    { id: 27, rev: 1, type: "User Story", title: "As an admin, I want overdue invoices flagged on the dashboard", state: "New", rank: 1, iteration: "Iteration 1" },
    { id: 28, rev: 1, type: "Feature", title: "Invoice management", state: "New", rank: 4 },
    { id: 29, rev: 1, type: "Bug", title: "Invoice total is wrong when a discount applies", state: "New", rank: 5 },
  ];
}

/** Iterations of the DevAgile team: none is current, so a new item starts at the project root as on the real page. */
export function buildAgileIterations(): unknown {
  return {
    value: [
      { id: "ai-1", name: "Iteration 1", path: "DevAgile\Iteration 1", attributes: { timeFrame: "future" } },
      { id: "ai-2", name: "Iteration 2", path: "DevAgile\Iteration 2", attributes: { timeFrame: "future" } },
      { id: "ai-3", name: "Iteration 3", path: "DevAgile\Iteration 3", attributes: { timeFrame: "future" } },
    ],
  };
}
