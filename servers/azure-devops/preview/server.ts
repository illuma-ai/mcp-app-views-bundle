/**
 * Local design-review server: `npm run preview:views`, then open http://127.0.0.1:6281.
 *
 * It serves the real view documents (the same HTML the server returns for the ui:// resources) and
 * a small MCP Apps host (preview/host.ts, built with esbuild at start) that feeds them fixture
 * data, in light and dark. Binds to loopback only. No Azure DevOps service is contacted. Not part of
 * the runtime path.
 */
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { build } from "esbuild";
import { APP_VIEWS, AppViewId, buildViewHtml } from "../src/views/server.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const HOST = "127.0.0.1";
const PORT = Number(process.env.PREVIEW_PORT ?? 6281);

/** Every tool the real server exposes with the suggested domains, plus the two view support tools. */
const TOOLS = [
  "wit_work_item",
  "wit_query",
  "wit_backlog",
  "wit_backlog_write",
  "wit_board",
  "work_sprint",
  "wit_work_item_form",
  "wit_work_item_write",
  "wit_work_item_comment_write",
  "wit_work_item_link_write",
  "work",
  "work_iteration_write",
  "core_list_project_teams",
  "testplan",
  "testplan_test_case_form",
  "testplan_test_plan_write",
  "testplan_test_suite_write",
  "testplan_test_case_write",
  "repo_pull_request",
  "repo_pull_request_form",
  "repo_repository",
  "repo_branch",
  "repo_pull_request_thread",
  "repo_pull_request_write",
  "repo_pull_request_thread_write",
  "core_get_current_user",
  "pipelines_build",
  "pipelines_build_log",
  "pipelines_definition",
  "pipelines_run",
  "pipelines_run_form",
  "pipelines_write",
];
const config = { org: "gaavi", project: "Dev", team: "Dev Team", tools: TOOLS };

const bundle = await build({
  entryPoints: [path.join(here, "host.ts")],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  target: "es2020",
  platform: "browser",
  logLevel: "warning",
});
const hostJs = bundle.outputFiles[0].text;

const SCENES: { title: string; query: string }[] = [
  { title: "Board (populated)", query: "view=board" },
  { title: "Board (empty)", query: "view=board&scenario=empty" },
  { title: "Board (loading, 1.5 s)", query: "view=board&slow=1500" },
  { title: "Backlog (populated)", query: "view=backlog" },
  { title: "Backlog (empty)", query: "view=backlog&scenario=empty" },
  { title: "Sprint taskboard (populated)", query: "view=sprint" },
  { title: "Work item detail (issue with comments, links)", query: "view=work-item&id=10" },
  { title: "Work item detail (task)", query: "view=work-item&id=31" },
  { title: "Query results", query: "view=query" },
  { title: "Pull requests (list)", query: "view=pull-requests" },
  { title: "Pull request (detail)", query: "view=pull-requests&id=1" },
  { title: "New pull request (pre-filled by the assistant)", query: "view=pr-form" },
  { title: "Pipelines (recent)", query: "view=pipelines" },
  { title: "Pipeline runs", query: "view=pipelines&pipeline=1" },
  { title: "Pipeline run (failed, with errors)", query: "view=pipelines&run=1" },
  { title: "Run pipeline (pre-filled by the assistant)", query: "view=pipeline-form" },
  { title: "Test plans (plan, suites, cases)", query: "view=test-plans" },
  { title: "Test plans (empty)", query: "view=test-plans&scenario=empty" },
  { title: "New test case (pre-filled by the assistant)", query: "view=test-case" },
  { title: "Test results of a build", query: "view=test-results" },
  { title: "Sprint (empty)", query: "view=sprint&scenario=empty" },
  { title: "New work item (pre-filled by the assistant)", query: "view=new-item" },
  { title: "New work item (blank)", query: "view=new-item&scenario=blank" },
];

const page = (body: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>View preview</title>` +
  `<style>body{margin:0;padding:16px;font:14px/1.4 "Segoe UI",system-ui,sans-serif;background:#e9e9ec;color:#222}` +
  `#columns{display:flex;gap:16px;flex-wrap:wrap;align-items:flex-start}.frame{background:#fff;border-radius:8px}.frame[data-theme=dark]{background:#0d0d0d}` +
  `.label{font:12px monospace;color:#555;padding:4px 0}.frame[data-theme=dark] .label{color:#aaa}iframe{display:block;width:100%;border:0}` +
  `.approval{margin:8px 0;padding:8px;border:2px solid #c2410c;background:#fff7ed;color:#222;border-radius:6px}.approval pre{max-height:160px;overflow:auto;margin:4px 0;font-size:12px}` +
  `.log{font:12px monospace;color:#555;list-style:none;margin:4px 0;padding:0}a{color:#2563eb}li{margin:2px 0}</style></head><body>${body}</body></html>`;

const indexHtml = page(
  `<h1>Azure DevOps views preview</h1><p>Each link shows the view in light and dark inside a minimal MCP Apps host. Reads run at once; writes wait for Approve, like the real host. Add <code>&amp;theme=light</code> or <code>dark</code> to show one, <code>&amp;width=900</code> to resize.</p><ul>` +
    SCENES.map((s) => `<li><a href="/host.html?${s.query}">${s.title}</a></li>`).join("") +
    "</ul>"
);
const hostHtml = page(`<label><input type="checkbox" id="auto"> auto-approve write calls</label><div id="columns"></div><script>${hostJs.replace(/<\/script/gi, "<\\/script")}</script>`);

const VIEW_PATH = new RegExp(`^/view/(${Object.values(AppViewId).join("|")})\\.html$`);

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://${HOST}`);
  const send = (type: string, body: string, status = 200): void => {
    res.writeHead(status, { "content-type": `${type}; charset=utf-8`, "cache-control": "no-store" });
    res.end(body);
  };
  const match = VIEW_PATH.exec(url.pathname);
  if (match) return send("text/html", buildViewHtml(match[1] as AppViewId, config));
  if (url.pathname === "/host.html") return send("text/html", hostHtml);
  if (url.pathname === "/") return send("text/html", indexHtml);
  send("text/plain", "Not found", 404);
}).listen(PORT, HOST, () => {
  console.log(`View preview: http://${HOST}:${PORT} (${Object.keys(APP_VIEWS).length} views)`);
});
