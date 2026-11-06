/** Test plan shapes and helpers for the Test Plans views. Pure: no DOM, no host calls. */

export interface Plan {
  id: number;
  name: string;
  state?: string;
  iteration?: string;
  area?: string;
  start?: string;
  end?: string;
  owner?: string;
  rootSuiteId?: number;
}

/** Plans from the list_plans result. */
export function toPlans(raw: unknown): Plan[] {
  const list = ((raw as { testPlans?: unknown[] } | undefined)?.testPlans ?? []) as Record<string, unknown>[];
  return list
    .filter((p) => typeof p?.id === "number")
    .map((p) => ({
      id: p.id as number,
      name: String(p.name ?? ""),
      state: typeof p.state === "string" ? p.state : undefined,
      iteration: typeof p.iteration === "string" ? p.iteration : undefined,
      area: typeof (p.areaPath as unknown) === "string" ? (p.areaPath as string) : (p.area as { name?: string } | undefined)?.name,
      start: typeof p.startDate === "string" ? p.startDate : undefined,
      end: typeof p.endDate === "string" ? p.endDate : undefined,
      owner: (p.owner as { displayName?: string } | undefined)?.displayName,
      rootSuiteId: (p.rootSuite as { id?: number } | undefined)?.id,
    }));
}

export interface Suite {
  id: number;
  name: string;
  children: Suite[];
}

/** The suite tree from the list_suites result. */
export function toSuites(raw: unknown): Suite[] {
  const walk = (list: unknown): Suite[] =>
    (Array.isArray(list) ? (list as Record<string, unknown>[]) : [])
      .filter((s) => typeof s?.id === "number")
      .map((s) => ({ id: s.id as number, name: String(s.name ?? ""), children: walk(s.children) }));
  return walk((raw as { testSuites?: unknown } | undefined)?.testSuites);
}

/** Every suite of a tree, depth first, with its depth (for an indented list). */
export function flattenSuites(suites: Suite[], depth = 0): { suite: Suite; depth: number }[] {
  return suites.flatMap((suite) => [{ suite, depth }, ...flattenSuites(suite.children, depth + 1)]);
}

export interface CaseRef {
  id: number;
  title: string;
}

/** The test cases of a suite (id and title) from the list_cases result. */
export function toCaseRefs(raw: unknown): CaseRef[] {
  const list = ((raw as { testCases?: unknown[] } | undefined)?.testCases ?? []) as { workItem?: { id?: number; name?: string } }[];
  return list.filter((c) => typeof c?.workItem?.id === "number").map((c) => ({ id: c.workItem?.id as number, title: String(c.workItem?.name ?? "") }));
}

export interface Step {
  action: string;
  expected: string;
}

const ENTITIES: Record<string, string> = { "&lt;": "<", "&gt;": ">", "&amp;": "&", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " " };

/** Plain text of an escaped HTML fragment (steps keep their formatting as markup inside XML). */
function plain(escaped: string): string {
  const html = escaped.replace(/&(lt|gt|amp|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m);
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div)>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&(lt|gt|amp|quot|#39|apos|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** Steps from the `Microsoft.VSTS.TCM.Steps` XML: each step has an action and an expected result. */
export function parseSteps(xml: unknown): Step[] {
  if (typeof xml !== "string" || !xml.includes("<step")) return [];
  const steps: Step[] = [];
  for (const step of xml.matchAll(/<step\b[^>]*>([\s\S]*?)<\/step>/g)) {
    const parts = [...step[1].matchAll(/<parameterizedString\b[^>]*>([\s\S]*?)<\/parameterizedString>/g)].map((m) => plain(m[1]));
    steps.push({ action: parts[0] ?? "", expected: parts[1] ?? "" });
  }
  return steps;
}

/**
 * The text the create and update tools take: "1. action|expected" per line. A "|" or a line break
 * inside a step would break that format, so they are replaced by "/" and a space.
 */
export function stepsToText(steps: Step[]): string {
  const clean = (t: string): string =>
    t
      .replace(/\|/g, "/")
      .replace(/\s*\n\s*/g, " ")
      .trim();
  return steps
    .filter((s) => s.action.trim() !== "" || s.expected.trim() !== "")
    .map((s, i) => `${i + 1}. ${clean(s.action)}|${clean(s.expected)}`)
    .join("\n");
}

/** Steps proposed as text ("1. a|b" lines) or as a list, for pre-filling the form. */
export function stepsFromProposal(value: unknown): Step[] {
  if (Array.isArray(value)) {
    return value.map((v) => (typeof v === "string" ? splitStep(v) : { action: String((v as Step)?.action ?? ""), expected: String((v as Step)?.expected ?? "") }));
  }
  if (typeof value === "string")
    return value
      .split(/\n+/)
      .filter((l) => l.trim() !== "")
      .map(splitStep);
  return [];
}

function splitStep(line: string): Step {
  const body = line.replace(/^\s*\d+[.)]\s*/, "");
  const i = body.indexOf("|");
  return i === -1 ? { action: body.trim(), expected: "" } : { action: body.slice(0, i).trim(), expected: body.slice(i + 1).trim() };
}

export type Outcome = "Passed" | "Failed" | "Aborted" | "NotExecuted" | "Blocked" | "Inconclusive" | "Other";

export interface TestResult {
  id: number;
  title: string;
  outcome: Outcome;
  durationMs?: number;
  error?: string;
  stack?: string;
  runId?: number;
}

/** Results of a build from the `testplan_show_test_results_from_build_id` result. */
export function toResults(raw: unknown): TestResult[] {
  const list = (Array.isArray(raw) ? raw : []) as Record<string, unknown>[];
  const known = new Set<string>(["Passed", "Failed", "Aborted", "NotExecuted", "Blocked", "Inconclusive"]);
  return list.map((r, i) => ({
    id: typeof r.id === "number" ? r.id : i,
    title: String(r.testCaseTitle ?? r.automatedTestName ?? ""),
    outcome: (known.has(String(r.outcome)) ? String(r.outcome) : "Other") as Outcome,
    durationMs: typeof r.durationInMs === "number" ? r.durationInMs : undefined,
    error: typeof r.errorMessage === "string" && r.errorMessage ? r.errorMessage : undefined,
    stack: typeof r.stackTrace === "string" && r.stackTrace ? r.stackTrace : undefined,
    runId: typeof r.runId === "number" ? r.runId : undefined,
  }));
}

/** Count per outcome, in a fixed order, only for outcomes that occur. */
export function summariseOutcomes(results: TestResult[]): { outcome: Outcome; count: number }[] {
  const order: Outcome[] = ["Passed", "Failed", "Blocked", "Aborted", "Inconclusive", "NotExecuted", "Other"];
  return order.map((outcome) => ({ outcome, count: results.filter((r) => r.outcome === outcome).length })).filter((o) => o.count > 0);
}

/** "1.2 s", "450 ms", "2 m 5 s". */
export function formatDuration(ms: number | undefined): string {
  if (ms === undefined || !Number.isFinite(ms) || ms < 0) return "";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)} s`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)} m ${total % 60} s`;
}
