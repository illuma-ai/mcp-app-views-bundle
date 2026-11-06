/**
 * Which fields a work item form shows, driven by the fields the work item type actually has. The
 * processes differ (Basic: Priority and Effort; Agile: Story Points, Risk, Value area, Acceptance
 * Criteria; Scrum: Effort, Business Value; Bug: Repro Steps, System Info, Severity), so the form asks
 * the type instead of assuming one process and never sends a field the type does not have.
 */

export const REF = {
  description: "System.Description",
  acceptance: "Microsoft.VSTS.Common.AcceptanceCriteria",
  reproSteps: "Microsoft.VSTS.TCM.ReproSteps",
  systemInfo: "Microsoft.VSTS.TCM.SystemInfo",
  priority: "Microsoft.VSTS.Common.Priority",
  effort: "Microsoft.VSTS.Scheduling.Effort",
  storyPoints: "Microsoft.VSTS.Scheduling.StoryPoints",
  remaining: "Microsoft.VSTS.Scheduling.RemainingWork",
  businessValue: "Microsoft.VSTS.Common.BusinessValue",
  risk: "Microsoft.VSTS.Common.Risk",
  valueArea: "Microsoft.VSTS.Common.ValueArea",
  severity: "Microsoft.VSTS.Common.Severity",
  activity: "Microsoft.VSTS.Common.Activity",
  timeCriticality: "Microsoft.VSTS.Common.TimeCriticality",
  startDate: "Microsoft.VSTS.Scheduling.StartDate",
  targetDate: "Microsoft.VSTS.Scheduling.TargetDate",
  resolvedReason: "Microsoft.VSTS.Common.ResolvedReason",
  originalEstimate: "Microsoft.VSTS.Scheduling.OriginalEstimate",
  completed: "Microsoft.VSTS.Scheduling.CompletedWork",
  foundIn: "Microsoft.VSTS.Build.FoundIn",
  integrationBuild: "Microsoft.VSTS.Build.IntegrationBuild",
} as const;

export interface FieldDef {
  ref: string;
  label: string;
  kind: "select" | "number" | "date" | "text";
  /** Shown as plain text with a lock: the service sets it (Resolved Reason). */
  readOnly?: boolean;
  /** Hint shown beside the label (the info icon of the web form). */
  info?: string;
  /** Choices for a select (the process's own picklist values). */
  options?: string[];
  /** Sent to the service as a number. */
  numeric?: boolean;
}

/** The single-value fields of the Planning column, in the order the web form shows them. */
export const PLANNING_FIELDS: readonly FieldDef[] = [
  { ref: REF.priority, label: "Priority", kind: "select", options: ["1", "2", "3", "4"], numeric: true },
  { ref: REF.severity, label: "Severity", kind: "select", options: ["1 - Critical", "2 - High", "3 - Medium", "4 - Low"] },
  { ref: REF.activity, label: "Activity", kind: "select", options: ["Deployment", "Design", "Development", "Documentation", "Requirements", "Testing"] },
  { ref: REF.effort, label: "Effort", kind: "number", numeric: true },
  { ref: REF.storyPoints, label: "Story Points", kind: "number", numeric: true },
  { ref: REF.remaining, label: "Remaining Work", kind: "number", numeric: true },
  { ref: REF.businessValue, label: "Business Value", kind: "number", numeric: true },
  { ref: REF.timeCriticality, label: "Time Criticality", kind: "number", numeric: true },
  { ref: REF.risk, label: "Risk", kind: "select", options: ["1 - High", "2 - Medium", "3 - Low"] },
  { ref: REF.valueArea, label: "Value area", kind: "select", options: ["Business", "Architectural"] },
  { ref: REF.resolvedReason, label: "Resolved Reason", kind: "text", readOnly: true },
  { ref: REF.originalEstimate, label: "Original Estimate", kind: "number", numeric: true },
  { ref: REF.completed, label: "Completed", kind: "number", numeric: true },
  { ref: REF.foundIn, label: "Found in Build", kind: "text" },
  { ref: REF.integrationBuild, label: "Integrated in Build", kind: "text" },
  { ref: REF.startDate, label: "Start Date", kind: "date", info: "The date work is planned to start." },
  { ref: REF.targetDate, label: "Target Date", kind: "date", info: "The date work is planned to be complete." },
];

