import { describe, expect, it } from "@jest/globals";
import { EMPTY_VALUES, toCreateFields, withValue } from "../../../src/views/web/lib/form";
import { proposalToValues, toCreateFields, EMPTY_VALUES } from "../../../src/views/web/lib/form";
import { REF, effectiveFields, fieldGroupsFor, planningFieldsFor, textField } from "../../../src/views/web/lib/process-fields";
import { buildUpdates, toDraft } from "../../../src/views/web/lib/detail";
import { toTypeInfo } from "../../../src/views/web/lib/work-items";

const values = (over: Partial<typeof EMPTY_VALUES>) => ({ ...EMPTY_VALUES, title: "T", ...over });

describe("fields follow the work item type", () => {
  it("reads the field list from the type", () => {
    const info = toTypeInfo({ name: "User Story", color: "009ccc", fields: [{ referenceName: "System.Title" }, { referenceName: REF.storyPoints }] });
    expect(info?.fieldRefs).toEqual(["System.Title", REF.storyPoints]);
    expect(toTypeInfo({ name: "Issue", color: "339933" })?.fieldRefs).toEqual([]);
  });

  it("Agile story: Story Points and Acceptance Criteria, never Effort", () => {
    const fields = new Set([REF.description, REF.acceptance, REF.storyPoints, REF.priority, REF.risk, REF.valueArea]);
    const v = withValue(withValue(values({ description: "d", acceptance: "a", effort: "5", priority: "2" }), REF.storyPoints, "8"), REF.risk, "2 - Medium");
    expect(toCreateFields(v, fields)).toEqual({
      "System.Title": "T",
      [REF.description]: "<p>d</p>",
      [REF.acceptance]: "<p>a</p>",
      [REF.priority]: "2",
      [REF.storyPoints]: "8",
      [REF.risk]: "2 - Medium",
    });
    expect(planningFieldsFor(fields).map((f) => f.label)).toEqual(["Priority", "Story Points", "Risk", "Value area"]);
  });

  it("Scrum backlog item: Effort and Business Value", () => {
    const fields = new Set([REF.description, REF.acceptance, REF.effort, REF.businessValue, REF.priority]);
    const out = toCreateFields(withValue(values({ effort: "3" }), REF.businessValue, "50"), fields);
    expect(out[REF.effort]).toBe("3");
    expect(out[REF.businessValue]).toBe("50");
    expect(out[REF.storyPoints]).toBeUndefined();
  });

  it("Bug: Repro Steps take the place of Description, with System Info and Severity", () => {
    const fields = new Set([REF.reproSteps, REF.systemInfo, REF.severity, REF.priority, REF.acceptance]);
    expect(textField(fields)).toEqual({ ref: REF.reproSteps, label: "Repro Steps" });
    const v = withValue(withValue(values({ description: "1. Open\n2. Crash" }), REF.severity, "2 - High"), REF.systemInfo, "Windows 11");
    const out = toCreateFields(v, fields);
    expect(out[REF.reproSteps]).toBe("<ol><li>Open</li><li>Crash</li></ol>");
    expect(out[REF.description]).toBeUndefined();
    expect(out[REF.severity]).toBe("2 - High");
    expect(out[REF.systemInfo]).toBe("<p>Windows 11</p>");
  });

  it("Basic issue and task, and a type whose fields could not be read", () => {
    expect(planningFieldsFor(effectiveFields("Issue", ["System.Title", REF.priority, REF.effort])).map((f) => f.label)).toEqual(["Priority", "Effort"]);
    expect(planningFieldsFor(effectiveFields("Task", undefined)).map((f) => f.label)).toEqual(["Priority", "Remaining Work"]);
    // A Task in the Basic process: Priority, Activity, Remaining Work (the real page's order); an Epic: Priority, Start Date, Target Date.
    expect(planningFieldsFor(effectiveFields("Task", [REF.priority, REF.activity, REF.remaining])).map((f) => f.label)).toEqual(["Priority", "Activity", "Remaining Work"]);
    expect(planningFieldsFor(effectiveFields("Epic", [REF.priority, REF.startDate, REF.targetDate])).map((f) => [f.label, f.kind])).toEqual([
      ["Priority", "select"],
      ["Start Date", "date"],
      ["Target Date", "date"],
    ]);
    expect(planningFieldsFor(effectiveFields("User Story", [])).map((f) => f.label)).toEqual(["Priority", "Story Points"]);
  });

  it("never sends a field the type lacks", () => {
    const out = toCreateFields(values({ effort: "5", priority: "1", description: "d", acceptance: "a" }), new Set([REF.description]));
    expect(out).toEqual({ "System.Title": "T", [REF.description]: "<p>d</p>" });
  });
});

describe("editing planning fields on the detail form", () => {
  it("reads and patches Story Points, Severity and Business Value as the service expects", () => {
    const original = toDraft({ [REF.storyPoints]: 5, [REF.severity]: "3 - Medium", [REF.businessValue]: 10 });
    const edited = { ...original, [REF.storyPoints]: "8", [REF.severity]: "2 - High" };
    expect(buildUpdates(original, edited, 4)).toEqual([
      { op: "test", path: "/rev", value: 4 },
      { op: "replace", path: `/fields/${REF.severity}`, value: "2 - High" },
      { op: "replace", path: `/fields/${REF.storyPoints}`, value: 8 },
    ]);
  });
});

