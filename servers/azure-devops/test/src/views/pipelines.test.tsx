import { describe, expect, it, jest } from "@jest/globals";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { AdoApi, type HostBridge } from "../../../src/views/web/lib/api";
import { type ReviewGrant, formatToken } from "../../../src/views/web/lib/review";
import { withDefaults } from "../../../src/views/web/lib/form";
import { PullForm } from "../../../src/views/web/ui/PullViews";
import { errorIssues, formatDuration, jobsSummary, parseVariables, runHeading, runResult, stageRows, toPipelines, toRuns, toTimeline } from "../../../src/views/web/lib/pipelines";
import { PipelineList, PipelineRuns, RunDetailView, RunForm } from "../../../src/views/web/ui/PipelineViews";
import { runPrefillFrom } from "../../../src/views/web/ui/PipelineScreens";

const GRANT: ReviewGrant = { nonce: "ab12", slot: 4_000_000, key: "view-key" };
const NOW = new Date("2026-11-05T12:00:30Z");

const BUILD = {
  id: 1,
  buildNumber: "20261105.1",
  status: "completed",
  result: "failed",
  definition: { id: 1, name: "Dev" },
  sourceBranch: "refs/heads/main",
  sourceVersion: "4672446d5a1c9e03",
  reason: "individualCI",
  requestedFor: { displayName: "Kavya H" },
  repository: { name: "Dev" },
  queueTime: "2026-11-05T12:00:00Z",
  startTime: "2026-11-05T12:00:00Z",
  finishTime: "2026-11-05T12:00:00.400Z",
  triggerInfo: { "ci.message": "Set up CI with Azure Pipelines\n\nbody" },
};

const TIMELINE = [
  { id: "s1", type: "Stage", name: "Stage", state: "completed", result: "failed", order: 1, startTime: BUILD.startTime, finishTime: BUILD.finishTime, issues: [] },
  { id: "p1", parentId: "s1", type: "Phase", name: "Job", state: "completed", result: "failed", order: 1, issues: [] },
  {
    id: "j1",
    parentId: "p1",
    type: "Job",
    name: "Job",
    state: "completed",
    result: "failed",
    order: 1,
    logId: 4,
    issues: [{ type: "error", message: "No hosted parallelism has been purchased or granted." }],
  },
];

const strip = (markup: string): string =>
  markup
    .replace(/<style[\s\S]*?<\/style>/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/\s+/g, " ");
const raw = (node: ReactElement): string => renderToStaticMarkup(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>);
const html = (node: ReactElement): string => strip(raw(node));

describe("pipeline data", () => {
  it("maps a build to a run with the web UI's words", () => {
    const [run] = toRuns([BUILD]);
    expect(run).toMatchObject({
      id: 1,
      number: "20261105.1",
      title: "Set up CI with Azure Pipelines",
      pipelineName: "Dev",
      result: "failed",
      trigger: "Individual CI",
      branch: "main",
      commit: "4672446d",
    });
    expect(runHeading(run)).toBe("#20261105.1 • Set up CI with Azure Pipelines");
  });

  it("reads results from strings and from the enum numbers", () => {
    expect(runResult("completed", "succeeded")).toBe("succeeded");
    expect(runResult(2, 8)).toBe("failed");
    expect(runResult(2, 4)).toBe("partial");
    expect(runResult("inProgress", undefined)).toBe("running");
    expect(runResult("notStarted", undefined)).toBe("queued");
    expect(runResult("completed", "canceled")).toBe("canceled");
  });

  it("formats durations", () => {
    expect(formatDuration("2026-11-05T12:00:00Z", "2026-11-05T12:00:00.400Z")).toBe("<1s");
    expect(formatDuration("2026-11-05T12:00:00Z", "2026-11-05T12:00:42Z")).toBe("42s");
    expect(formatDuration("2026-11-05T12:00:00Z", "2026-11-05T12:03:05Z")).toBe("3m 5s");
    expect(formatDuration("2026-11-05T12:00:00Z", "2026-11-05T13:02:00Z")).toBe("1h 2m");
    expect(formatDuration(undefined, "2026-11-05T13:02:00Z")).toBe("");
  });

  it("builds stages with their jobs and lists the errors", () => {
    const nodes = toTimeline(TIMELINE);
    const rows = stageRows(nodes);
    expect(rows).toHaveLength(1);
    expect(rows[0].jobs.map((j) => j.name)).toEqual(["Job"]);
    expect(jobsSummary(rows[0].jobs)).toBe("1 job completed");
    expect(errorIssues(nodes)).toEqual([{ message: "No hosted parallelism has been purchased or granted.", where: "Job" }]);
    expect(stageRows(toTimeline([{ id: "j", type: "Job", name: "Only", result: "succeeded", state: "completed" }]))[0].stage.name).toBe("Stage");
  });

  it("reads the numbers the node client returns", () => {
    const [run] = toRuns([{ ...BUILD, reason: 2, status: 2, result: 8 }]);
    expect(run).toMatchObject({ trigger: "Individual CI", result: "failed" });
    expect(toRuns([{ ...BUILD, reason: 1 }])[0].trigger).toBe("Manually run");
    const nodes = toTimeline([
      { id: "s", type: "Stage", name: "__default", state: 2, result: 2, order: 1 },
      { id: "j", parentId: "s", type: "Job", name: "__default", state: 2, result: 2, order: 2, issues: [{ type: 1, message: "boom" }] },
    ]);
    expect(nodes.map((n) => [n.name, n.result])).toEqual([
      ["Stage", "failed"],
      ["Job", "failed"],
    ]);
    expect(errorIssues(nodes)).toEqual([{ message: "boom", where: "Job" }]);
  });

  it("pipelines keep their latest build", () => {
    const [p] = toPipelines([{ id: 1, name: "Dev", path: "\\", latestBuild: BUILD }]);
    expect(p.lastRun?.pipelineName).toBe("Dev");
  });

  it("parses variables and reports bad lines", () => {
    expect(parseVariables("A=1\n B = two=2 \n\nbad")).toEqual({ variables: { A: { value: "1" }, B: { value: "two=2" } }, invalid: ["bad"] });
    expect(runPrefillFrom({ pipeline: "Dev", branch: "refs/heads/main", variables: "A=1" })).toEqual({ pipeline: "Dev", branch: "main", variables: "A=1" });
  });
});

