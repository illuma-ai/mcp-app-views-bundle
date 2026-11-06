/**
 * Plain-text summaries for the board and sprint entry tools, so the chat answer is useful even when
 * the client does not render the view. They are built from the upstream tools' own callbacks (the
 * same calls the views make), so access control and the per-user token apply unchanged.
 */
import { DEFAULT_WIP_LIMIT, buildTaskboard, daysRemaining, groupByState, pickDefaultIteration, sprintTotals, toIterations } from "./web/lib/boards-logic.js";
import { parseToolResult } from "./web/lib/result.js";
import { type Card, type TypeInfo, toBacklogLevels, toCard, toTypeInfo, wiqlForTypes } from "./web/lib/work-items.js";

/** Calls an upstream tool by name and returns its parsed JSON (throws with the tool's error text). */
export type ToolCaller = (tool: string, args: Record<string, unknown>) => Promise<unknown>;

const REQUIREMENT_LEVEL = "Microsoft.RequirementCategory";
const TASK_LEVEL = "Microsoft.TaskCategory";
const MAX_PER_COLUMN = 8;

/** A caller backed by the callbacks recorded while the upstream tools registered themselves. */
export function callerFrom(callbacks: ReadonlyMap<string, (args: Record<string, unknown>, extra: unknown) => unknown>): ToolCaller {
  return async (tool, args) => {
    const callback = callbacks.get(tool);
    if (!callback) throw new Error(`${tool} is not enabled on this server.`);
    const parsed = parseToolResult((await callback(args, {})) as never);
    if (parsed.error) throw new Error(parsed.error);
    if (parsed.data === undefined) throw new Error(parsed.text ? parsed.text.slice(0, 200) : `${tool} returned no data.`);
    return parsed.data;
  };
}

async function batch(call: ToolCaller, project: string, ids: number[]): Promise<Card[]> {
  const out: Card[] = [];
  for (let i = 0; i < ids.length; i += 200) {
    const page = (await call("wit_work_item", {
      action: "get_batch",
      project,
      ids: ids.slice(i, i + 200),
      fields: [
        "System.Id",
        "System.WorkItemType",
        "System.Title",
        "System.State",
        "System.AssignedTo",
        "System.Tags",
        "System.Parent",
        "Microsoft.VSTS.Common.StackRank",
        "Microsoft.VSTS.Scheduling.Effort",
        "Microsoft.VSTS.Scheduling.RemainingWork",
      ],
    })) as { id: number; fields: Record<string, unknown> }[];
    out.push(...page.map(toCard));
  }
  return out;
}

async function typeInfo(call: ToolCaller, project: string, name: string): Promise<TypeInfo | undefined> {
  try {
    return toTypeInfo(await call("wit_work_item", { action: "get_type", project, workItemType: name }));
  } catch {
    return undefined;
  }
}

const line = (c: Card): string => `#${c.id} ${c.title}${c.assignee ? ` (${c.assignee.name})` : ""}`;

/** The team board as text: each column with its count and its cards. */
export async function boardSummary(call: ToolCaller, project: string, team: string): Promise<string> {
  const levels = toBacklogLevels(await call("wit_backlog", { action: "list", project, team })).filter((l) => l.types.length > 0);
  const level = levels.find((l) => l.id === REQUIREMENT_LEVEL) ?? levels.find((l) => l.id !== TASK_LEVEL) ?? levels[0];
  if (!level) return `${team} has no backlog levels.`;
  const ids =
    ((await call("wit_query", { action: "wiql", project, team, wiql: wiqlForTypes(level.types), top: 200 })) as { workItems?: { id?: number }[] }).workItems
      ?.map((w) => w.id)
      .filter((n): n is number => typeof n === "number") ?? [];
  const cards = ids.length > 0 ? await batch(call, project, ids) : [];
  const info = await typeInfo(call, project, level.types[0]);
  const columns = groupByState(cards, info?.states.length ? info.states : [{ name: "To Do" }, { name: "Doing", category: "InProgress" }, { name: "Done", category: "Completed" }]);
  const lines = [`${team} board, ${level.name}: ${cards.length} ${cards.length === 1 ? "item" : "items"} in project ${project}.`];
  for (const col of columns) {
    const count = col.category === "InProgress" ? `${col.cards.length}/${DEFAULT_WIP_LIMIT}` : String(col.cards.length);
    const shown = col.cards.slice(0, MAX_PER_COLUMN).map(line);
    const more = col.cards.length > MAX_PER_COLUMN ? ` and ${col.cards.length - MAX_PER_COLUMN} more` : "";
    lines.push(`${col.name} (${count}): ${shown.length ? shown.join("; ") + more : "empty"}`);
  }
  return lines.join("\n");
}

/** The current (or named) sprint as text: dates, totals and the tasks per issue. */
export async function sprintSummary(call: ToolCaller, project: string, team: string, iterationName?: string, now: Date = new Date()): Promise<string> {
  const iterations = toIterations(await call("work", { action: "list_team_iterations", project, team }));
  if (iterations.length === 0) return `${team} has no iterations assigned.`;
  const iteration = (iterationName && iterations.find((i) => i.name.toLowerCase() === iterationName.toLowerCase())) || pickDefaultIteration(iterations);
  if (!iteration) return `${team} has no iterations assigned.`;
  const ids =
    ((await call("wit_work_item", { action: "list_for_iteration", project, team, iterationId: iteration.id })) as { workItemRelations?: { target?: { id?: number } }[] }).workItemRelations
      ?.map((r) => r.target?.id)
      .filter((n): n is number => typeof n === "number") ?? [];
  const items = ids.length > 0 ? await batch(call, project, [...new Set(ids)]) : [];
  const left = daysRemaining(iteration.finish, now);
  const dates =
    iteration.start && iteration.finish
      ? `${iteration.start.slice(0, 10)} to ${iteration.finish.slice(0, 10)}${left === undefined ? "" : `, ${left} working ${left === 1 ? "day" : "days"} remaining`}`
      : "no iteration dates set";
  const head = `${iteration.name}${iteration.timeFrame === "current" ? " (current sprint)" : ""} of ${team}, ${dates}.`;
  if (items.length === 0) return `${head}\nNo work is scheduled in this sprint yet.`;

  const requirement = toBacklogLevels(await call("wit_backlog", { action: "list", project, team }).catch(() => [])).find((l) => l.id === REQUIREMENT_LEVEL);
  const taskType = "Task";
  const taskInfo = await typeInfo(call, project, taskType);
  const states = taskInfo?.states.length ? taskInfo.states : [{ name: "To Do" }, { name: "Doing" }, { name: "Done", category: "Completed" }];
  const done = new Set(states.filter((s) => (s as { category?: string }).category === "Completed" || s.name === "Done").map((s) => s.name));
  const totals = sprintTotals(items, taskType, done);
  const lines = [head, `${items.length} items scheduled; ${totals.tasks} tasks (${totals.done} done), ${totals.remainingWork} h remaining, effort ${totals.effort}.`];
  for (const row of buildTaskboard(items, states, new Set(requirement?.types ?? ["Issue"]), taskType)) {
    const counts = row.columns.map((c) => `${c.name} ${c.cards.length}`).join(", ");
    lines.push(`${row.issue ? line(row.issue) + ` [${row.issue.state}]` : "Tasks without an issue"}: ${counts}`);
  }
  return lines.join("\n");
}
