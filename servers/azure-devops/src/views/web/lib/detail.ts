/** Pure logic behind the work item detail and the query results: ids, relations, edits, history. */
import { PLANNING_FIELDS, REF } from "./process-fields";
import { FIELD, toPerson, type Person } from "./work-items";

/**
 * Work item ids found in a tool result: a list of items, a WIQL result (`workItems`), a predefined
 * query (`results`), an iteration (`workItemRelations`) or a paged `value`. Order is kept, ids unique.
 */
export function extractWorkItemIds(data: unknown, limit = 200): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  const add = (v: unknown): void => {
    const id = typeof v === "number" ? v : typeof (v as { id?: unknown } | null)?.id === "number" ? (v as { id: number }).id : undefined;
    if (id !== undefined && !seen.has(id) && ids.length < limit) {
      seen.add(id);
      ids.push(id);
    }
  };
  const list = (v: unknown): void => {
    if (Array.isArray(v)) v.forEach(add);
  };
  if (Array.isArray(data)) list(data);
  else if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    list(d.workItems);
    list(d.results);
    list(d.value);
    if (Array.isArray(d.workItemRelations)) {
      for (const r of d.workItemRelations as { target?: unknown }[]) add(r.target);
    }
  }
  return ids;
}

export type RelationKind = "parent" | "child" | "related" | "attachment" | "hyperlink" | "artifact" | "other";

export interface Relation {
  kind: RelationKind;
  label: string;
  url: string;
  /** Work item id for parent, child and related links. */
  workItemId?: number;
  name?: string;
  comment?: string;
  size?: number;
}

const REL_LABEL: Record<string, [RelationKind, string]> = {
  "System.LinkTypes.Hierarchy-Reverse": ["parent", "Parent"],
  "System.LinkTypes.Hierarchy-Forward": ["child", "Child"],
  "System.LinkTypes.Related": ["related", "Related"],
  "System.LinkTypes.Duplicate-Forward": ["related", "Duplicate"],
  "System.LinkTypes.Duplicate-Reverse": ["related", "Duplicate of"],
  "System.LinkTypes.Dependency-Forward": ["related", "Successor"],
  "System.LinkTypes.Dependency-Reverse": ["related", "Predecessor"],
  "AttachedFile": ["attachment", "Attachment"],
  "Hyperlink": ["hyperlink", "Hyperlink"],
  "ArtifactLink": ["artifact", "Artifact"],
};

/** The relations of a work item read with expand=All, labelled the way the web form labels them. */
export function toRelations(raw: unknown): Relation[] {
  const list = Array.isArray(raw) ? (raw as Record<string, unknown>[]) : [];
  return list.map((r) => {
    const rel = String(r.rel ?? "");
    const attrs = (r.attributes ?? {}) as Record<string, unknown>;
    const url = String(r.url ?? "");
    const [kind, label] = REL_LABEL[rel] ?? ["other", rel || "Link"];
    const id = /\/workItems\/(\d+)$/i.exec(url)?.[1];
    return {
      kind,
      label: kind === "artifact" && typeof attrs.name === "string" ? attrs.name : label,
      url,
      workItemId: id && (kind === "parent" || kind === "child" || kind === "related") ? Number(id) : undefined,
      name: typeof attrs.name === "string" ? attrs.name : undefined,
      comment: typeof attrs.comment === "string" ? attrs.comment : undefined,
      size: typeof attrs.resourceSize === "number" ? attrs.resourceSize : undefined,
    };
  });
}

export interface Comment {
  id: number;
  author?: Person;
  date?: string;
  html: string;
}

/** Comments from the list_comments result. */
export function toComments(raw: unknown): Comment[] {
  const list = ((raw as { comments?: unknown[] } | undefined)?.comments ?? []) as Record<string, unknown>[];
  return list.map((c) => ({
    id: Number(c.id),
    author: toPerson(c.createdBy),
    date: typeof c.createdDate === "string" ? c.createdDate : undefined,
    html: typeof c.text === "string" ? c.text : "",
  }));
}

export interface HistoryChange {
  field: string;
  from: string;
  to: string;
}

export interface HistoryEntry {
  rev: number;
  by?: Person;
  date?: string;
  changes: HistoryChange[];
}

