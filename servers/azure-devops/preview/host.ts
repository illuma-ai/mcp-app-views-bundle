/**
 * A minimal MCP Apps host for the local preview. It uses the SDK's AppBridge, so a view speaks the
 * real protocol here: handshake, host context with the chat host's own style variables, tool
 * input/result, and App-initiated tool calls. Reads are answered at once (policy allow); writes wait
 * for an explicit Approve, like the real host's confirmation card. Answers come from fixtures.
 */
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import { buildResults } from "./fixtures.js";
import { type Result, type Store, mockTool, newStore } from "./mock-tools.js";

type Theme = "light" | "dark";

/** The variables the chat host sends: colour roles as bare "R G B" triplets. */
const HOST_VARIABLES: Record<Theme, Record<string, string>> = {
  light: {
    "--color-background-primary": "255 255 255",
    "--color-background-secondary": "247 247 248",
    "--color-text-primary": "33 33 33",
    "--color-border-primary": "205 205 205",
    "--color-border-secondary": "227 227 227",
  },
  dark: {
    "--color-background-primary": "13 13 13",
    "--color-background-secondary": "33 33 33",
    "--color-text-primary": "236 236 236",
    "--color-border-primary": "57 57 57",
    "--color-border-secondary": "33 33 33",
  },
};

/** Tools whose calls need the user's approval (everything that changes data). */
const WRITE_TOOLS = new Set([
  "wit_work_item_write",
  "wit_work_item_comment_write",
  "wit_work_item_link_write",
  "wit_backlog_write",
  "work_iteration_write",
  "testplan_test_plan_write",
  "testplan_test_suite_write",
  "testplan_test_case_write",
  "repo_pull_request_write",
  "repo_pull_request_thread_write",
  "pipelines_write",
]);

const params = new URLSearchParams(location.search);
const view = params.get("view") ?? "board";
const scenario = params.get("scenario") ?? "";
const themeParam = params.get("theme") ?? "both";
const width = Number(params.get("width") ?? "640");
const noSandbox = params.get("nosandbox") === "1";
const slow = Number(params.get("slow") ?? "0");
const empty = scenario === "empty";
/** scenario=agile: the Agile process project DevAgile; its name reaches the view only through the opening tool call. */
const agile = scenario === "agile";
const scope = agile ? { project: "DevAgile", team: "DevAgile Team" } : { project: "Dev", team: "Dev Team" };

interface Scenario {
  tool: string;
  input: Record<string, unknown>;
  result: Result;
}

function scenarioFor(): Scenario {
  const text = (t: string): Result => ({ content: [{ type: "text", text: t }] });
  if (view === "pull-requests") {
    const id = Number(params.get("id") ?? "0");
    return id
      ? { tool: "repo_pull_request", input: { action: "get", repositoryId: "Dev", pullRequestId: id, project: "Dev" }, result: text("{}") }
      : { tool: "repo_pull_request", input: { action: "list", project: "Dev" }, result: text("[]") };
  }
  if (view === "pipelines") {
    const run = params.get("run");
    const pipeline = params.get("pipeline");
    if (run) return { tool: "pipelines_build", input: { action: "get_status", project: "Dev", buildId: Number(run) }, result: text("{}") };
    if (pipeline) return { tool: "pipelines_run", input: { action: "list", project: "Dev", pipelineId: Number(pipeline) }, result: text("[]") };
    return { tool: "pipelines_definition", input: { action: "list", project: "Dev" }, result: text("[]") };
  }
  if (view === "pipeline-form") {
    const input = scenario === "blank" ? {} : { pipeline: "Dev", branch: "main", variables: "Configuration=Release" };
    return { tool: "pipelines_run_form", input, result: text('{"note":"The form is open for review. Nothing has been started."}') };
  }
  if (view === "pr-form") {
    const input =
      scenario === "blank"
        ? {}
        : {
            repository: "Dev",
            sourceRefName: "feature/welcome-emails",
            targetRefName: "main",
            title: "Welcome email sequence",
            description: "Adds the three emails.\n\n- day 0\n- day 3\n- day 7",
            workItems: "11",
          };
    return { tool: "repo_pull_request_form", input, result: text('{"note":"The form is open for review. Nothing has been created."}') };
  }
  if (view === "test-plans") return { tool: "testplan", input: { action: "list_plans", project: "Dev" }, result: text("{}") };
  if (view === "test-case") {
    const input =
      scenario === "blank"
        ? {}
        : {
            title: "Welcome email arrives within a minute",
            steps: ["1. Sign up with a new email|The sign-up succeeds", "2. Check the inbox|The welcome email arrives within one minute"],
            priority: 2,
            planId: 1,
            suiteId: 11,
          };
    return { tool: "testplan_test_case_form", input, result: text('{"note":"The form is open for review. Nothing has been created."}') };
  }
  if (view === "test-results") {
    return {
      tool: "testplan_show_test_results_from_build_id",
      input: { project: "Dev", buildid: 42 },
      result: { content: [{ type: "text", text: JSON.stringify(scenario === "empty" ? [] : buildResults(), null, 2) }] },
    };
  }
  if (view === "work-item") {
    const id = Number(params.get("id") ?? "10");
    return { tool: "wit_work_item", input: { action: "get", id, project: scope.project }, result: text("{}") };
  }
  if (view === "query") {
    return {
      tool: "wit_query",
      input: { action: "wiql", project: "Dev" },
      result: { content: [{ type: "text", text: JSON.stringify({ queryType: "flat", workItems: [{ id: 10 }, { id: 11 }, { id: 13 }, { id: 30 }, { id: 31 }] }) }] },
    };
  }
  if (view === "sprint") return { tool: "work", input: { action: "list_team_iterations" }, result: text("Project: Dev, Team: Dev Team") };
  if (view === "new-item") {
    const input = agile
      ? { type: params.get("type") ?? "User Story", project: scope.project, team: scope.team }
      : scenario === "blank"
        ? {}
        : { type: "Issue", title: "Add password reset", description: "Users cannot recover access.\n\nAdd a reset by email.", tags: ["auth"], priority: 2, effort: 3, parentId: 1 };
    return { tool: "wit_work_item_form", input, result: text('{"note":"The form is open for review. Nothing has been created."}') };
  }
  return { tool: "wit_backlog", input: { action: "list_work_items", ...scope }, result: text("[]") };
}

