/** Pipeline shapes and helpers for the Pipelines views. Pure: no DOM, no host calls. */
import { toPerson, type Person } from "./work-items";

/** What a run or a stage looks like in the web UI: a result icon. */
export type RunResult = "succeeded" | "failed" | "partial" | "canceled" | "running" | "queued" | "unknown";

/** Result label of a run, as the web UI words it. */
export const RESULT_LABEL: Readonly<Record<RunResult, string>> = {
  succeeded: "Succeeded",
  failed: "Failed",
  partial: "Partially succeeded",
  canceled: "Canceled",
  running: "In progress",
  queued: "Queued",
  unknown: "Unknown",
};

const BUILD_RESULT: Record<number, string> = { 2: "succeeded", 4: "partiallysucceeded", 8: "failed", 32: "canceled" };
const BUILD_STATUS: Record<number, string> = { 1: "inprogress", 2: "completed", 4: "cancelling", 8: "postponed", 32: "notstarted" };

/** Maps a build's status and result (strings from the service, or the enum numbers) to one state. */
export function runResult(status: unknown, result: unknown): RunResult {
  const st = typeof status === "number" ? BUILD_STATUS[status] : String(status ?? "").toLowerCase();
  const rs = typeof result === "number" ? BUILD_RESULT[result] : String(result ?? "").toLowerCase();
  if (st === "completed") {
    if (rs === "succeeded" || rs === "succeededwithissues") return "succeeded";
    if (rs === "partiallysucceeded") return "partial";
    if (rs === "failed") return "failed";
    if (rs === "canceled" || rs === "cancelled" || rs === "skipped" || rs === "abandoned") return "canceled";
    return "unknown";
  }
  if (st === "inprogress" || st === "cancelling") return "running";
  if (st === "notstarted" || st === "postponed" || st === "pending" || st === "queued") return "queued";
  return "unknown";
}

export interface Run {
  id: number;
  /** "20261105.1". */
  number: string;
  /** The commit message or the run name that follows the number. */
  title: string;
  pipelineId: number;
  pipelineName: string;
  result: RunResult;
  reason: string;
  /** "Individual CI", "Manual", "Pull request", "Scheduled" ... */
  trigger: string;
  requestedBy?: Person;
  branch: string;
  commit: string;
  repository?: string;
  queued?: string;
  started?: string;
  finished?: string;
}

/** BuildReason enum numbers (the node client returns numbers) as names. */
const REASON_BY_NUMBER: Record<number, string> = {
  1: "manual",
  2: "individualci",
  4: "batchedci",
  8: "schedule",
  16: "scheduleforced",
  128: "checkinshelveset",
  256: "pullrequest",
  512: "buildcompletion",
  1024: "resourcetrigger",
};

const REASON_LABEL: Record<string, string> = {
  individualci: "Individual CI",
  batchedci: "Batched CI",
  manual: "Manually run",
  pullrequest: "Pull request",
  schedule: "Scheduled",
  scheduleforced: "Scheduled",
  buildcompletion: "Build completion",
  resourcetrigger: "Resource trigger",
  checkinshelveset: "Check-in",
  triggered: "Triggered",
};