describe("the Agile process", () => {
  it("shows the Agile fields of each type, in order, and nothing else", () => {
    const story = effectiveFields("User Story", [REF.priority, REF.storyPoints, REF.risk, REF.valueArea, REF.acceptance, REF.description]);
    expect(planningFieldsFor(story).map((f) => f.label)).toEqual(["Priority", "Story Points", "Risk", "Value area"]);
    const feature = effectiveFields("Feature", [REF.priority, REF.effort, REF.businessValue, REF.timeCriticality, REF.valueArea, REF.startDate, REF.targetDate]);
    expect(planningFieldsFor(feature).map((f) => f.label)).toEqual(["Priority", "Effort", "Business Value", "Time Criticality", "Value area", "Start Date", "Target Date"]);
    const bug = effectiveFields("Bug", [REF.priority, REF.severity, REF.storyPoints, REF.reproSteps, REF.systemInfo]);
    expect(planningFieldsFor(bug).map((f) => f.label)).toEqual(["Priority", "Severity", "Story Points"]);
    expect(textField(bug).label).toBe("Repro Steps");
  });
});

describe("the form tool's proposal reaches the form", () => {
  it("carries every planning field the proposal names, and Create sends only the type's own", () => {
    const v = proposalToValues({ type: "Task", title: "T", remainingWork: 4, activity: "Development", priority: 2, storyPoints: 3, startDate: "2026-11-30", reproSteps: "steps", tags: ["a"] });
    expect(v).toMatchObject({ type: "Task", title: "T", description: "steps", priority: "2", tags: ["a"] });
    expect(v.extras).toEqual({ [REF.remaining]: "4", [REF.activity]: "Development", [REF.storyPoints]: "3", [REF.startDate]: "2026-11-30" });
    const task = effectiveFields("Task", [REF.priority, REF.activity, REF.remaining]);
    const out = toCreateFields({ ...EMPTY_VALUES, ...v, title: "T" }, task);
    expect(out[REF.remaining]).toBe("4");
    expect(out[REF.activity]).toBe("Development");
    expect(out[REF.storyPoints]).toBeUndefined();
    expect(out[REF.startDate]).toBeUndefined();
  });
});

describe("field groups follow the type's layout", () => {
  const view = (type: string, refs: string[]) => fieldGroupsFor(type, effectiveFields(type, refs)).map((g) => [g.title, g.column, g.fields.map((f) => f.label)]);

  it("User Story: Planning, then Classification", () => {
    expect(view("User Story", [REF.priority, REF.risk, REF.storyPoints, REF.valueArea])).toEqual([
      ["Planning", "main", ["Story Points", "Priority", "Risk"]],
      ["Classification", "main", ["Value area"]],
    ]);
  });

  it("Bug: Resolved Reason first, Effort (Hours) with Remaining, Build on the side", () => {
    const groups = view("Bug", [REF.resolvedReason, REF.storyPoints, REF.priority, REF.severity, REF.activity, REF.originalEstimate, REF.remaining, REF.completed, REF.foundIn, REF.integrationBuild]);
    expect(groups).toEqual([
      ["Planning", "main", ["Resolved Reason", "Story Points", "Priority", "Severity", "Activity"]],
      ["Effort (Hours)", "main", ["Original Estimate", "Remaining", "Completed"]],
      ["Build", "side", ["Found in Build", "Integrated in Build"]],
    ]);
  });

  it("Feature and Epic share one layout; a field the layout does not name stays off the form", () => {
    expect(view("Epic", [REF.priority, REF.effort, REF.startDate, REF.targetDate, REF.storyPoints, REF.resolvedReason])[0]).toEqual([
      "Planning",
      "main",
      ["Priority", "Effort", "Start Date", "Target Date"],
    ]);
  });

  it("User Story shows only Story Points, Priority and Risk even when the type also has Resolved Reason, Start Date and Build fields", () => {
    const groups = view("User Story", [REF.storyPoints, REF.priority, REF.risk, REF.valueArea, REF.resolvedReason, REF.startDate, REF.integrationBuild, REF.foundIn]);
    expect(groups[0]).toEqual(["Planning", "main", ["Story Points", "Priority", "Risk"]]);
    expect(groups.flatMap((g) => g[2] as string[])).not.toEqual(expect.arrayContaining(["Resolved Reason"]));
    expect(groups).toHaveLength(2);
  });

  it("Task: hour estimates make an Effort (Hours) group, Basic keeps Remaining Work in Planning", () => {
    expect(view("Task", [REF.priority, REF.activity, REF.originalEstimate, REF.remaining, REF.completed])).toEqual([
      ["Planning", "main", ["Priority", "Activity"]],
      ["Effort (Hours)", "main", ["Original Estimate", "Remaining", "Completed"]],
    ]);
    expect(view("Task", [REF.priority, REF.activity, REF.remaining])).toEqual([["Planning", "main", ["Priority", "Activity", "Remaining Work"]]]);
  });
});