function mount(column: HTMLElement, theme: Theme): void {
  const store: Store = newStore(empty, agile);
  const frame = document.createElement("div");
  frame.className = "frame";
  frame.style.width = `${width}px`;
  frame.dataset.theme = theme;
  const title = document.createElement("div");
  title.className = "label";
  title.textContent = `${view}${scenario ? ` / ${scenario}` : ""} · ${theme}`;
  const iframe = document.createElement("iframe");
  iframe.title = `${view} view (${theme})`;
  // The measure script reads the view's DOM, so it loads the page without the sandbox.
  if (!noSandbox) iframe.setAttribute("sandbox", "allow-scripts");
  iframe.style.height = "120px";
  const approvals = document.createElement("div");
  const log = document.createElement("ul");
  log.className = "log";
  frame.append(title, iframe, approvals, log);
  column.appendChild(frame);

  const note = (t: string): void => {
    const li = document.createElement("li");
    li.textContent = t;
    log.prepend(li);
  };

  const bridge = new AppBridge(
    null,
    { name: "preview-host", version: "1.0.0" },
    { openLinks: {}, serverTools: {}, serverResources: {}, message: { text: {} }, logging: {} },
    {
      hostContext: {
        theme,
        platform: "web",
        locale: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        displayMode: "inline",
        availableDisplayModes: ["inline"],
        containerDimensions: { width, maxHeight: 4000 },
        styles: { variables: HOST_VARIABLES[theme] },
      } as never,
    }
  );
  bridge.onsizechange = ({ height }) => {
    if (typeof height === "number") iframe.style.height = `${Math.ceil(height)}px`;
  };
  bridge.onopenlink = async ({ url }) => {
    note(`open link: ${url}`);
    return {};
  };
  bridge.onmessage = async ({ content }) => {
    note(`message to chat: ${JSON.stringify(content)}`);
    return {};
  };
  const answer = async (name: string, args: Record<string, unknown>): Promise<Result> => {
    if (slow > 0) await new Promise((r) => setTimeout(r, slow));
    return mockTool(name, args, store);
  };
  bridge.oncalltool = ({ name, arguments: args }) =>
    new Promise((resolve, reject) => {
      const a = (args ?? {}) as Record<string, unknown>;
      if (!WRITE_TOOLS.has(name)) {
        void answer(name, a).then((r) => resolve(r as never));
        return;
      }
      const card = document.createElement("div");
      card.className = "approval";
      card.setAttribute("role", "alertdialog");
      const heading = document.createElement("strong");
      heading.textContent = `Allow this view to run ${name}?`;
      const pre = document.createElement("pre");
      pre.textContent = JSON.stringify(a, null, 2);
      const yes = document.createElement("button");
      yes.textContent = "Approve";
      yes.dataset.testid = "approve";
      const no = document.createElement("button");
      no.textContent = "Reject";
      yes.onclick = () => {
        card.remove();
        note(`approved: ${name}`);
        void answer(name, a).then((r) => resolve(r as never));
      };
      no.onclick = () => {
        card.remove();
        note(`rejected: ${name}`);
        reject(new Error("Rejected by the user"));
      };
      card.append(heading, pre, yes, no);
      approvals.appendChild(card);
      if ((document.getElementById("auto") as HTMLInputElement | null)?.checked) yes.click();
    });

  const scene = scenarioFor();
  bridge.oninitialized = () => {
    void bridge.sendToolInput({ arguments: scene.input });
    void bridge.sendToolResult(scene.result as never);
  };
  // Connect before navigating: the window proxy survives navigation, so the bridge is already
  // listening when the view posts its first message.
  const win = iframe.contentWindow;
  if (win) bridge.connect(new PostMessageTransport(win, win)).catch((e: Error) => note(`host bridge error: ${e.message}`));
  iframe.src = `/view/${view}.html`;
}

const column = document.getElementById("columns") as HTMLElement;
const themes: Theme[] = themeParam === "both" ? ["light", "dark"] : [themeParam === "dark" ? "dark" : "light"];
for (const theme of themes) mount(column, theme);
if (params.get("auto") === "1") (document.getElementById("auto") as HTMLInputElement).checked = true;
