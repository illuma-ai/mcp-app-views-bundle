/**
 * The views' only way to reach the server: App-initiated tool calls through the host.
 *
 * Reads run without a prompt (policy allow). Every write goes through a method listed in
 * WRITE_METHODS, runs as a normal tools/call that the host shows for approval with its full
 * arguments, and is only ever started from an explicit user gesture (Create, Save, Move, Add...).
 * A test enumerates the view sources and fails if a write tool or write method is reachable
 * anywhere else.
 */
import { type ToolResultLike, parseToolResult } from "./result";
import { BOUND_KEYS, type ReviewGrant, formatToken } from "./review";
import { FIELD, LIST_FIELDS, type WorkItem, type TypeInfo, toTypeInfo, wiqlForTypes } from "./work-items";

/** Tool names the views call. Reads first, then writes. */
export const TOOL = {
  workItem: "wit_work_item",
  query: "wit_query",
  backlog: "wit_backlog",
  work: "work",
  teams: "core_list_project_teams",
  workItemWrite: "wit_work_item_write",
  commentWrite: "wit_work_item_comment_write",
  linkWrite: "wit_work_item_link_write",
  backlogWrite: "wit_backlog_write",
  iterationWrite: "work_iteration_write",
  testplan: "testplan",
  testResults: "testplan_show_test_results_from_build_id",
  planWrite: "testplan_test_plan_write",
  suiteWrite: "testplan_test_suite_write",
  caseWrite: "testplan_test_case_write",
  pr: "repo_pull_request",
  prThread: "repo_pull_request_thread",
  prWrite: "repo_pull_request_write",
  prThreadWrite: "repo_pull_request_thread_write",
  repos: "repo_repository",
  branches: "repo_branch",
  identities: "core_get_identity_ids",
  currentUser: "core_get_current_user",
  build: "pipelines_build",
  buildLog: "pipelines_build_log",
  definitions: "pipelines_definition",
  pipelinesWrite: "pipelines_write",
} as const;

/** Every tool that changes data. Views may call these only from explicit buttons. */
export const WRITE_TOOLS: ReadonlySet<string> = new Set([TOOL.workItemWrite, TOOL.commentWrite, TOOL.linkWrite, TOOL.backlogWrite, TOOL.iterationWrite]);

/** The AdoApi methods that perform a write (each ends in one WRITE_TOOLS call). */
export const WRITE_METHODS = [
  "createWorkItem",
  "setState",
  "updateWorkItem",
  "addComment",
  "reorder",
  "setIterationDates",
  "createSprint",
  "createTestPlan",
  "createSuite",
  "createTestCase",
  "updateSteps",
  "createPullRequest",
  "votePullRequest",
  "commentOnPullRequest",
  "setThreadStatus",
  "updatePullRequest",
  "completePullRequest",
  "runPipeline",
  "addReviewer",
  "removeReviewer",
  "setLabels",
  "linkWorkItem",
  "unlinkWorkItem",
] as const;

/** What the views need from the host connection; main.tsx adapts the SDK `App` to this. */
export interface HostBridge {
  callTool(name: string, args: Record<string, unknown>): Promise<ToolResultLike>;
  openLink(url: string): Promise<void>;
  sendMessage(text: string): Promise<void>;
  canCallTools(): boolean;
  canOpenLinks(): boolean;
  canMessage(): boolean;
}

/** Inlined by the server into each view document. */
export interface ViewConfig {
  org: string;
  project: string;
  team: string;
  /** Tools that exist on this server (domain filter), so a view disables what it cannot call. */
  tools: string[];
  /** Proof that a write comes from this view's own button; sent with the guarded writes. */
  review?: ReviewGrant;
}

export class AdoApi {
  private types = new Map<string, Promise<TypeInfo | undefined>>();

  /** The server's default project and team: the scope when the opening tool call names none. */
  private readonly defaults: { project: string; team: string };

  constructor(
    readonly host: HostBridge,
    public config: ViewConfig
  ) {
    this.defaults = { project: config.project, team: config.team };
  }

