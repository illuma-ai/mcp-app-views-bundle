import { describe, expect, it } from "@jest/globals";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { BacklogContent } from "../../../src/views/web/ui/BacklogContent";
import { BoardContent } from "../../../src/views/web/ui/BoardContent";
import { NewItemForm } from "../../../src/views/web/ui/NewItemForm";
import { SprintContent } from "../../../src/views/web/ui/SprintContent";
import { Loading } from "../../../src/views/web/ui/parts";
import { groupByState } from "../../../src/views/web/lib/boards-logic";

/** Renders to HTML text the way a user reads it: tags dropped, entities decoded, whitespace collapsed. */
function text(node: ReactElement): string {
  const html = renderToStaticMarkup(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>);
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .replace(/ ([,.])/g, "$1");
}

const states = [
  { name: "To Do", category: "Proposed" },
  { name: "Doing", category: "InProgress" },
  { name: "Done", category: "Completed" },
];

// The expected words are copied from the reference captures (reference/azure-devops/words.md). If a
// view changes a word, this fails.
describe("exact words from the Azure DevOps reference", () => {
  it("loading state", () => {
    expect(text(<Loading />)).toContain("Loading...");
  });

  it("empty board: columns, WIP, new item, view as backlog", () => {
    const out = text(<BoardContent team="Dev Team" levelName="Issues" levelNames={["Epics", "Issues"]} columns={groupByState([], states)} canCreate canMove />);
    for (const expected of ["Dev Team", "View as backlog", "Board", "Analytics", "Issues", "To Do", "Doing", "Done", "0 /5", "New item"]) {
      expect(out).toContain(expected);
    }
  });

  it("empty backlog and planning pane", () => {
    const out = text(<BacklogContent team="Dev Team" levelName="Issues" levelNames={["Issues"]} cards={[]} canCreate />);
    for (const expected of [
      "Dev Team",
      "New Work Item",
      "View as Board",
      "Column Options",
      "Backlog",
      "Analytics",
      "Get started with your product backlog",
      'Use the "New Work Item" command to create and prioritize work items',
      "Learn more about backlogs",
      "Planning",
      "Drag and drop work items to include them in a sprint.",
      "Dev Team backlog",
      "Sprint 1",
      "No work scheduled yet",
      "New Sprint",
    ]) {
      expect(out).toContain(expected);
    }
  });

  it("empty sprint taskboard", () => {
    const out = text(
      <SprintContent
        team="Dev Team"
        iterations={[{ id: "a", name: "Sprint 1", path: "Dev\\Sprint 1" }]}
        iteration={{ id: "a", name: "Sprint 1", path: "Dev\\Sprint 1" }}
        items={[]}
        tab="taskboard"
        taskType="Task"
        taskStates={states}
        parentTypes={new Set(["Issue"])}
        canCreate
      />
    );
    for (const expected of [
      "New Work Item",
      "Column Options",
      "Taskboard",
      "Backlog",
      "Capacity",
      "Analytics",
      "Sprint 1",
      "Person: All",
      "No iteration dates",
      "Set dates",
      "You do not have any work scheduled yet",
      "Schedule Work",
      "from your product backlog or create new work items.",
    ]) {
      expect(out).toContain(expected);
    }
  });

  it("new issue form", () => {
    const out = text(
      <NewItemForm
        types={[{ name: "Issue", initialState: "To Do", fields: ["System.Description", "Microsoft.VSTS.Common.Priority", "Microsoft.VSTS.Scheduling.Effort"] }]}
        type="Issue"
        iterations={[]}
        parents={[]}
      />
    );
    for (const expected of [
      "NEW ISSUE *",
      "Save",
      "0 Comments",
      "Add Tag",
      "State",
      "Reason",
      "Area",
      "Iteration",
      "Details",
      "Description",
      "Discussion",
      "Planning",
      "Priority",
      "Effort",
      "Deployment",
      "To track releases associated with this work item, go to Releases and turn on deployment status reporting for Boards in your pipeline's Options menu. Learn more about deployment status reporting",
      "Development",
      "Add link",
      "Link an Azure Repos commit, pull request or branch to see the status of your development. You can also create a branch to get started.",
      "Related Work",
      "Add an existing work item as a parent",
    ]) {
      expect(out).toContain(expected);
    }
  });
});
