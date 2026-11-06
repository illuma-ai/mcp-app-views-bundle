/** Work item shapes and field helpers shared by the boards views. Pure: no DOM, no host calls. */

export const FIELD = {
  id: "System.Id",
  type: "System.WorkItemType",
  title: "System.Title",
  state: "System.State",
  reason: "System.Reason",
  assignedTo: "System.AssignedTo",
  tags: "System.Tags",
  parent: "System.Parent",
  areaPath: "System.AreaPath",
  iterationPath: "System.IterationPath",
  description: "System.Description",
  acceptance: "Microsoft.VSTS.Common.AcceptanceCriteria",
  stackRank: "Microsoft.VSTS.Common.StackRank",
  priority: "Microsoft.VSTS.Common.Priority",
  effort: "Microsoft.VSTS.Scheduling.Effort",
  storyPoints: "Microsoft.VSTS.Scheduling.StoryPoints",
  remaining: "Microsoft.VSTS.Scheduling.RemainingWork",
  changedDate: "System.ChangedDate",
} as const;

/** The fields every board, backlog and sprint list asks for in one batch call. */
export const LIST_FIELDS: string[] = [
  FIELD.id,
  FIELD.type,
  FIELD.title,
  FIELD.state,
  FIELD.assignedTo,
  FIELD.tags,
  FIELD.parent,
  FIELD.stackRank,
  FIELD.effort,
  FIELD.storyPoints,
  FIELD.remaining,
  FIELD.iterationPath,
  FIELD.areaPath,
  FIELD.changedDate,
];

export type Identity = { displayName?: string; uniqueName?: string } | string | undefined;

export interface WorkItem {
  id: number;
  rev?: number;
  fields: Record<string, unknown>;
  url?: string;
}

export interface Person {
  name: string;
  email?: string;
}

export interface Card {
  id: number;
  type: string;
  title: string;
  state: string;
  assignee?: Person;
  tags: string[];
  parent?: number;
  effort?: number;
  priority?: number;
  remaining?: number;
  iterationPath?: string;
  areaPath?: string;
  /** When the item last changed (ISO). */
  changed?: string;
  rank: number;
}

/** "Name <email>" (what the batch tool returns) or an identity object, as a person. */
export function toPerson(value: unknown): Person | undefined {
  if (!value) return undefined;
  if (typeof value === "object") {
    const v = value as { displayName?: string; uniqueName?: string };
    return v.displayName || v.uniqueName ? { name: v.displayName ?? v.uniqueName ?? "", email: v.uniqueName } : undefined;
  }
  if (typeof value !== "string" || !value.trim()) return undefined;
  const m = /^(.*?)\s*<([^<>]*)>\s*$/.exec(value);
  return m ? { name: m[1] || m[2], email: m[2] || undefined } : { name: value.trim() };
}

