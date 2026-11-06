/**
 * Server side of the interactive views (MCP Apps).
 *
 * Views are linked to existing tools purely through tool metadata (`_meta.ui.resourceUri`) and
 * served as `ui://` resources. Tool results are never touched, so a client that does not render
 * apps receives byte-identical output with or without the views. Additive: the upstream tool
 * modules are not edited.
 *
 * Two extra tools exist for the views, both listed in docs/TRANSFER.md:
 *  - `wit_work_item_form` (read): opens the new work item form pre-filled; creates nothing.
 *  - `wit_backlog_write` (write): the reorder operation split off `wit_backlog`, so that tool is
 *    read-only and the host can gate writes per tool.
 */
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { RESOURCE_MIME_TYPE, registerAppResource } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import { createExternalContentResponse } from "../shared/content-safety.js";
import { VIEW_BUNDLE_JS } from "../generated/views-bundle.js";
import { issueReviewGrant, markReviewUsed, verifyReview } from "./confirm.js";
import type { ReviewGrant } from "./web/lib/review.js";
import { resolveScope } from "./scope.js";
import { boardSummary, callerFrom, sprintSummary } from "./summary.js";

export enum AppViewId {
  Board = "board",
  Backlog = "backlog",
  Sprint = "sprint",
  NewItem = "new-item",
  WorkItem = "work-item",
  Query = "query",
  TestPlans = "test-plans",
  TestCase = "test-case",
  TestResults = "test-results",
  PullRequests = "pull-requests",
  PullForm = "pr-form",
  Pipelines = "pipelines",
  PipelineForm = "pipeline-form",
}

interface AppViewDef {
  uri: string;
  name: string;
  description: string;
}

/** The `ui://` resource behind each view. */
export const APP_VIEWS: Readonly<Record<AppViewId, AppViewDef>> = {
  [AppViewId.Board]: { uri: "ui://ado/board.html", name: "Board view", description: "Kanban board of the team backlog with cards per state; moving a card needs approval." },
  [AppViewId.Backlog]: { uri: "ui://ado/backlog.html", name: "Backlog view", description: "Backlog hierarchy with expand and collapse, and the planning pane." },
  [AppViewId.Sprint]: { uri: "ui://ado/sprint.html", name: "Sprint view", description: "Current sprint: taskboard, sprint backlog and totals." },
  [AppViewId.WorkItem]: {
    uri: "ui://ado/work-item.html",
    name: "Work item view",
    description: "One work item with fields, discussion, history, links and attachments, or a list of work items; edits need approval.",
  },
  [AppViewId.TestPlans]: { uri: "ui://ado/test-plans.html", name: "Test plans view", description: "Test plans with their suites and test cases, test case steps, and new plans, suites and cases." },
  [AppViewId.TestCase]: {
    uri: "ui://ado/test-case.html",
    name: "New test case form",
    description: "Review a new test case (title, steps, priority) before it is created; Create asks the user to approve.",
  },
  [AppViewId.TestResults]: { uri: "ui://ado/test-results.html", name: "Test results view", description: "Test results of a build with outcome totals and failure details." },
  [AppViewId.PullRequests]: {
    uri: "ui://ado/pull-requests.html",
    name: "Pull requests view",
    description: "Pull requests with reviewers and votes, one pull request with discussion and changed files; votes and comments need approval.",
  },
  [AppViewId.PullForm]: {
    uri: "ui://ado/pr-form.html",
    name: "New pull request form",
    description: "Review a new pull request (repository, branches, title, description) before it is created; Create asks the user to approve.",
  },
  [AppViewId.Pipelines]: {
    uri: "ui://ado/pipelines.html",
    name: "Pipelines view",
    description: "Pipelines with their recent runs, one pipeline's runs, and one run with errors, stages, jobs and logs; starting a run needs review and approval.",
  },
  [AppViewId.PipelineForm]: {
    uri: "ui://ado/pipeline-form.html",
    name: "Run pipeline form",
    description: "Review a pipeline run (pipeline, branch, variables) before it starts; Run asks the user to approve.",
  },
  [AppViewId.Query]: { uri: "ui://ado/query.html", name: "Query results view", description: "Work item query results as a table." },
  [AppViewId.NewItem]: { uri: "ui://ado/new-item.html", name: "New work item form", description: "Review a new work item before it is created; Save asks the user to approve the create." },
};