/** "refs/heads/main" as "main"; "refs/pull/7/merge" stays recognisable. */
export function shortBranch(ref: string | undefined): string {
  return (ref ?? "").replace(/^refs\/heads\//, "");
}

/** One build from the list result. */
export function toRun(raw: Record<string, unknown>): Run {
  const def = raw.definition as { id?: number; name?: string } | undefined;
  const trigger = raw.triggerInfo as Record<string, unknown> | undefined;
  const repo = raw.repository as { name?: string } | undefined;
  const reason = typeof raw.reason === "number" ? (REASON_BY_NUMBER[raw.reason] ?? "") : String(raw.reason ?? "").toLowerCase();
  const message = typeof trigger?.["ci.message"] === "string" ? (trigger["ci.message"] as string).split("\n")[0] : "";
  return {
    id: Number(raw.id),
    number: String(raw.buildNumber ?? raw.id ?? ""),
    title: message || String(raw.name ?? ""),
    pipelineId: Number(def?.id ?? raw.pipelineId ?? 0),
    pipelineName: String(def?.name ?? ""),
    result: runResult(raw.status, raw.result),
    reason,
    trigger: REASON_LABEL[reason] ?? (reason ? reason.replace(/^./, (c) => c.toUpperCase()) : "Manually run"),
    requestedBy: toPerson(raw.requestedFor) ?? toPerson(raw.requestedBy),
    branch: shortBranch(raw.sourceBranch as string | undefined),
    commit: typeof raw.sourceVersion === "string" ? raw.sourceVersion.slice(0, 8) : "",
    repository: repo?.name,
    queued: typeof raw.queueTime === "string" ? raw.queueTime : undefined,
    started: typeof raw.startTime === "string" ? raw.startTime : undefined,
    finished: typeof raw.finishTime === "string" ? raw.finishTime : undefined,
  };
}

export function toRuns(raw: unknown): Run[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[]).filter((b) => b && b.id !== undefined).map(toRun);
}

/** "#20261105.1 • Set up CI with Azure Pipelines". */
export function runHeading(run: Pick<Run, "number" | "title">): string {
  return run.title ? `#${run.number} • ${run.title}` : `#${run.number}`;
}

/** Duration in the web UI's words: "<1s", "42s", "3m 5s", "1h 2m". Empty when the run has not finished. */
export function formatDuration(start: string | undefined, end: string | undefined): string {
  if (!start || !end) return "";
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return "";
  const s = Math.round(ms / 1000);
  if (ms < 1000) return "<1s";
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export interface Pipeline {
  id: number;
  name: string;
  folder: string;
  lastRun?: Run;
}

/** Pipelines from the definition list, each with its most recent run when the list carried one. */
export function toPipelines(raw: unknown): Pipeline[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[])
    .filter((d) => d && d.id !== undefined)
    .map((d) => {
      const latest = (d.latestBuild ?? d.latestCompletedBuild) as Record<string, unknown> | undefined;
      return { id: Number(d.id), name: String(d.name ?? ""), folder: String(d.path ?? "\\"), lastRun: latest ? toRun({ ...latest, definition: { id: d.id, name: d.name } }) : undefined };
    });
}

export interface TimelineIssue {
  type: "error" | "warning";
  message: string;
}

export interface TimelineNode {
  id: string;
  parentId?: string;
  kind: "Stage" | "Phase" | "Job" | "Task" | "Checkpoint";
  name: string;
  result: RunResult;
  started?: string;
  finished?: string;
  order: number;
  logId?: number;
  issues: TimelineIssue[];
}

const KIND = new Set(["Stage", "Phase", "Job", "Task", "Checkpoint"]);

const TASK_RESULT_BY_NUMBER: Record<number, string> = { 0: "succeeded", 1: "succeededwithissues", 2: "failed", 3: "canceled", 4: "skipped", 5: "abandoned" };
const RECORD_STATE_BY_NUMBER: Record<number, string> = { 0: "pending", 1: "inprogress", 2: "completed" };

/** The web UI names the implicit stage and job of a pipeline without stages "Stage" and "Job". */
export function recordName(name: string, kind: string): string {
  return name === "__default" ? (kind === "Stage" ? "Stage" : "Job") : name;
}