describe("rendered words", () => {
  const runs = toRuns([BUILD]);
  const pipelines = toPipelines([{ id: 1, name: "Dev", latestBuild: BUILD }]);

  it("pipeline list", () => {
    const out = html(<PipelineList pipelines={pipelines} runs={runs} tab="Recent" now={NOW} />);
    for (const w of [
      "Pipelines",
      "New pipeline",
      "Recent",
      "All",
      "Runs",
      "Recently run pipelines",
      "Pipeline",
      "Last run",
      "Dev",
      "#20261105.1 • Set up CI with Azure Pipelines",
      "Individual CI for",
      "Just now",
      "<1s",
    ])
      expect(out).toContain(w);
    expect(raw(<PipelineList pipelines={pipelines} runs={runs} tab="Recent" />)).toContain('placeholder="Filter pipelines"');
    expect(html(<PipelineList pipelines={[]} runs={[]} tab="Recent" />)).toContain("No pipelines have run yet");
  });

  it("pipeline runs", () => {
    const out = html(<PipelineRuns pipeline={{ id: 1, name: "Dev" }} runs={runs} tab="Runs" canRun now={NOW} />);
    for (const w of ["Dev", "Edit", "Run pipeline", "Runs", "Stages", "Branches", "Analytics", "Description", "#20261105.1 • Set up CI with Azure Pipelines", "Individual CI for", "main", "4672446d"])
      expect(out).toContain(w);
    expect(html(<PipelineRuns pipeline={{ id: 1, name: "Dev" }} runs={[]} tab="Runs" canRun />)).toContain("Get started and run this pipeline for the first time!");
    expect(html(<PipelineRuns pipeline={{ id: 1, name: "Dev" }} runs={runs} tab="Runs" canRun={false} />)).not.toContain("Run pipeline");
  });

  it("run detail", () => {
    const out = html(<RunDetailView run={runs[0]} timeline={toTimeline(TIMELINE)} changeCount={2} workItemCount={0} canRun now={NOW} />);
    for (const w of [
      "#20261105.1 • Set up CI with Azure Pipelines",
      "Rerun failed jobs",
      "Run new",
      "This run will be cleaned up after 1 month based on your project settings.",
      "Summary",
      "Code Coverage*",
      "Individual CI by",
      "View 2 changes",
      "Parameters",
      "Repository and version",
      "Related",
      "0 work items",
      "0 published",
      "Tests and coverage",
      "Get started",
      "Errors",
      "No hosted parallelism has been purchased or granted.",
      "View documentation for troubleshooting failed runs",
      "Stages",
      "Jobs",
      "1 job completed",
    ])
      expect(out).toContain(w);
  });

  it("run form", () => {
    const out = html(<RunForm pipelines={[{ id: 1, name: "Dev" }]} branches={["main", "dev"]} />);
    for (const w of ["RUN PIPELINE *", "Pipeline", "Branch/tag", "Variables", "Nothing is started until you press Run", "Run"]) expect(out).toContain(w);
  });
});

describe("starting a run", () => {
  it("sends the branch and variables with a review token", async () => {
    const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: '{"id":4,"name":"20261105.4"}' }] });
    const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
    const api = new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools: ["pipelines_write"], review: GRANT });
    await api.runPipeline(1, { branch: "main", variables: { A: { value: "1" } } });
    const { reviewToken, ...rest } = callTool.mock.calls[0][1] as Record<string, unknown>;
    expect(rest).toEqual({ action: "run_pipeline", project: "Dev", pipelineId: 1, resources: { repositories: { self: { refName: "refs/heads/main" } } }, variables: { A: { value: "1" } } });
    expect(reviewToken).toBe(formatToken(GRANT, "pipelines_write", rest));
  });
});

describe("a form opened without a proposal", () => {
  it("keeps its defaults when proposed fields are undefined (the Run new and New pull request buttons)", () => {
    expect(withDefaults({ a: "x", b: "y" }, { a: undefined, b: "z" })).toEqual({ a: "x", b: "z" });
    // These threw "Cannot read properties of undefined (reading 'split'/'trim')" and left the view blank.
    expect(() => html(<RunForm pipelines={[{ id: 1, name: "Dev" }]} branches={["main"]} initial={{ pipelineId: 1, branch: undefined, variables: undefined }} />)).not.toThrow();
    expect(() =>
      html(
        <PullForm
          repos={[{ id: "r1", name: "Dev" }]}
          branches={["main"]}
          initial={{ repositoryId: "r1", source: undefined, title: undefined, description: undefined, workItems: undefined, labels: undefined }}
        />
      )
    ).not.toThrow();
  });
});