/** Which tool opens which view. A tool shows the view whatever its action; the view loads its own data. */
export const TOOL_VIEWS: Readonly<Record<string, AppViewId>> = {
  wit_backlog: AppViewId.Board,
  work: AppViewId.Sprint,
  wit_work_item_form: AppViewId.NewItem,
  wit_board: AppViewId.Board,
  work_sprint: AppViewId.Sprint,
  wit_work_item: AppViewId.WorkItem,
  wit_query: AppViewId.Query,
  repo_pull_request: AppViewId.PullRequests,
  repo_pull_request_org: AppViewId.PullRequests,
  repo_pull_request_thread: AppViewId.PullRequests,
  repo_pull_request_form: AppViewId.PullForm,
  pipelines_build: AppViewId.Pipelines,
  pipelines_run: AppViewId.Pipelines,
  pipelines_definition: AppViewId.Pipelines,
  pipelines_build_log: AppViewId.Pipelines,
  pipelines_run_form: AppViewId.PipelineForm,
  testplan: AppViewId.TestPlans,
  testplan_test_case_form: AppViewId.TestCase,
  testplan_show_test_results_from_build_id: AppViewId.TestResults,
};

/** Plain statements of what each linked tool opens, put in front of the upstream description so a model picks the right tool. */
export const VIEW_DESCRIPTION_PREFIX: Readonly<Record<string, string>> = {
  wit_backlog: "Board and backlog of a team (opens the board view); also lists backlog levels and the work items of a level. ",
  work: "Sprints and iterations of a team (opens the sprint view with the taskboard); also team settings and capacity. ",
  wit_work_item: "One work item or a list of work items (opens the work item view with fields, discussion, history and links). ",
  wit_query: "Work item queries and their results (opens the results table). ",
  repo_pull_request: "Pull requests of a repository or project, or one pull request (opens the pull requests view with reviewers, votes, discussion and changed files). ",
  repo_pull_request_org: "Your active pull requests across the organization (opens the pull requests view). ",
  pipelines_build: "Runs (builds) of a project, one run's status, changes and timeline (opens the pipelines view with errors, stages and jobs). ",
  pipelines_run: "Runs of one pipeline, or one run (opens the pipelines view). ",
  pipelines_definition: "Pipelines of a project (opens the pipelines view with the recently run pipelines). ",
  testplan: "Test plans, suites and test cases of a project (opens the test plans view). ",
  testplan_show_test_results_from_build_id: "Test results of a build (opens the test results view with outcome totals). ",
};

export interface ViewConfig {
  /** Proof that a write comes from a view's own button (see confirm.ts); filled in when a view document is read. */
  review?: ReviewGrant;
  org: string;
  project: string;
  team: string;
  tools: string[];
}

/** Tool metadata that links a tool to a view. Added only to the tool definition. */
export function appViewToolMeta(view: AppViewId): { ui: { resourceUri: string } } {
  return { ui: { resourceUri: APP_VIEWS[view].uri } };
}

/** JSON safe to inline inside a script element. */
function inlineJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * The complete, self-contained document for a view: inline script (SDK included) and a strict
 * content security policy that allows no network access, frames or remote images. No fonts are
 * loaded from the web.
 */
export function buildViewHtml(view: AppViewId, config: ViewConfig): string {
  const csp =
    "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; " + "connect-src 'none'; font-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'";
  return (
    '<!doctype html><html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    `<meta http-equiv="Content-Security-Policy" content="${csp}">` +
    `<title>${APP_VIEWS[view].name}</title></head><body style="margin:0;font-family:'Segoe UI',system-ui,-apple-system,BlinkMacSystemFont,Roboto,'Helvetica Neue',Arial,sans-serif">` +
    '<div id="app"></div>' +
    `<script type="application/json" id="k-config">${inlineJson({ mode: view, config })}</script>` +
    `<script>${VIEW_BUNDLE_JS}</script></body></html>`
  );
}

/** Registers the `ui://` resources for every view. */
export function registerAppViewResources(server: Pick<McpServer, "registerResource">, config: ViewConfig): void {
  for (const view of Object.values(AppViewId)) {
    const def = APP_VIEWS[view];
    registerAppResource(server, def.name, def.uri, { description: def.description, mimeType: RESOURCE_MIME_TYPE }, async () => ({
      contents: [{ uri: def.uri, mimeType: RESOURCE_MIME_TYPE, text: buildViewHtml(view, { ...config, review: issueReviewGrant() }) }],
    }));
  }
}

type Callback = (args: Record<string, unknown>, extra: unknown) => unknown;