/** The timeline records of a build. */
export function toTimeline(raw: unknown): TimelineNode[] {
  return ((Array.isArray(raw) ? raw : []) as Record<string, unknown>[])
    .filter((r) => typeof r.id === "string" && KIND.has(String(r.type)))
    .map((r) => ({
      id: r.id as string,
      parentId: typeof r.parentId === "string" ? r.parentId : undefined,
      kind: r.type as TimelineNode["kind"],
      name: recordName(String(r.name ?? ""), String(r.type)),
      result: runResult(typeof r.state === "number" ? RECORD_STATE_BY_NUMBER[r.state] : r.state, typeof r.result === "number" ? TASK_RESULT_BY_NUMBER[r.result] : r.result),
      started: typeof r.startTime === "string" ? r.startTime : undefined,
      finished: typeof r.finishTime === "string" ? r.finishTime : undefined,
      order: typeof r.order === "number" ? r.order : 0,
      logId: typeof r.logId === "number" ? r.logId : undefined,
      issues: ((r.issues as { type?: string | number; message?: string }[] | undefined) ?? [])
        .map((i) => ({ type: (typeof i.type === "number" ? (i.type === 1 ? "error" : "warning") : String(i.type ?? "").toLowerCase()) as "error" | "warning", message: i.message ?? "" }))
        .filter((i) => i.message && (i.type === "error" || i.type === "warning")),
    }))
    .sort((a, b) => a.order - b.order);
}

export interface StageRow {
  stage: TimelineNode;
  jobs: TimelineNode[];
}

/** Stages with their jobs. A pipeline without stages gets one implicit stage that holds all jobs. */
export function stageRows(nodes: TimelineNode[]): StageRow[] {
  const stages = nodes.filter((n) => n.kind === "Stage");
  const jobs = nodes.filter((n) => n.kind === "Job");
  const phaseParent = new Map(nodes.filter((n) => n.kind === "Phase").map((p) => [p.id, p.parentId]));
  const stageOf = (job: TimelineNode): string | undefined => {
    let parent = job.parentId;
    for (let i = 0; i < 4 && parent; i++) {
      if (stages.some((s) => s.id === parent)) return parent;
      parent = phaseParent.get(parent) ?? nodes.find((n) => n.id === parent)?.parentId;
    }
    return undefined;
  };
  if (stages.length === 0) return jobs.length > 0 ? [{ stage: { id: "stage", kind: "Stage", name: "Stage", result: worst(jobs.map((j) => j.result)), order: 0, issues: [] }, jobs }] : [];
  return stages.map((stage) => ({ stage, jobs: jobs.filter((j) => stageOf(j) === stage.id) }));
}

const SEVERITY: RunResult[] = ["failed", "canceled", "partial", "running", "queued", "unknown", "succeeded"];

/** The most severe of several results. */
export function worst(results: RunResult[]): RunResult {
  return SEVERITY.find((r) => results.includes(r)) ?? "unknown";
}

/** Error issues across the whole timeline, with the record they belong to. */
export function errorIssues(nodes: TimelineNode[]): { message: string; where: string }[] {
  const out: { message: string; where: string }[] = [];
  for (const n of nodes) for (const i of n.issues) if (i.type === "error") out.push({ message: i.message, where: n.name });
  return out;
}

/** "1 job completed" as the Stages table words it: finished jobs are "completed" whatever their result. */
export function jobsSummary(jobs: TimelineNode[]): string {
  if (jobs.length === 0) return "";
  const r = worst(jobs.map((j) => j.result));
  const word = r === "running" ? "running" : r === "queued" || r === "unknown" ? "waiting" : "completed";
  return `${jobs.length} ${jobs.length === 1 ? "job" : "jobs"} ${word}`;
}

export interface RunInfo {
  changeCount: number;
  workItemCount: number;
}

/** Log lines from the log content result (one string per line, or a text block). */
export function toLogLines(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  return typeof raw === "string" ? raw.split("\n") : [];
}

// ---- run form -----------------------------------------------------------------------------------

export interface RunFormValues {
  pipelineId: number;
  branch: string;
  /** "NAME=value" lines. */
  variables: string;
}

/** Parses "NAME=value" lines to the variables object of a run request; lines without "=" are reported. */
export function parseVariables(text: string): { variables: Record<string, { value: string }>; invalid: string[] } {
  const variables: Record<string, { value: string }> = {};
  const invalid: string[] = [];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t === "") continue;
    const i = t.indexOf("=");
    if (i <= 0) invalid.push(t);
    else variables[t.slice(0, i).trim()] = { value: t.slice(i + 1).trim() };
  }
  return { variables, invalid };
}
