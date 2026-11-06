/** Pure logic behind the board, backlog and sprint views (grouping, hierarchy, iteration maths). */
import type { Card } from "./work-items.js";

export interface Column {
  name: string;
  category?: string;
  cards: Card[];
}

/** Default work-in-progress limit shown on the in-progress column (the process default; no tool returns the team's setting). */
export const DEFAULT_WIP_LIMIT = 5;

/** Cards grouped into the type's states, in state order; a card in an unknown state goes to the first column. */
export function groupByState(cards: Card[], states: { name: string; category?: string }[]): Column[] {
  const columns: Column[] = states.map((s) => ({ name: s.name, category: s.category, cards: [] }));
  if (columns.length === 0) columns.push({ name: "To Do", cards: [] });
  for (const card of [...cards].sort((a, b) => a.rank - b.rank || a.id - b.id)) {
    (columns.find((c) => c.name === card.state) ?? columns[0]).cards.push(card);
  }
  return columns;
}

export interface TreeNode {
  card: Card;
  children: TreeNode[];
}

/**
 * Parent/child hierarchy for the backlog. A card whose parent is not in the list is a root, so a
 * level picker that hides parents still shows every item. Order inside a level is backlog rank.
 */
export function buildTree(cards: Card[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  for (const card of cards) byId.set(card.id, { card, children: [] });
  const roots: TreeNode[] = [];
  const sorted = [...cards].sort((a, b) => a.rank - b.rank || a.id - b.id);
  for (const card of sorted) {
    const node = byId.get(card.id) as TreeNode;
    const parent = card.parent !== undefined ? byId.get(card.parent) : undefined;
    if (parent && parent !== node) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** Visible rows of a tree given the expanded ids; each row carries its depth. */
export function flattenTree(nodes: TreeNode[], expanded: ReadonlySet<number>): { node: TreeNode; depth: number }[] {
  const out: { node: TreeNode; depth: number }[] = [];
  const walk = (list: TreeNode[], depth: number): void => {
    for (const node of list) {
      out.push({ node, depth });
      if (expanded.has(node.card.id)) walk(node.children, depth + 1);
    }
  };
  walk(nodes, 0);
  return out;
}

export interface Iteration {
  id: string;
  name: string;
  path: string;
  start?: string;
  finish?: string;
  timeFrame?: "past" | "current" | "future" | string;
}

/** Iterations from the team iterations result. */
export function toIterations(raw: unknown): Iteration[] {
  const list = (raw as { value?: unknown[] } | unknown[] | undefined) ?? [];
  const items = Array.isArray(list) ? list : (list.value ?? []);
  return (items as Record<string, unknown>[])
    .filter((i) => i && typeof i.id === "string")
    .map((i) => {
      const attrs = (i.attributes ?? {}) as Record<string, unknown>;
      return {
        id: i.id as string,
        name: String(i.name ?? ""),
        path: String(i.path ?? i.name ?? ""),
        start: typeof attrs.startDate === "string" ? attrs.startDate : undefined,
        finish: typeof attrs.finishDate === "string" ? attrs.finishDate : undefined,
        timeFrame: typeof attrs.timeFrame === "string" ? attrs.timeFrame : undefined,
      };
    });
}

/** The sprint to open first: the current one, else the next one with dates, else the last. */
export function pickDefaultIteration(list: Iteration[]): Iteration | undefined {
  return list.find((i) => i.timeFrame === "current") ?? list.find((i) => i.timeFrame === "future") ?? list[list.length - 1];
}

const DAY_MS = 86_400_000;

/**
 * Working days (Monday to Friday) left from today through the finish day, as the sprint header
 * counts them; 0 once the sprint is over, undefined without a finish date. Days are compared in UTC
 * because iteration dates carry no time zone.
 */
export function daysRemaining(finish: string | undefined, now: Date = new Date()): number | undefined {
  if (!finish) return undefined;
  const end = Date.parse(finish);
  if (Number.isNaN(end)) return undefined;
  const endDay = Math.floor(end / DAY_MS);
  let day = Math.floor(now.getTime() / DAY_MS);
  let count = 0;
  for (; day <= endDay; day++) {
    const weekday = new Date(day * DAY_MS).getUTCDay();
    if (weekday !== 0 && weekday !== 6) count++;
  }
  return count;
}

export interface TaskRow {
  issue?: Card;
  columns: Column[];
}

/** Taskboard rows: one per issue in the sprint (with its tasks as cards), plus a row for unparented tasks. */
export function buildTaskboard(items: Card[], taskStates: { name: string; category?: string }[], parentTypes: ReadonlySet<string>, taskType: string): TaskRow[] {
  const parents = items.filter((c) => parentTypes.has(c.type));
  const tasks = items.filter((c) => c.type === taskType);
  const sortedParents = [...parents].sort((a, b) => a.rank - b.rank || a.id - b.id);
  const rows: TaskRow[] = sortedParents.map((issue) => ({
    issue,
    columns: groupByState(
      tasks.filter((t) => t.parent === issue.id),
      taskStates
    ),
  }));
  const parentIds = new Set(parents.map((p) => p.id));
  const orphans = tasks.filter((t) => t.parent === undefined || !parentIds.has(t.parent));
  if (orphans.length > 0) rows.push({ columns: groupByState(orphans, taskStates) });
  return rows;
}

export interface SprintTotals {
  tasks: number;
  done: number;
  remainingWork: number;
  effort: number;
}

/** Plain totals for the sprint summary (no history needed). */
export function sprintTotals(items: Card[], taskType: string, doneStates: ReadonlySet<string>): SprintTotals {
  const tasks = items.filter((c) => c.type === taskType);
  return {
    tasks: tasks.length,
    done: tasks.filter((t) => doneStates.has(t.state)).length,
    remainingWork: tasks.filter((t) => !doneStates.has(t.state)).reduce((sum, t) => sum + (t.remaining ?? 0), 0),
    effort: items.filter((c) => c.type !== taskType).reduce((sum, c) => sum + (c.effort ?? 0), 0),
  };
}