/** What `captureTools` collected while the upstream tool modules registered themselves. */
export interface CapturedTools {
  registered: Map<string, RegisteredTool>;
  callbacks: Map<string, Callback>;
}

export const BACKLOG_READ_TOOL = "wit_backlog";
export const BACKLOG_WRITE_TOOL = "wit_backlog_write";
const REORDER_REFUSAL = `reorder is a write operation: use ${BACKLOG_WRITE_TOOL}.`;

/**
 * Parameters that make a tool write a file on the machine running this server. Over HTTP anyone who
 * can reach the port could use them, so they are refused (the content comes back inline instead).
 */
export const LOCAL_FILE_PARAMS: Readonly<Record<string, string>> = {
  wit_work_item_attachment: "savePath",
  pipelines_artifact: "destinationPath",
};

function localFileRefusal(tool: string, param: string): { content: [{ type: "text"; text: string }]; isError: true } {
  return { content: [{ type: "text", text: `${param} is not available over HTTP: ${tool} cannot write files on the server. Omit ${param}.` }], isError: true };
}

/**
 * Writes that must come from a view's Create / Save button. Called without the view's confirmation
 * token they change nothing and answer with where to start instead. The refusal never names the token.
 */
export const REVIEW_GUARDS: Readonly<Record<string, { actions: ReadonlySet<string>; message: string }>> = {
  wit_work_item_write: {
    actions: new Set(["create", "update", "update_batch", "add_child"]),
    message:
      "Nothing was changed. The user reviews work item changes in a form before anything is saved. To create one, call wit_work_item_form with the proposed fields (type, title, description, acceptanceCriteria, parentId, iterationPath, areaPath, assignedTo, tags, priority, effort); the user edits it and presses Create. To change one, open it with wit_work_item (action get) so the user can edit and save it there.",
  },
  repo_pull_request_write: {
    actions: new Set(["create", "complete"]),
    message:
      "Nothing was changed. The user reviews a pull request in a form before it is created. Call repo_pull_request_form with the proposed repository, sourceRefName, targetRefName, title and description; the user edits it and presses Create. Completing (merging) a pull request is done by the user in the pull request view (repo_pull_request) with the Complete button. Votes, comments and edits are made from that view too.",
  },
  pipelines_write: {
    actions: new Set(["run_pipeline"]),
    message:
      "Nothing was started. The user reviews a pipeline run in a form before it starts. Call pipelines_run_form with the pipeline and the branch (and variables); the user edits it and presses Run. Creating and renaming pipelines are separate actions of this tool and are not affected.",
  },
  testplan_test_plan_write: {
    actions: new Set(["create"]),
    message: "Nothing was changed. Test plans are created in the test plans view: open it with testplan and ask the user to use New Test Plan.",
  },
  testplan_test_suite_write: {
    actions: new Set(["create"]),
    message: "Nothing was changed. Test suites are created in the test plans view: open it with testplan and ask the user to use New suite.",
  },
  testplan_test_case_write: {
    actions: new Set(["create", "update_steps"]),
    message:
      "Nothing was changed. The user reviews test cases in a form before anything is saved. To create one, call testplan_test_case_form with the proposed title, steps, priority, areaPath, iterationPath and the suite (planId, suiteId); the user edits it and presses Create. To change steps, open the test case in the test plans view (testplan) so the user can edit and save them.",
  },
  work_iteration_write: {
    actions: new Set(["create", "update"]),
    message: "Nothing was changed. Sprints are created and their dates set in the sprint view: open it with work_sprint and ask the user to use New Sprint or Set dates there.",
  },
};

const EXPIRED_MESSAGE = "Nothing was changed. The review has expired. Open the form or the view again so the user can review and confirm it.";
const USED_MESSAGE = "Nothing was changed. That exact change was already made. Open the view again to repeat it.";

function reviewRefusal(message: string): { content: [{ type: "text"; text: string }]; isError: true } {
  return { content: [{ type: "text", text: message }], isError: true };
}

/**
 * Runs `register` (which registers the upstream tools) while recording each registered tool and its
 * callback, makes `wit_backlog` refuse `reorder` so that tool stays read-only, and refuses the
 * parameters that write files on the server (HTTP mode only; stdio is untouched). The wrapper sits
 * below the upstream wrappers (content safety, annotations), so the callbacks recorded here already
 * carry them and the split write tool behaves exactly like the original action.
 */