const TRACKED: [string, string][] = [
  [FIELD.title, "Title"],
  [FIELD.state, "State"],
  [FIELD.assignedTo, "Assigned To"],
  [FIELD.iterationPath, "Iteration"],
  [FIELD.areaPath, "Area"],
  [FIELD.tags, "Tags"],
  [FIELD.priority, "Priority"],
  [FIELD.effort, "Effort"],
  [FIELD.remaining, "Remaining Work"],
];

function show(v: unknown): string {
  if (v === undefined || v === null || v === "") return "";
  if (typeof v === "object") return toPerson(v)?.name ?? "";
  const person = typeof v === "string" ? toPerson(v) : undefined;
  return person?.email ? person.name : String(v);
}

/** What changed in each revision, newest first. Revision 1 is the creation. */
export function toHistory(raw: unknown): HistoryEntry[] {
  const revs = (Array.isArray(raw) ? raw : []) as { rev?: number; fields?: Record<string, unknown> }[];
  const sorted = [...revs].sort((a, b) => (a.rev ?? 0) - (b.rev ?? 0));
  const out: HistoryEntry[] = [];
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1]?.fields ?? {};
    const f = r.fields ?? {};
    const changes: HistoryChange[] = [];
    for (const [ref, label] of TRACKED) {
      const from = show(prev[ref]);
      const to = show(f[ref]);
      if (from !== to && (i > 0 || to !== "")) changes.push({ field: label, from, to });
    }
    if (i > 0 && show(prev[FIELD.description]) !== show(f[FIELD.description])) changes.push({ field: "Description", from: "", to: "changed" });
    out.push({
      rev: r.rev ?? i + 1,
      by: toPerson(f["System.ChangedBy"]),
      date: typeof f[FIELD.changedDate] === "string" ? (f[FIELD.changedDate] as string) : undefined,
      changes,
    });
  });
  return out.reverse();
}

/** The values the detail form can edit, as strings keyed by field reference. */
export type Draft = Record<string, string>;

export const EDITABLE: string[] = [
  FIELD.title,
  FIELD.state,
  FIELD.assignedTo,
  FIELD.iterationPath,
  FIELD.tags,
  ...PLANNING_FIELDS.map((f) => f.ref),
  FIELD.description,
  REF.reproSteps,
  FIELD.acceptance,
  REF.systemInfo,
];

/** Edit-form values from a work item's fields. */
export function toDraft(fields: Record<string, unknown>): Draft {
  const draft: Draft = {};
  for (const ref of EDITABLE) {
    const v = fields[ref];
    draft[ref] = ref === FIELD.assignedTo ? (toPerson(v)?.email ?? toPerson(v)?.name ?? "") : v === undefined || v === null ? "" : String(v);
  }
  return draft;
}

const NUMERIC = new Set<string>(PLANNING_FIELDS.filter((f) => f.numeric).map((f) => f.ref));

/**
 * The JSON patch for the fields that changed, guarded by the revision that was read (so an edit
 * made elsewhere is reported instead of overwritten). Empty when nothing changed.
 */
export function buildUpdates(original: Draft, edited: Draft, rev: number | undefined): { op: string; path: string; value?: unknown }[] {
  const ops: { op: string; path: string; value?: unknown }[] = [];
  for (const ref of EDITABLE) {
    if ((original[ref] ?? "") === (edited[ref] ?? "")) continue;
    const value = edited[ref] ?? "";
    if (value === "") ops.push({ op: "remove", path: `/fields/${ref}` });
    else ops.push({ op: "replace", path: `/fields/${ref}`, value: NUMERIC.has(ref) ? Number(value) : value });
  }
  return ops.length > 0 && rev !== undefined ? [{ op: "test", path: "/rev", value: rev }, ...ops] : ops;
}

/** Size as B / KB / MB. */
export function formatSize(bytes: number | undefined): string {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(bytes < 10_240 ? 1 : 0)} KB`;
  return `${(bytes / 1_048_576).toFixed(1)} MB`;
}

/** "just now", "24m ago", "3h ago", "5d ago" (older than 30 days: the date). */
export function formatAgo(iso: string | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return "";
  const minutes = Math.max(0, Math.floor((now.getTime() - then) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days <= 30 ? `${days}d ago` : new Date(then).toLocaleDateString();
}

/** The web UI's wording for a time that just passed: "Just now", then "3h ago". */
export function agoLabel(iso: string, now?: Date): string {
  const t = formatAgo(iso, now);
  return t === "just now" ? "Just now" : t;
}
