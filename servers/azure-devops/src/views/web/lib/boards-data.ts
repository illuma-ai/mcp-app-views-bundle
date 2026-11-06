/** Read-only loaders that assemble what the boards views draw from tool calls. */
import type { AdoApi } from "./api";
import { toIterations, type Iteration } from "./boards-logic";
import { type BacklogLevel, type Card, type TypeInfo, toBacklogLevels, toCard } from "./work-items";

/** Used when the backlog list cannot be read (Basic process names). */
export const FALLBACK_LEVELS: BacklogLevel[] = [
  { id: "Microsoft.EpicCategory", name: "Epics", types: ["Epic"], rank: 3 },
  { id: "Microsoft.RequirementCategory", name: "Issues", types: ["Issue"], rank: 2 },
  { id: "Microsoft.TaskCategory", name: "Tasks", types: ["Task"], rank: 1 },
];

export const TASK_LEVEL_ID = "Microsoft.TaskCategory";
export const REQUIREMENT_LEVEL_ID = "Microsoft.RequirementCategory";

export async function loadLevels(api: AdoApi): Promise<BacklogLevel[]> {
  try {
    const levels = toBacklogLevels(await api.backlogLevels()).filter((l) => l.types.length > 0);
    return levels.length > 0 ? levels : FALLBACK_LEVELS;
  } catch {
    return FALLBACK_LEVELS;
  }
}

/** The level the board opens on: the requirement level (Issues / Stories), else the first one. */
export function defaultLevel(levels: BacklogLevel[]): BacklogLevel {
  return levels.find((l) => l.id === REQUIREMENT_LEVEL_ID) ?? levels.find((l) => l.id !== TASK_LEVEL_ID) ?? levels[0];
}

export interface TypeMaps {
  info: Record<string, TypeInfo>;
  colors: Record<string, string>;
  stateColors: Record<string, string>;
}

/** Colours and states of the given types, from the process (missing types fall back to defaults). */
export async function loadTypes(api: AdoApi, names: string[]): Promise<TypeMaps> {
  const found = await Promise.all([...new Set(names)].map((n) => api.workItemType(n)));
  const maps: TypeMaps = { info: {}, colors: {}, stateColors: {} };
  for (const t of found) {
    if (!t) continue;
    maps.info[t.name] = t;
    maps.colors[t.name] = t.color;
    for (const s of t.states) maps.stateColors[s.name] ??= s.color;
  }
  return maps;
}

export interface LevelItems {
  cards: Card[];
  revs: Map<number, number>;
}

/** The items of a level in backlog order, with the revision of each (used to guard moves). */
export async function loadLevelItems(api: AdoApi, level: BacklogLevel): Promise<LevelItems> {
  const ids = await api.idsOfTypes(level.types);
  const items = ids.length > 0 ? await api.batch(ids) : [];
  const revs = new Map<number, number>();
  for (const it of items) if (typeof it.rev === "number") revs.set(it.id, it.rev);
  return { cards: items.map(toCard), revs };
}

export interface SprintData {
  iterations: Iteration[];
}

export async function loadIterations(api: AdoApi): Promise<Iteration[]> {
  return toIterations(await api.teamIterations());
}

/** Every item scheduled in an iteration (parents and tasks). */
export async function loadSprintItems(api: AdoApi, iterationId: string): Promise<Card[]> {
  const ids = await api.iterationItemIds(iterationId);
  if (ids.length === 0) return [];
  return (await api.batch(ids)).map(toCard);
}

export interface ChildProgress {
  done: number;
  total: number;
}

/**
 * Done and total child tasks per parent, for the progress line on a card: one query for the task ids
 * and one batch for their parent and state, however many cards the board has.
 */
export async function loadChildProgress(api: AdoApi, childTypes: string[], doneStates: ReadonlySet<string>): Promise<Map<number, ChildProgress>> {
  const progress = new Map<number, ChildProgress>();
  if (childTypes.length === 0) return progress;
  const ids = await api.idsOfTypes(childTypes);
  if (ids.length === 0) return progress;
  for (const task of (await api.batch(ids)).map(toCard)) {
    if (task.parent === undefined) continue;
    const entry = progress.get(task.parent) ?? { done: 0, total: 0 };
    entry.total++;
    if (doneStates.has(task.state)) entry.done++;
    progress.set(task.parent, entry);
  }
  return progress;
}
