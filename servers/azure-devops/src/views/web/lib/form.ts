/** Pure helpers behind the new work item form. */
import { PLANNING_FIELDS, REF, textField } from "./process-fields";
import { FIELD } from "./work-items";

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Plain text as safe HTML: one paragraph per block, single line breaks kept. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/[&<>"']/g, (c) => ESCAPES[c]).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Bold, italic, code and http(s) links inside one line of already-escaped text. */
function inlineMarkdown(escaped: string): string {
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>');
}

/** A small, safe Markdown subset (headings, lists, bold, italic, code, links, paragraphs) as HTML. Input is escaped first. */
export function markdownToHtml(markdown: string): string {
  return markdown
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const heading = /^(#{1,6})\s+(.*)$/.exec(lines[0]);
      if (heading && lines.length === 1) return `<h${heading[1].length}>${inlineMarkdown(escapeHtml(heading[2]))}</h${heading[1].length}>`;
      if (lines.every((l) => /^\s*[-*]\s+/.test(l))) return `<ul>${lines.map((l) => `<li>${inlineMarkdown(escapeHtml(l.replace(/^\s*[-*]\s+/, "")))}</li>`).join("")}</ul>`;
      if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return `<ol>${lines.map((l) => `<li>${inlineMarkdown(escapeHtml(l.replace(/^\s*\d+[.)]\s+/, "")))}</li>`).join("")}</ol>`;
      return `<p>${lines.map((l) => inlineMarkdown(escapeHtml(l))).join("<br>")}</p>`;
    })
    .join("");
}

/** Description text as HTML: text that already starts with a tag is kept (the service sanitises it), anything else is read as Markdown. */
export function descriptionToHtml(text: string): string {
  return /^\s*<[a-z!/]/i.test(text) ? text.trim() : markdownToHtml(text);
}

/**
 * A proposal's acceptance criteria for a type that has no such field become a section of the
 * description, so the user still sees and can edit what the assistant proposed.
 */
export function mergeAcceptance(initial: Partial<NewItemValues> | undefined, supportsAcceptance: boolean): Partial<NewItemValues> | undefined {
  if (!initial?.acceptance?.trim() || supportsAcceptance) return initial;
  const description = [initial.description?.trim(), `## Acceptance criteria\n\n${initial.acceptance.trim()}`].filter(Boolean).join("\n\n");
  return { ...initial, description, acceptance: "" };
}

export interface NewItemValues {
  title: string;
  description: string;
  acceptance: string;
  assignedTo: string;
  areaPath: string;
  iterationPath: string;
  tags: string[];
  priority: string;
  effort: string;
  /** Every other planning field and System Info, by reference name. */
  extras: Record<string, string>;
}

export const EMPTY_VALUES: NewItemValues = {
  title: "",
  description: "",
  acceptance: "",
  assignedTo: "",
  areaPath: "",
  iterationPath: "",
  tags: [],
  priority: "",
  effort: "",
  extras: {},
};

/** A planning field's value (Priority and Effort have their own keys, the rest live in `extras`). */
export function getValue(v: NewItemValues, ref: string): string {
  return ref === REF.priority ? v.priority : ref === REF.effort ? v.effort : (v.extras[ref] ?? "");
}

export function withValue(v: NewItemValues, ref: string, value: string): NewItemValues {
  if (ref === REF.priority) return { ...v, priority: value };
  if (ref === REF.effort) return { ...v, effort: value };
  return { ...v, extras: { ...v.extras, [ref]: value } };
}

/**
 * The `fields` map sent to the create tool. Empty values are left out, text is converted to HTML, and
 * only fields the type has (`fields`) are sent: a field the type lacks would make the service reject the item.
 */
export function toCreateFields(v: NewItemValues, fields: ReadonlySet<string>): Record<string, string> {
  const out: Record<string, string> = { [FIELD.title]: v.title.trim() };
  if (v.description.trim()) out[textField(fields).ref] = descriptionToHtml(v.description);
  if (fields.has(REF.acceptance) && v.acceptance.trim()) out[REF.acceptance] = descriptionToHtml(v.acceptance);
  if (fields.has(REF.systemInfo) && (v.extras[REF.systemInfo] ?? "").trim()) out[REF.systemInfo] = descriptionToHtml(v.extras[REF.systemInfo]);
  if (v.assignedTo.trim()) out[FIELD.assignedTo] = v.assignedTo.trim();
  if (v.areaPath.trim()) out[FIELD.areaPath] = v.areaPath.trim();
  if (v.iterationPath.trim()) out[FIELD.iterationPath] = v.iterationPath.trim();
  if (v.tags.length > 0) out[FIELD.tags] = v.tags.join("; ");
  for (const def of PLANNING_FIELDS) {
    if (def.readOnly) continue;
    const value = getValue(v, def.ref).trim();
    if (value && fields.has(def.ref)) out[def.ref] = value;
  }
  return out;
}

/** The parent type a new item of this type is normally linked under, from the backlog level order. */
export function parentTypeFor(type: string, levelTypes: string[][]): string | undefined {
  const index = levelTypes.findIndex((types) => types.includes(type));
  return index > 0 ? levelTypes[index - 1][0] : undefined;
}

/**
 * The proposal a model passes to `wit_work_item_form`, as form values. Every planning field the
 * proposal names is carried (the form drops what the chosen type does not have, so Create still
 * sends only fields the type has).
 */
export function proposalToValues(args: Record<string, unknown>): Partial<NewItemValues> & { type?: string; parentId?: number } {
  const str = (k: string): string | undefined => (typeof args[k] === "string" && (args[k] as string).trim() !== "" ? (args[k] as string) : undefined);
  const num = (k: string): string | undefined => (typeof args[k] === "number" || (typeof args[k] === "string" && (args[k] as string).trim() !== "") ? String(args[k]) : undefined);
  const extras: Record<string, string> = {};
  const put = (ref: string, value: string | undefined): void => {
    if (value !== undefined) extras[ref] = value;
  };
  put(REF.remaining, num("remainingWork"));
  put(REF.storyPoints, num("storyPoints"));
  put(REF.businessValue, num("businessValue"));
  put(REF.timeCriticality, num("timeCriticality"));
  put(REF.activity, str("activity"));
  put(REF.severity, str("severity"));
  put(REF.risk, str("risk"));
  put(REF.valueArea, str("valueArea"));
  put(REF.startDate, str("startDate"));
  put(REF.targetDate, str("targetDate"));
  put(REF.systemInfo, str("systemInfo"));
  return {
    type: str("type"),
    title: str("title") ?? "",
    // Bugs keep their main text in Repro Steps: a proposal that names it fills the same box.
    description: str("description") ?? str("reproSteps") ?? "",
    acceptance: str("acceptanceCriteria") ?? "",
    assignedTo: str("assignedTo") ?? "",
    areaPath: str("areaPath") ?? "",
    iterationPath: str("iterationPath") ?? "",
    tags: Array.isArray(args.tags) ? (args.tags as unknown[]).filter((t): t is string => typeof t === "string") : [],
    priority: num("priority") ?? "",
    effort: num("effort") ?? "",
    extras,
    parentId: typeof args.parentId === "number" ? args.parentId : undefined,
  };
}

/**
 * Defaults first, then the proposal: a proposal field that is undefined or null never replaces a default
 * (a spread would, and the form then read `undefined.trim()` and the view went blank).
 */
export function withDefaults<T extends object>(defaults: T, proposal: Partial<T> | undefined): T {
  const given = Object.fromEntries(Object.entries(proposal ?? {}).filter(([, v]) => v !== undefined && v !== null));
  return { ...defaults, ...given };
}