/** Used when the type's fields could not be read: what the Basic process has. */
export function fallbackFields(typeName: string): Set<string> {
  const base = [REF.description, REF.priority];
  if (typeName === "Task") return new Set([...base, REF.remaining]);
  if (["User Story", "Bug", "Product Backlog Item", "Requirement"].includes(typeName)) return new Set([...base, REF.acceptance, REF.storyPoints]);
  return new Set([...base, REF.effort]);
}

/** The fields to treat as present: the type's own, or the fallback when none were read. */
export function effectiveFields(typeName: string, fieldRefs: readonly string[] | undefined): Set<string> {
  return fieldRefs && fieldRefs.length > 0 ? new Set(fieldRefs) : fallbackFields(typeName);
}

/** The rich text field that holds the main text: Description, or Repro Steps for types that have no Description (Bug). */
export function textField(fields: ReadonlySet<string>): { ref: string; label: string } {
  if (fields.has(REF.description) || !fields.has(REF.reproSteps)) return { ref: REF.description, label: "Description" };
  return { ref: REF.reproSteps, label: "Repro Steps" };
}

/** The planning fields the type has (labels and choices from the table above). */
export function planningFieldsFor(fields: ReadonlySet<string>): FieldDef[] {
  return PLANNING_FIELDS.filter((f) => fields.has(f.ref));
}

export interface FieldGroup {
  title: string;
  fields: FieldDef[];
  /** "main": the Planning column; "side": after Related Work in the right column. */
  column: "main" | "side";
}

interface GroupSpec {
  title: string;
  refs: string[];
  column?: "main" | "side";
}

/** The groups and the order of the fields, per type, as the web form lays them out (captures 16 to 21 and agile-01 to agile-04). */
const LAYOUTS: Record<string, GroupSpec[]> = {
  "User Story": [
    { title: "Planning", refs: [REF.storyPoints, REF.priority, REF.risk] },
    { title: "Classification", refs: [REF.valueArea] },
  ],
  "Feature": [
    { title: "Planning", refs: [REF.priority, REF.risk, REF.effort, REF.businessValue, REF.timeCriticality, REF.startDate, REF.targetDate] },
    { title: "Classification", refs: [REF.valueArea] },
  ],
  "Bug": [
    { title: "Planning", refs: [REF.resolvedReason, REF.storyPoints, REF.priority, REF.severity, REF.activity] },
    { title: "Effort (Hours)", refs: [REF.originalEstimate, REF.remaining, REF.completed] },
    { title: "Build", refs: [REF.foundIn, REF.integrationBuild], column: "side" },
  ],
};
LAYOUTS["Epic"] = LAYOUTS["Feature"];

/**
 * The field groups of a form: the type's layout when it has one, in its order and limited to the fields
 * the type has and the layout names. A type without a layout shows the generic Planning list.
 * Tasks with hour estimates (Agile) get an "Effort (Hours)" group; Basic tasks keep Remaining Work in Planning.
 */
export function fieldGroupsFor(typeName: string, fields: ReadonlySet<string>): FieldGroup[] {
  const byRef = new Map(PLANNING_FIELDS.map((f) => [f.ref, f]));
  let specs = LAYOUTS[typeName];
  if (!specs && typeName === "Task" && (fields.has(REF.originalEstimate) || fields.has(REF.completed))) {
    specs = [
      { title: "Planning", refs: [REF.priority, REF.activity] },
      { title: "Effort (Hours)", refs: [REF.originalEstimate, REF.remaining, REF.completed] },
    ];
  }
  if (!specs) return [{ title: "Planning", fields: planningFieldsFor(fields), column: "main" }];
  const groups: FieldGroup[] = specs
    .map((g) => ({
      title: g.title,
      column: g.column ?? "main",
      fields: g.refs
        .filter((r) => fields.has(r) && byRef.has(r))
        .map((r) => {
          const def = byRef.get(r) as FieldDef;
          // In the "Effort (Hours)" group the web form words Remaining Work as "Remaining".
          return g.title === "Effort (Hours)" && r === REF.remaining ? { ...def, label: "Remaining" } : def;
        }),
    }))
    .filter((g) => g.fields.length > 0);
  // Strict: a field the type has but the real layout does not show (Resolved Reason on a story, Start Date on a Bug) stays off the form.
  return groups;
}