export function captureTools(server: McpServer, register: () => void): CapturedTools {
  const captured: CapturedTools = { registered: new Map(), callbacks: new Map() };
  const original = server.tool;
  server.tool = new Proxy(original, {
    apply(target, thisArg, args: unknown[]) {
      const name = args[0] as string;
      const callback = args[args.length - 1] as Callback;
      captured.callbacks.set(name, callback);
      const fileParam = LOCAL_FILE_PARAMS[name];
      if (fileParam) {
        args[args.length - 1] = (a: Record<string, unknown>, extra: unknown) => (a?.[fileParam] !== undefined && a[fileParam] !== "" ? localFileRefusal(name, fileParam) : callback(a, extra));
      }
      const guard = REVIEW_GUARDS[name];
      if (guard) {
        // `reviewToken` is not in the advertised schema; the schema below is loose so it still reaches this wrapper.
        args[args.length - 1] = (a: Record<string, unknown>, extra: unknown) => {
          const { reviewToken, ...rest } = a ?? {};
          if (!guard.actions.has(String(rest.action))) return callback(rest, extra);
          const verdict = verifyReview(name, rest, reviewToken);
          if (verdict === "expired") return reviewRefusal(EXPIRED_MESSAGE);
          if (verdict === "used") return reviewRefusal(USED_MESSAGE);
          if (verdict !== "ok") return reviewRefusal(guard.message);
          return Promise.resolve(callback(rest, extra)).then((result) => {
            // A token is spent only by a write that went through; a failed call can be retried.
            if (!(result as { isError?: boolean } | undefined)?.isError) markReviewUsed(reviewToken);
            return result;
          });
        };
      }
      if (name === BACKLOG_READ_TOOL) {
        args[args.length - 1] = (a: Record<string, unknown>, extra: unknown) => (a?.action === "reorder" ? { content: [{ type: "text", text: REORDER_REFUSAL }], isError: true } : callback(a, extra));
      }
      const tool = Reflect.apply(target, thisArg, args) as RegisteredTool;
      if (guard && typeof args[2] === "object") {
        // Accept (and ignore in the advertised schema) the confirmation key the views send.
        (tool as unknown as { inputSchema: unknown }).inputSchema = z.looseObject(args[2] as z.ZodRawShape);
      }
      captured.registered.set(name, tool);
      return tool;
    },
  });
  try {
    register();
  } finally {
    server.tool = original;
  }
  return captured;
}

/** Fields the new work item form accepts as a proposal. */
const scopeInput = {
  project: z.string().optional().describe("Project the form belongs to (defaults to the server default project)."),
  team: z.string().optional().describe("Team (defaults to the project's default team)."),
};

const formInput = {
  ...scopeInput,
  type: z.string().optional().describe("Work item type, for example Epic, Issue or Task."),
  title: z.string().optional().describe("Proposed title."),
  description: z.string().optional().describe("Proposed description as HTML or Markdown. The user sees it rendered and can edit it."),
  acceptanceCriteria: z.string().optional().describe("Proposed acceptance criteria as HTML or Markdown (types without the field get it as a section of the description)."),
  assignedTo: z.string().optional().describe("Display name or email of the assignee."),
  areaPath: z.string().optional().describe("Area path."),
  iterationPath: z.string().optional().describe('Iteration path, for example "Dev\\\\Sprint 1".'),
  tags: z.array(z.string()).optional().describe("Tags."),
  priority: z.number().int().min(1).max(4).optional().describe("Priority 1 to 4."),
  effort: z.number().optional().describe("Effort."),
  remainingWork: z.number().optional().describe("Remaining work in hours (Task)."),
  storyPoints: z.number().optional().describe("Story points (User Story, Bug, Product Backlog Item)."),
  businessValue: z.number().optional().describe("Business value (Agile Feature and Epic, Scrum)."),
  timeCriticality: z.number().optional().describe("Time criticality (Agile Feature and Epic)."),
  activity: z.string().optional().describe("Activity of a Task: Deployment, Design, Development, Documentation, Requirements or Testing."),
  severity: z.string().optional().describe('Severity of a Bug, for example "2 - High".'),
  risk: z.string().optional().describe('Risk, for example "2 - Medium".'),
  valueArea: z.string().optional().describe("Value area: Business or Architectural."),
  reproSteps: z.string().optional().describe("Repro steps of a Bug as HTML or Markdown (types without the field get them as the description)."),
  systemInfo: z.string().optional().describe("System info of a Bug as HTML or Markdown."),
  startDate: z.string().optional().describe("Start date (yyyy-mm-dd), for types that have it (Epic, Feature)."),
  targetDate: z.string().optional().describe("Target date (yyyy-mm-dd), for types that have it (Epic, Feature)."),
  parentId: z.number().int().min(1).optional().describe("Id of the parent work item."),
};