  /**
   * Points every later call at the project (and team) the opening tool call named, so a model that
   * passes project "DevAgile" gets that project's data from the view too. Without one the server default
   * applies. Only plain project names are accepted; the call itself was already approved by the host.
   * Type information is process specific, so it is dropped when the scope changes.
   */
  setScope(project: unknown, team: unknown): void {
    const ok = (v: unknown): v is string => typeof v === "string" && /^[\w][\w .-]{0,63}$/.test(v.trim());
    const nextProject = ok(project) ? project.trim() : this.defaults.project;
    const nextTeam = ok(team) ? team.trim() : nextProject === this.defaults.project ? this.defaults.team : `${nextProject} Team`;
    if (nextProject === this.config.project && nextTeam === this.config.team) return;
    this.config = { ...this.config, project: nextProject, team: nextTeam };
    this.types.clear();
  }

  /** True when the host can run tools and the server exposes this tool. */
  can(tool: string): boolean {
    return this.host.canCallTools() && this.config.tools.includes(tool);
  }

  async call<T = unknown>(tool: string, args: Record<string, unknown>): Promise<T> {
    if (!this.config.tools.includes(tool)) throw new Error("This action is not available on this server.");
    // Every call names the project explicitly: the scope set from the opening tool call, or the server default.
    if ("project" in args && !args.project) throw new Error("No default project is configured on the server (ADO_MCP_PROJECT).");
    // A guarded write carries the review proof for exactly these arguments (see review.ts).
    if (BOUND_KEYS[tool] && this.config.review) args = { ...args, reviewToken: formatToken(this.config.review, tool, args) };
    const parsed = parseToolResult<T>(await this.host.callTool(tool, args));
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.data === undefined) {
      throw new Error(parsed.text ? `Unexpected result: ${parsed.text.slice(0, 200)}` : "The tool returned no data.");
    }
    return parsed.data;
  }

  // ---- reads ----------------------------------------------------------------------------------

  /** A work item type with its colour and ordered states (cached per view). */
  workItemType(name: string): Promise<TypeInfo | undefined> {
    let p = this.types.get(name);
    if (!p) {
      p = this.call(TOOL.workItem, {
        action: "get_type",
        project: this.config.project,
        workItemType: name,
      })
        .then(toTypeInfo)
        .catch(() => undefined);
      this.types.set(name, p);
    }
    return p;
  }

  /** The team's backlog levels (Epics, Issues, Tasks...). */
  backlogLevels(): Promise<unknown> {
    return this.call(TOOL.backlog, { action: "list", project: this.config.project, team: this.config.team });
  }

  /** Ids of the items of the given types in backlog order. */
  async idsOfTypes(types: string[], top = 200): Promise<number[]> {
    const result = await this.call<{ workItems?: { id?: number }[] }>(TOOL.query, {
      action: "wiql",
      project: this.config.project,
      team: this.config.team,
      wiql: wiqlForTypes(types),
      top,
    });
    return (result.workItems ?? []).map((w) => w.id).filter((id): id is number => typeof id === "number");
  }

  /** The list fields of many items, in chunks the batch endpoint accepts. */
  async batch(ids: number[], fields: string[] = LIST_FIELDS): Promise<WorkItem[]> {
    const out: WorkItem[] = [];
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const page = await this.call<WorkItem[]>(TOOL.workItem, {
        action: "get_batch",
        project: this.config.project,
        ids: chunk,
        fields,
      });
      out.push(...(Array.isArray(page) ? page : []));
    }
    return out;
  }

  /** One work item with all fields and relations. */
  getWorkItem(id: number): Promise<WorkItem & { relations?: unknown[] }> {
    return this.call(TOOL.workItem, { action: "get", project: this.config.project, id, expand: "All" });
  }

  /** The comments of a work item. */
  comments(workItemId: number): Promise<unknown> {
    return this.call(TOOL.workItem, { action: "list_comments", project: this.config.project, workItemId, top: 100 });
  }

  /** The revisions of a work item (history). */
  revisions(workItemId: number): Promise<unknown> {
    return this.call(TOOL.workItem, { action: "list_revisions", project: this.config.project, workItemId, top: 100 });
  }

  /** The signed-in user's work items. */
  myWorkItems(): Promise<unknown> {
    return this.call(TOOL.workItem, { action: "my", project: this.config.project, top: 100 });
  }

  /** Pull requests of the project with the given status (Active, Completed, Abandoned or All). */
  pullRequests(status: string): Promise<unknown> {
    return this.call(TOOL.pr, { action: "list", project: this.config.project, status, top: 50 });
  }

  /** One pull request with reviewers, labels, linked work items and changed files. */
  pullRequest(repositoryId: string, pullRequestId: number): Promise<Record<string, unknown>> {
    return this.call(TOOL.pr, { action: "get", repositoryId, pullRequestId, project: this.config.project, includeChangedFiles: true, includeLabels: true, includeWorkItemRefs: true });
  }

  /** A pull request without the changed files, labels and work items (cheap: used to read reviewers for the list). */
  pullRequestBrief(repositoryId: string, pullRequestId: number): Promise<Record<string, unknown>> {
    return this.call(TOOL.pr, { action: "get", repositoryId, pullRequestId, project: this.config.project });
  }

  /** The updates (iterations) of a pull request. */
  pullUpdates(repositoryId: string, pullRequestId: number): Promise<unknown> {
    return this.call(TOOL.pr, { action: "list_iterations", repositoryId, pullRequestId, project: this.config.project });
  }

  /** The commits of a pull request. */
  pullCommits(repositoryId: string, pullRequestId: number): Promise<unknown> {
    return this.call(TOOL.pr, { action: "list_commits", repositoryId, pullRequestId, project: this.config.project });
  }

  /** Active pull requests the signed-in user created or reviews (the Mine tab). */
  async myPullRequests(): Promise<unknown[]> {
    const [created, reviewing] = await Promise.all([
      this.call<unknown[]>(TOOL.pr, { action: "list", project: this.config.project, status: "Active", top: 50, created_by_me: true }),
      this.call<unknown[]>(TOOL.pr, { action: "list", project: this.config.project, status: "Active", top: 50, i_am_reviewer: true }),
    ]);
    const seen = new Set<number>();
    return [...(Array.isArray(created) ? created : []), ...(Array.isArray(reviewing) ? reviewing : [])].filter((p) => {
      const id = Number((p as { pullRequestId?: number }).pullRequestId);
      return seen.has(id) ? false : (seen.add(id), true);
    });
  }

  /** The signed-in user, for the avatar beside a comment box. Undefined when the tool is not available. */
  async me(): Promise<{ id?: string; displayName?: string; uniqueName?: string } | undefined> {
    if (!this.config.tools.includes(TOOL.currentUser)) return undefined;
    return this.call<{ id?: string; displayName?: string; uniqueName?: string }>(TOOL.currentUser, {}).catch(() => undefined);
  }

  /** People matching a name or email, for the reviewer picker. */
  findPeople(filter: string): Promise<{ id?: string; displayName?: string; uniqueName?: string }[]> {
    return this.call(TOOL.identities, { searchFilter: filter });
  }

  /** Pipelines (build definitions) of the project with their latest build. */
  pipelines(): Promise<unknown> {
    return this.call(TOOL.definitions, { action: "list", project: this.config.project, includeLatestBuilds: true, top: 100 });
  }

  /** Builds (runs) of the project, newest first; one pipeline when `definitionId` is given. */
  builds(opts: { definitionId?: number; top?: number } = {}): Promise<unknown> {
    return this.call(TOOL.build, {
      action: "list",
      project: this.config.project,
      queryOrder: "QueueTimeDescending",
      top: opts.top ?? 50,
      ...(opts.definitionId ? { definitions: [opts.definitionId] } : {}),
    });
  }

  /** One build. */
  async build(buildId: number): Promise<Record<string, unknown>> {
    const list = await this.call<Record<string, unknown>[]>(TOOL.build, { action: "list", project: this.config.project, buildIds: [buildId] });
    const found = Array.isArray(list) ? list[0] : undefined;
    if (!found) throw new Error(`Run ${buildId} was not found.`);
    return found;
  }

  /** Stages, jobs and tasks of a build with results, log ids and issues. */
  buildTimeline(buildId: number): Promise<unknown> {
    return this.call(TOOL.build, { action: "get_timeline", project: this.config.project, buildId });
  }

  /** Commits and work items a build contains. */
  buildChanges(buildId: number): Promise<unknown> {
    return this.call(TOOL.build, { action: "get_changes", project: this.config.project, buildId, top: 50 });
  }

  /** The text of one log. */
  buildLogLines(buildId: number, logId: number): Promise<unknown> {
    return this.call(TOOL.buildLog, { action: "get_content", project: this.config.project, buildId, logId });
  }

  threads(repositoryId: string, pullRequestId: number): Promise<unknown> {
    return this.call(TOOL.prThread, { action: "list", repositoryId, pullRequestId, project: this.config.project });
  }

  repositories(): Promise<unknown> {
    return this.call(TOOL.repos, { action: "list", project: this.config.project });
  }

  branches(repositoryId: string): Promise<unknown> {
    return this.call(TOOL.branches, { action: "list", repositoryId, project: this.config.project, top: 100 });
  }

  /** The test plans of the project (active ones, with details). */
  testPlans(): Promise<unknown> {
    return this.call(TOOL.testplan, { action: "list_plans", project: this.config.project, filterActivePlans: true, includePlanDetails: true });
  }

  testSuites(planId: number): Promise<unknown> {
    return this.call(TOOL.testplan, { action: "list_suites", project: this.config.project, planId });
  }

  testCases(planId: number, suiteId: number): Promise<unknown> {
    return this.call(TOOL.testplan, { action: "list_cases", project: this.config.project, planId, suiteId });
  }

  /** A test case work item with its steps, state and priority. */
  getTestCase(id: number): Promise<WorkItem> {
    return this.call(TOOL.workItem, {
      action: "get",
      project: this.config.project,
      id,
      fields: ["System.Id", "System.Title", "System.State", "Microsoft.VSTS.Common.Priority", "Microsoft.VSTS.TCM.Steps", "System.AreaPath", "System.IterationPath", "System.AssignedTo"],
    });
  }

  /** The test results of a build (optionally only some outcomes). */
  testResults(buildId: number, outcomes?: string[]): Promise<unknown> {
    return this.call(TOOL.testResults, { project: this.config.project, buildid: buildId, ...(outcomes?.length ? { outcomes } : {}) });
  }

  /** The team's iterations, each with dates and a past/current/future time frame. */
  teamIterations(): Promise<unknown> {
    return this.call(TOOL.work, {
      action: "list_team_iterations",
      project: this.config.project,
      team: this.config.team,
    });
  }

  /** Ids of the work items scheduled in an iteration. */
  async iterationItemIds(iterationId: string): Promise<number[]> {
    const result = await this.call<{ workItemRelations?: { target?: { id?: number } }[] }>(TOOL.workItem, {
      action: "list_for_iteration",
      project: this.config.project,
      team: this.config.team,
      iterationId,
    });
    const ids = new Set<number>();
    for (const rel of result.workItemRelations ?? []) {
      if (typeof rel.target?.id === "number") ids.add(rel.target.id);
    }
    return [...ids];
  }

  // ---- writes (each one host-approved, each only from an explicit button) ---------------------

  /**
   * Creates a work item in one call: fields (iteration, area, assignee...) and, when given, the
   * parent link. `fields` is name -> value; rich text fields are sent as HTML.
   */
  async createWorkItem(type: string, values: Record<string, string>, parentId?: number, htmlFields: ReadonlySet<string> = new Set([FIELD.description, FIELD.acceptance])): Promise<WorkItem> {
    const fields = Object.entries(values)
      .filter(([, v]) => v !== "")
      .map(([name, value]) => ({ name, value, ...(htmlFields.has(name) ? { format: "Html" } : {}) }));
    return this.call<WorkItem>(TOOL.workItemWrite, {
      action: "create",
      project: this.config.project,
      workItemType: type,
      fields,
      ...(parentId !== undefined ? { parentId } : {}),
    });
  }

  /** Creates a sprint and assigns it to the team (two approved calls from one button). */
  async createSprint(name: string, startDate: string, finishDate: string): Promise<void> {
    const created = await this.call<{ identifier?: string; path?: string }[]>(TOOL.iterationWrite, {
      action: "create",
      project: this.config.project,
      iterations: [{ iterationName: name, startDate, finishDate }],
    });
    const node = created[0];
    if (!node?.identifier || !node.path) throw new Error("The sprint was created but its id was not returned; assign it to the team in Azure DevOps.");
    await this.call(TOOL.iterationWrite, {
      action: "assign",
      project: this.config.project,
      team: this.config.team,
      iterations: [{ identifier: node.identifier, path: toIterationPath(node.path) }],
    });
  }

  /** Opens a pull request. Branch names are given without "refs/heads/". */
  createPullRequest(v: {
    repositoryId: string;
    source: string;
    target: string;
    title: string;
    description?: string;
    isDraft?: boolean;
    workItems?: string;
    labels?: string[];
  }): Promise<{ pullRequestId?: number }> {
    return this.call(TOOL.prWrite, {
      action: "create",
      repositoryId: v.repositoryId,
      project: this.config.project,
      sourceRefName: `refs/heads/${v.source}`,
      targetRefName: `refs/heads/${v.target}`,
      title: v.title,
      ...(v.description ? { description: v.description } : {}),
      ...(v.isDraft ? { isDraft: true } : {}),
      ...(v.workItems ? { workItems: v.workItems } : {}),
      ...(v.labels && v.labels.length > 0 ? { labels: v.labels } : {}),
    });
  }

  /** Casts the signed-in user's vote (or resets it with NoVote). */
  votePullRequest(repositoryId: string, pullRequestId: number, vote: string): Promise<unknown> {
    return this.call(TOOL.prWrite, { action: "vote", repositoryId, pullRequestId, project: this.config.project, vote });
  }

  /** A new comment thread (no thread id) or a reply in one. */
  commentOnPullRequest(repositoryId: string, pullRequestId: number, content: string, threadId?: number): Promise<unknown> {
    return this.call(TOOL.prThreadWrite, {
      action: threadId === undefined ? "create" : "reply",
      repositoryId,
      pullRequestId,
      project: this.config.project,
      content,
      ...(threadId === undefined ? {} : { threadId }),
    });
  }

  /** Resolves or reopens a thread (status Fixed, Active, WontFix, Closed...). */
  setThreadStatus(repositoryId: string, pullRequestId: number, threadId: number, status: string): Promise<unknown> {
    return this.call(TOOL.prThreadWrite, { action: "update_status", repositoryId, pullRequestId, project: this.config.project, threadId, status });
  }

  /** Starts a run of a pipeline on a branch, with variables. */
  runPipeline(pipelineId: number, o: { branch: string; variables: Record<string, { value: string }> }): Promise<{ id?: number; name?: string }> {
    return this.call(TOOL.pipelinesWrite, {
      action: "run_pipeline",
      project: this.config.project,
      pipelineId,
      resources: { repositories: { self: { refName: `refs/heads/${o.branch}` } } },
      ...(Object.keys(o.variables).length > 0 ? { variables: o.variables } : {}),
    });
  }

  /** Edits the title or description of a pull request, or abandons or reactivates it. */
  updatePullRequest(repositoryId: string, pullRequestId: number, changes: { title?: string; description?: string; status?: "Active" | "Abandoned" }): Promise<unknown> {
    return this.call(TOOL.prWrite, { action: "update", repositoryId, pullRequestId, project: this.config.project, ...changes });
  }

  /** Merges and closes a pull request with the options of the completion dialog. */
  completePullRequest(
    repositoryId: string,
    pullRequestId: number,
    o: { mergeStrategy: string; deleteSourceBranch: boolean; transitionWorkItems: boolean; mergeCommitMessage?: string }
  ): Promise<unknown> {
    return this.call(TOOL.prWrite, {
      action: "complete",
      repositoryId,
      pullRequestId,
      project: this.config.project,
      mergeStrategy: o.mergeStrategy,
      deleteSourceBranch: o.deleteSourceBranch,
      transitionWorkItems: o.transitionWorkItems,
      bypassPolicy: false,
      ...(o.mergeCommitMessage ? { mergeCommitMessage: o.mergeCommitMessage } : {}),
    });
  }

  addReviewer(repositoryId: string, pullRequestId: number, reviewerId: string, isRequired: boolean): Promise<unknown> {
    return this.call(TOOL.prWrite, {
      action: "update_reviewers",
      repositoryId,
      pullRequestId,
      project: this.config.project,
      reviewerIds: [reviewerId],
      reviewerAction: "add",
      ...(isRequired ? { isRequired: true } : {}),
    });
  }

  removeReviewer(repositoryId: string, pullRequestId: number, reviewerId: string): Promise<unknown> {
    return this.call(TOOL.prWrite, { action: "update_reviewers", repositoryId, pullRequestId, project: this.config.project, reviewerIds: [reviewerId], reviewerAction: "remove" });
  }

  /** Replaces the labels (tags) of a pull request with this list. */
  setLabels(repositoryId: string, pullRequestId: number, labels: string[]): Promise<unknown> {
    return this.call(TOOL.prWrite, { action: "update", repositoryId, pullRequestId, project: this.config.project, labels });
  }

  /** Links a work item to a pull request. */
  linkWorkItem(workItemId: number, p: { projectId: string; repositoryId: string; pullRequestId: number }): Promise<unknown> {
    return this.call(TOOL.linkWrite, {
      action: "link_to_pull_request",
      project: this.config.project,
      projectId: p.projectId,
      repositoryId: p.repositoryId,
      pullRequestId: p.pullRequestId,
      workItemId,
    });
  }

  /** Removes the link between a work item and a pull request. */
  unlinkWorkItem(workItemId: number, p: { projectId: string; repositoryId: string; pullRequestId: number }): Promise<unknown> {
    return this.call(TOOL.linkWrite, { action: "unlink", project: this.config.project, id: workItemId, type: "artifact", url: pullArtifactUri(p) });
  }

  /** Creates a test plan. */
  createTestPlan(values: { name: string; iteration: string; areaPath?: string; description?: string; startDate?: string; endDate?: string }): Promise<{ id?: number; name?: string }> {
    return this.call(TOOL.planWrite, { action: "create", project: this.config.project, ...values });
  }

  /** Creates a child suite under a suite of a plan. */
  createSuite(planId: number, parentSuiteId: number, name: string): Promise<unknown> {
    return this.call(TOOL.suiteWrite, { action: "create", project: this.config.project, planId, parentSuiteId, name });
  }

  /** Creates a test case and, when a suite is given, adds it there (two approved calls from one button). */
  async createTestCase(
    values: { title: string; steps: string; priority?: number; areaPath?: string; iterationPath?: string; testsWorkItemId?: number },
    suite?: { planId: number; suiteId: number }
  ): Promise<WorkItem> {
    const created = await this.call<WorkItem>(TOOL.caseWrite, {
      action: "create",
      project: this.config.project,
      ...values,
      ...(values.steps === "" ? { steps: undefined } : {}),
    });
    if (suite) {
      await this.call(TOOL.suiteWrite, { action: "add_test_cases", project: this.config.project, planId: suite.planId, suiteId: suite.suiteId, testCaseIds: [String(created.id)] });
    }
    return created;
  }

  /** Replaces the steps of a test case. */
  updateSteps(id: number, steps: string): Promise<unknown> {
    return this.call(TOOL.caseWrite, { action: "update_steps", project: this.config.project, id, steps });
  }

  /** Sets the start and finish dates of an existing iteration (Set dates). */
  setIterationDates(path: string, startDate: string, finishDate: string): Promise<unknown> {
    return this.call(TOOL.iterationWrite, {
      action: "update",
      project: this.config.project,
      iterations: [{ path, startDate, finishDate }],
    });
  }

  /** Moves a card: sets its state, guarded by the revision the view read. */
  setState(id: number, state: string, rev?: number): Promise<unknown> {
    return this.call(TOOL.workItemWrite, {
      action: "update",
      project: this.config.project,
      id,
      updates: [...(rev !== undefined ? [{ op: "test", path: "/rev", value: rev }] : []), { op: "replace", path: `/fields/${FIELD.state}`, value: state }],
    });
  }

  /** Saves edited fields of one work item (state, assignee, iteration, tags, planning, text). */
  updateWorkItem(id: number, updates: { op: string; path: string; value?: unknown }[]): Promise<WorkItem> {
    return this.call<WorkItem>(TOOL.workItemWrite, { action: "update", project: this.config.project, id, updates });
  }

  addComment(workItemId: number, text: string): Promise<unknown> {
    return this.call(TOOL.commentWrite, {
      action: "add",
      project: this.config.project,
      workItemId,
      text,
      format: "Markdown",
    });
  }

  /** Moves items to a new position in the team backlog. */
  reorder(ids: number[], previousId: number, nextId: number): Promise<unknown> {
    return this.call(TOOL.backlogWrite, {
      action: "reorder",
      project: this.config.project,
      team: this.config.team,
      ids,
      previousId,
      nextId,
    });
  }

  openLink(url: string): void {
    if (!url || !this.host.canOpenLinks()) return;
    this.host.openLink(url).catch(() => undefined);
  }
}

/** "\\Dev\\Iteration\\Sprint 3" (a classification node path) as the team iteration path "Dev\\Sprint 3". */
export function toIterationPath(nodePath: string): string {
  return nodePath
    .split("\\")
    .filter((p) => p !== "" && p.toLowerCase() !== "iteration")
    .join("\\");
}

/** The artifact link a pull request has on a work item: vstfs:///Git/PullRequestId/{project}%2F{repository}%2F{id}. */
export function pullArtifactUri(p: { projectId: string; repositoryId: string; pullRequestId: number }): string {
  return `vstfs:///Git/PullRequestId/${p.projectId}%2F${p.repositoryId}%2F${p.pullRequestId}`;
}
