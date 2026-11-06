import { describe, expect, it } from "@jest/globals";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToStaticMarkup } from "react-dom/server";

import { buildUpdates, extractWorkItemIds, toComments, toDraft, toHistory, toRelations } from "../../../src/views/web/lib/detail";
import { WorkItemDetail } from "../../../src/views/web/ui/WorkItemDetail";
import { QueryResults } from "../../../src/views/web/ui/QueryResults";

describe("ids from tool results", () => {
  it("reads WIQL results, predefined queries, batches, iterations and paged values", () => {
    expect(extractWorkItemIds({ workItems: [{ id: 3 }, { id: 4 }] })).toEqual([3, 4]);
    expect(extractWorkItemIds({ results: [{ id: 9 }] })).toEqual([9]);
    expect(extractWorkItemIds([{ id: 1, fields: {} }, { id: 1 }, { id: 2 }])).toEqual([1, 2]);
    expect(extractWorkItemIds({ workItemRelations: [{ target: { id: 7 } }, { target: { id: 7 } }] })).toEqual([7]);
    expect(extractWorkItemIds({ value: [{ id: 5 }] })).toEqual([5]);
    expect(extractWorkItemIds("nothing")).toEqual([]);
  });

  it("caps the list", () => {
    expect(extractWorkItemIds(Array.from({ length: 500 }, (_, i) => ({ id: i + 1 })))).toHaveLength(200);
  });
});

describe("relations, comments and history", () => {
  it("labels relations the way the web form does", () => {
    const rels = toRelations([
      { rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/gaavi/_apis/wit/workItems/12" },
      { rel: "System.LinkTypes.Hierarchy-Forward", url: "https://dev.azure.com/gaavi/_apis/wit/workItems/30" },
      { rel: "ArtifactLink", url: "vstfs:///Git/PullRequestId/1", attributes: { name: "Pull Request" } },
      { rel: "AttachedFile", url: "https://x/attachments/1", attributes: { name: "a.png", resourceSize: 2048 } },
    ]);
    expect(rels.map((r) => [r.kind, r.label, r.workItemId])).toEqual([
      ["parent", "Parent", 12],
      ["child", "Child", 30],
      ["artifact", "Pull Request", undefined],
      ["attachment", "Attachment", undefined],
    ]);
    expect(rels[3].size).toBe(2048);
  });

  it("reads comments", () => {
    const c = toComments({ comments: [{ id: 1, text: "<p>hi</p>", createdBy: { displayName: "Ada" }, createdDate: "2026-11-05T10:00:00Z" }] });
    expect(c).toEqual([{ id: 1, author: { name: "Ada", email: undefined }, date: "2026-11-05T10:00:00Z", html: "<p>hi</p>" }]);
  });

  it("describes what each revision changed, newest first", () => {
    const history = toHistory([
      { rev: 2, fields: { "System.Title": "T", "System.State": "Doing", "System.ChangedBy": { displayName: "Bo" } } },
      { rev: 1, fields: { "System.Title": "T", "System.State": "To Do", "System.ChangedBy": { displayName: "Ada" } } },
    ]);
    expect(history.map((h) => h.rev)).toEqual([2, 1]);
    expect(history[0].changes).toEqual([{ field: "State", from: "To Do", to: "Doing" }]);
    expect(history[1].changes.map((c) => c.field)).toEqual(["Title", "State"]);
  });
});

describe("edits", () => {
  const original = toDraft({ "System.Title": "Old", "System.State": "To Do", "System.AssignedTo": { displayName: "Ada", uniqueName: "ada@x.test" }, "Microsoft.VSTS.Common.Priority": 2 });

  it("sends nothing when nothing changed", () => {
    expect(buildUpdates(original, { ...original }, 3)).toEqual([]);
  });

  it("sends only the changed fields, guarded by the revision that was read", () => {
    const edited = { ...original, "System.State": "Doing", "Microsoft.VSTS.Common.Priority": "1", "System.AssignedTo": "" };
    expect(buildUpdates(original, edited, 3)).toEqual([
      { op: "test", path: "/rev", value: 3 },
      { op: "replace", path: "/fields/System.State", value: "Doing" },
      { op: "remove", path: "/fields/System.AssignedTo" },
      { op: "replace", path: "/fields/Microsoft.VSTS.Common.Priority", value: 1 },
    ]);
  });
});

const html = (node: React.ReactElement): string =>
  renderToStaticMarkup(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .replace(/ ([,.])/g, "$1");

describe("rendered words", () => {
  const base = {
    id: 12,
    rev: 3,
    type: "Issue",
    states: [{ name: "To Do" }, { name: "Doing" }, { name: "Done" }],
    original: toDraft({ "System.Title": "Login", "System.State": "To Do", "System.IterationPath": "Dev\\Sprint 1" }),
    iterations: [],
    hasAcceptance: false,
    comments: [],
    history: [],
    relations: [],
    linked: {},
    canEdit: true,
  };

  it("work item form", () => {
    const out = html(<WorkItemDetail {...base} onAddComment={() => undefined} />);
    for (const expected of ["ISSUE 12", "Save", "0 Comments", "Add Tag", "State", "Reason", "Area", "Iteration", "Details", "Description", "Discussion", "Planning", "Development", "Related Work"]) {
      expect(out).toContain(expected);
    }
  });

  it("has the tab pills, the header controls and the field grid of the Azure DevOps form", () => {
    const raw = renderToStaticMarkup(
      <FluentProvider theme={webLightTheme}>
        <WorkItemDetail
          {...base}
          relations={[{ kind: "parent", label: "Parent", url: "https://x/_apis/wit/workItems/2", workItemId: 2 }]}
          linked={{ 2: { id: 2, type: "Epic", title: "Billing automation", state: "Doing", tags: [], rank: 1, changed: new Date(Date.now() - 27 * 60000).toISOString() } }}
          changedBy={{ name: "Kanwarjeet Singh Hora" }}
          changed={new Date(Date.now() - 24 * 60000).toISOString()}
        />
      </FluentProvider>
    );
    for (const expected of [
      'aria-label="History"',
      'aria-label="Links"',
      'aria-label="Attachments"',
      "Follow",
      'aria-label="Refresh"',
      'aria-label="Undo changes"',
      "No one selected",
      "Updated by Kanwarjeet Singh Hora: 24m ago",
      "2 Billing automation",
      "Updated 27m ago",
      "Details",
    ]) {
      expect(raw).toContain(expected);
    }
  });

  it("shows the discussion prompt as the comment box placeholder", () => {
    const raw = renderToStaticMarkup(
      <FluentProvider theme={webLightTheme}>
        <WorkItemDetail {...base} onAddComment={() => undefined} />
      </FluentProvider>
    );
    expect(raw).toContain("Add a comment. Use # to link a work item, @ to mention a person, or ! to link a pull request.");
  });

  it("is read-only without the write tool: no Save, no comment box", () => {
    const out = html(<WorkItemDetail {...base} canEdit={false} />);
    expect(out).not.toContain("Save");
    expect(out).not.toContain("Add a comment.");
  });

  it("query results", () => {
    const out = html(<QueryResults heading="Query results" cards={[]} />);
    for (const expected of ["Query results", "0 results", "ID", "Title", "Assigned To", "State", "No results"]) expect(out).toContain(expected);
  });
});