/**
 * Adds the two view support tools and links every view to its tool. Call after the upstream tools
 * were registered through `captureTools`.
 */
export function installViews(server: McpServer, captured: CapturedTools, config: Omit<ViewConfig, "tools">): void {
  const backlog = captured.callbacks.get(BACKLOG_READ_TOOL);
  if (backlog) {
    // The original callback is the one wrapped by the upstream layers; forcing the action keeps the
    // behaviour identical to `wit_backlog` with action "reorder".
    const reorder = server.registerTool(
      BACKLOG_WRITE_TOOL,
      {
        description: "Write operations for the team backlog: reorder (move work items to a new position in a backlog or iteration).",
        inputSchema: {
          action: z.enum(["reorder"]).describe("The action to perform. Only 'reorder' is supported."),
          project: z.string().optional().describe("The name or ID of the Azure DevOps project."),
          team: z.string().optional().describe("The name or ID of the Azure DevOps team."),
          ids: z.array(z.coerce.number().int().min(1)).min(1).describe("The IDs of the work items to reorder."),
          previousId: z.coerce.number().int().min(0).optional().describe("The ID of the work item that should be before the reordered items. Use 0 for the beginning."),
          nextId: z.coerce.number().int().min(0).optional().describe("The ID of the work item that should be after the reordered items. Use 0 for the end."),
          parentId: z.coerce.number().int().min(0).optional().describe("The parent ID for all work items involved."),
          iterationPath: z.string().optional().describe("The iteration path when reordering items in an iteration backlog."),
          iterationId: z.string().optional().describe("The iteration ID; reorders within that iteration instead of the team backlog."),
        },
        annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
      },
      ((args: Record<string, unknown>, extra: unknown) => backlog({ ...args, action: "reorder" }, extra)) as never
    );
    captured.registered.set(BACKLOG_WRITE_TOOL, reorder);
  }

  const form = server.registerTool(
    "wit_work_item_form",
    {
      description:
        "Open the new work item form for the user to review. Pass the proposed fields; nothing is created here. The user edits the form and presses Save, and only then is the create call made (after the user approves it).",
      inputSchema: formInput,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            note: "The form is open for review. Nothing has been created.",
            ...resolveScope(args, config),
            iteration: args.iterationPath || `the team's current iteration, or ${resolveScope(args, config).project} when none is current`,
            proposal: args,
          }),
        },
      ],
    })
  );
  captured.registered.set("wit_work_item_form", form);

  const caseForm = server.registerTool(
    "testplan_test_case_form",
    {
      description:
        "Open the new test case form for the user to review. Pass the proposed title and steps; nothing is created here. The user edits the form and presses Create, and only then is the create call made (after the user approves it).",
      inputSchema: {
        ...scopeInput,
        title: z.string().optional().describe("Proposed title."),
        steps: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe("Proposed steps: lines like '1. Open the page|The page loads' (action, then | and the expected result), or a list of such lines."),
        priority: z.number().int().min(1).max(4).optional().describe("Priority 1 to 4."),
        areaPath: z.string().optional().describe("Area path."),
        iterationPath: z.string().optional().describe("Iteration path."),
        testsWorkItemId: z.number().int().min(1).optional().describe("Id of the work item this test case tests."),
        planId: z.number().int().min(1).optional().describe("Test plan to add the case to."),
        suiteId: z.number().int().min(1).optional().describe("Test suite to add the case to."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify({ note: "The form is open for review. Nothing has been created.", ...resolveScope(args, config), proposal: args }) }],
    })
  );
  captured.registered.set("testplan_test_case_form", caseForm);

  const prForm = server.registerTool(
    "repo_pull_request_form",
    {
      description:
        "Open the new pull request form for the user to review. Pass the proposed repository, branches, title and description; nothing is created here. The user edits the form and presses Create, and only then is the create call made (after the user approves it).",
      inputSchema: {
        ...scopeInput,
        repository: z.string().optional().describe("Repository name or id."),
        sourceRefName: z.string().optional().describe("Source branch (the branch with the changes), with or without refs/heads/."),
        targetRefName: z.string().optional().describe("Target branch, with or without refs/heads/."),
        title: z.string().optional().describe("Proposed title."),
        description: z.string().optional().describe("Proposed description as Markdown or HTML. The user sees it rendered and can edit it."),
        isDraft: z.boolean().optional().describe("Create the pull request as a draft."),
        workItems: z.string().optional().describe("Work item ids to link, separated by spaces."),
        labels: z.array(z.string()).optional().describe("Tags (labels) for the pull request."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify({ note: "The form is open for review. Nothing has been created.", ...resolveScope(args, config), proposal: args }) }],
    })
  );
  captured.registered.set("repo_pull_request_form", prForm);

  const pipelineForm = server.registerTool(
    "pipelines_run_form",
    {
      description:
        "Open the run pipeline form for the user to review. Pass the pipeline (id or name), the branch and optional variables; nothing is started here. The user edits the form and presses Run, and only then is the run started (after the user approves it in the host).",
      inputSchema: {
        ...scopeInput,
        pipeline: z.string().optional().describe("Pipeline name or id."),
        branch: z.string().optional().describe("Branch to run, with or without refs/heads/."),
        variables: z.string().optional().describe("Variables as NAME=value lines."),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (args) => ({
      content: [{ type: "text" as const, text: JSON.stringify({ note: "The form is open for review. Nothing has been started.", ...resolveScope(args, config), proposal: args }) }],
    })
  );
  captured.registered.set("pipelines_run_form", pipelineForm);

  // Entry tools for the board and the sprint: they name what they open, and answer in text too, so the
  // chat answer is useful when the client does not render the view.
  const call = callerFrom(captured.callbacks);
  const resolve = (args: { project?: string; team?: string }): { project: string; team: string } | string => {
    const project = args.project?.trim() || config.project;
    if (!project) return "A project is required: pass project, or set the server default (ADO_MCP_PROJECT).";
    return { project, team: args.team?.trim() || config.team || `${project} Team` };
  };
  const summarise = async (run: (r: { project: string; team: string }) => Promise<string>, args: { project?: string; team?: string }) => {
    const target = resolve(args);
    if (typeof target === "string") return { content: [{ type: "text" as const, text: target }], isError: true };
    try {
      return createExternalContentResponse(await run(target), "Azure DevOps summary");
    } catch (error) {
      // The view loads its own data, so it still opens; the text says why the summary is missing.
      return { content: [{ type: "text" as const, text: `Could not summarise: ${error instanceof Error ? error.message : String(error)}` }] };
    }
  };
  const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  const target = {
    project: z.string().optional().describe("Project name; defaults to the server's default project."),
    team: z.string().optional().describe("Team name; defaults to the server's default team."),
  };
  captured.registered.set(
    "wit_board",
    server.registerTool(
      "wit_board",
      {
        description:
          "Board and backlog of a team (opens the board view). Shows the work items of the team's requirement level as columns by state (To Do, Doing, Done) with counts. Use this for 'show the board' or 'show the backlog'.",
        inputSchema: { ...target, view: z.enum(["board", "backlog"]).optional().describe("Open the board (default) or the backlog list.") },
        annotations: readOnly,
      },
      (args) => summarise((t) => boardSummary(call, t.project, t.team), args)
    )
  );
  captured.registered.set(
    "work_sprint",
    server.registerTool(
      "work_sprint",
      {
        description:
          "Sprint of a team (opens the sprint view with the taskboard). Defaults to the current sprint; shows dates, days remaining, task totals and the tasks per issue. Use this for 'show the sprint' or 'current iteration'.",
        inputSchema: { ...target, iteration: z.string().optional().describe("Sprint name; defaults to the current sprint.") },
        annotations: readOnly,
      },
      (args) => summarise((t) => sprintSummary(call, t.project, t.team, args.iteration), args)
    )
  );

  for (const [tool, prefix] of Object.entries(VIEW_DESCRIPTION_PREFIX)) {
    const registered = captured.registered.get(tool) as (RegisteredTool & { description?: string }) | undefined;
    if (registered) registered.update({ description: prefix + (registered.description ?? "") });
  }

  // With reorder split off, the backlog tool only reads: say so, so hosts can classify it.
  captured.registered.get(BACKLOG_READ_TOOL)?.update({ annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true } });

  for (const [tool, view] of Object.entries(TOOL_VIEWS)) {
    captured.registered.get(tool)?.update({ _meta: appViewToolMeta(view) });
  }
  registerAppViewResources(server, { ...config, tools: registeredToolNames(captured) });
}

/** Names of the tools currently registered, read from the capture (used for the view config). */
export function registeredToolNames(captured: CapturedTools): string[] {
  return [...captured.registered.keys()];
}