/** "a; b; c" as a trimmed list. */
export function splitTags(value: unknown): string[] {
  return typeof value === "string"
    ? value
        .split(";")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A list row from a raw work item. Missing fields become empty values, never throw. */
export function toCard(item: WorkItem): Card {
  const f = item.fields ?? {};
  return {
    id: item.id ?? (f[FIELD.id] as number),
    type: String(f[FIELD.type] ?? ""),
    title: String(f[FIELD.title] ?? ""),
    state: String(f[FIELD.state] ?? ""),
    assignee: toPerson(f[FIELD.assignedTo]),
    tags: splitTags(f[FIELD.tags]),
    parent: num(f[FIELD.parent]),
    // Agile stories carry Story Points where Basic items carry Effort: one number for the backlog column and the totals.
    effort: num(f[FIELD.effort]) ?? num(f[FIELD.storyPoints]),
    priority: num(f[FIELD.priority]),
    remaining: num(f[FIELD.remaining]),
    iterationPath: typeof f[FIELD.iterationPath] === "string" ? (f[FIELD.iterationPath] as string) : undefined,
    areaPath: typeof f[FIELD.areaPath] === "string" ? (f[FIELD.areaPath] as string) : undefined,
    changed: typeof f[FIELD.changedDate] === "string" ? (f[FIELD.changedDate] as string) : undefined,
    rank: num(f[FIELD.stackRank]) ?? Number.MAX_SAFE_INTEGER,
  };
}

/** Escapes a value for a single-quoted WIQL string literal. */
export function wiqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/** WIQL for the work items of the given types in the current project, in backlog order, without removed items. */
export function wiqlForTypes(types: string[]): string {
  const list = types.map((t) => `'${wiqlString(t)}'`).join(", ");
  return (
    `SELECT [System.Id] FROM WorkItems WHERE [System.TeamProject] = @project ` +
    `AND [System.WorkItemType] IN (${list}) AND [System.State] <> 'Removed' ` +
    `ORDER BY [Microsoft.VSTS.Common.StackRank] ASC, [System.Id] ASC`
  );
}

export interface BacklogLevel {
  id: string;
  name: string;
  types: string[];
  rank: number;
}

/** Backlog levels (Epics, Issues, Tasks...) from the backlog list result, in hierarchy order. */
export function toBacklogLevels(raw: unknown): BacklogLevel[] {
  const list = Array.isArray(raw) ? raw : ((raw as { value?: unknown[] } | undefined)?.value ?? []);
  return (list as Record<string, unknown>[])
    .filter((l) => typeof l?.id === "string" && typeof l?.name === "string")
    .map((l) => ({
      id: l.id as string,
      name: l.name as string,
      types: ((l.workItemTypes as { name?: string }[] | undefined) ?? []).map((t) => t.name).filter((n): n is string => Boolean(n)),
      rank: typeof l.rank === "number" ? l.rank : 0,
    }))
    .sort((a, b) => b.rank - a.rank);
}

export interface TypeInfo {
  name: string;
  color: string;
  icon?: string;
  states: { name: string; color: string; category?: string }[];
  /** Reference names of the fields the type has (empty when they could not be read). */
  fieldRefs: string[];
}

/** The parts of a work item type the views use (colour, icon, ordered states). */
export function toTypeInfo(raw: unknown): TypeInfo | undefined {
  const t = raw as
    | {
        name?: string;
        color?: string;
        icon?: { id?: string };
        states?: { name?: string; color?: string; category?: string }[];
        fields?: { referenceName?: string }[];
      }
    | undefined;
  if (!t?.name) return undefined;
  return {
    name: t.name,
    color: `#${(t.color ?? "666666").replace(/^#/, "")}`,
    icon: t.icon?.id,
    fieldRefs: (t.fields ?? []).map((f) => f.referenceName).filter((r): r is string => Boolean(r)),
    states: (t.states ?? [])
      .filter((s) => s.name)
      .map((s) => ({
        name: s.name as string,
        color: `#${(s.color ?? "b2b2b2").replace(/^#/, "")}`,
        category: s.category,
      })),
  };
}

/** Colours used when the type lookup is unavailable (Basic process defaults). */
export const FALLBACK_TYPE_COLORS: Record<string, string> = {
  "Epic": "#FF7B00",
  "Feature": "#773B93",
  "User Story": "#009CCC",
  "Issue": "#B4009E",
  "Task": "#F2CB1D",
  "Bug": "#CC293D",
  "Test Case": "#004B50",
};

export const FALLBACK_STATE_COLORS: Record<string, string> = {
  "To Do": "#b2b2b2",
  "New": "#b2b2b2",
  "Doing": "#007acc",
  "Active": "#007acc",
  "Done": "#339933",
  "Closed": "#339933",
  "Resolved": "#ff9d00",
};

/** The web URL of a work item in the organization, used for "open in Azure DevOps" links. */
export function workItemUrl(org: string, project: string, id: number): string {
  return `https://dev.azure.com/${encodeURIComponent(org)}/${encodeURIComponent(project)}/_workitems/edit/${id}`;
}
