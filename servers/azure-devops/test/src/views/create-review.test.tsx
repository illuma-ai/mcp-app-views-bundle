import { describe, expect, it, jest } from "@jest/globals";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToStaticMarkup } from "react-dom/server";

import { AdoApi, type HostBridge } from "../../../src/views/web/lib/api";
import { type ReviewGrant, formatToken } from "../../../src/views/web/lib/review";

const GRANT: ReviewGrant = { nonce: "ab12", slot: 4_000_000, key: "view-key" };
import { EMPTY_VALUES, descriptionToHtml, markdownToHtml, mergeAcceptance, toCreateFields } from "../../../src/views/web/lib/form";
import { CreatedPanel, NewItemForm } from "../../../src/views/web/ui/NewItemForm";

const proposal = {
  title: "Add password reset",
  description: "Users cannot recover access.\n\n- email link\n- expiry",
  acceptance: "Reset works for verified addresses",
  assignedTo: "marcus@gaavi.test",
  areaPath: "Dev\\Accounts",
  iterationPath: "Dev\\Sprint 2",
  tags: ["auth", "security"],
  priority: "2",
  effort: "3",
};

describe("after a successful Create", () => {
  it("shows the result with Open and Create another instead of a cleared form", () => {
    const raw = renderToStaticMarkup(
      <FluentProvider theme={webLightTheme}>
        <CreatedPanel type="Issue" id={23} title="Add password reset" onOpen={() => undefined} onAnother={() => undefined} />
      </FluentProvider>
    );
    expect(raw).toContain("Issue 23 created");
    expect(raw).toContain(": Add password reset");
    expect(raw).toContain(">Open<");
    expect(raw).toContain("Create another");
    expect(raw).not.toContain("Save");
  });
});

describe("the review token", () => {
  it("is 16 hex characters, short enough to read on the host's approval card", () => {
    expect(formatToken({ nonce: "ab12", slot: 123456, key: "k" }, "wit_work_item_write", { action: "create" })).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("the review form shows the whole proposal", () => {
  it("pre-fills every proposed field", () => {
    const raw = renderToStaticMarkup(
      <FluentProvider theme={webLightTheme}>
        <NewItemForm
          types={[
            {
              name: "User Story",
              initialState: "New",
              fields: ["System.Description", "Microsoft.VSTS.Common.AcceptanceCriteria", "Microsoft.VSTS.Common.Priority", "Microsoft.VSTS.Scheduling.StoryPoints"],
            },
          ]}
          type="User Story"
          initial={proposal}
          initialParentId={7}
          iterations={[
            { id: "a", name: "Sprint 1", path: "Dev\\Sprint 1" },
            { id: "b", name: "Sprint 2", path: "Dev\\Sprint 2" },
          ]}
          parents={[{ id: 7, title: "Onboarding revamp" }]}
        />
      </FluentProvider>
    );
    expect(raw).toContain('value="Add password reset"');
    // The description and acceptance criteria are rendered by the browser-only sanitizer; proposalToValues carries them (process-fields test).
    expect(raw).toContain('aria-label="Edit Description"');
    expect(raw).toContain('aria-label="Edit Acceptance Criteria"');
    expect(raw).toContain(">marcus@gaavi.test<");
    expect(raw).toContain(">Dev\\Accounts<");
    expect(raw).toContain(">Dev\\Sprint 2<");
    expect(raw).toContain(">auth<");
    expect(raw).toContain(">security<");
    // Priority is shown as plain text at rest; Effort is not a User Story field, so it is not shown.
    expect(raw).toContain(">2<");
    expect(raw).not.toContain("Effort");
    expect(raw).toContain("7 Onboarding revamp");
    expect(raw).toContain("Nothing is created until you press Save.");
  });

  it("moves acceptance criteria into the description for types without the field", () => {
    const merged = mergeAcceptance({ description: "Goal", acceptance: "It works" }, false);
    expect(merged?.acceptance).toBe("");
    expect(merged?.description).toBe("Goal\n\n## Acceptance criteria\n\nIt works");
    expect(mergeAcceptance({ description: "Goal", acceptance: "It works" }, true)?.acceptance).toBe("It works");
  });

  it("renders Markdown descriptions as safe HTML and keeps HTML as is", () => {
    expect(markdownToHtml("## Goal\n\n- one **bold**\n- two\n\n1. a\n2. b\n\nSee [spec](https://example.test/x) and `code`.")).toBe(
      '<h2>Goal</h2><ul><li>one <strong>bold</strong></li><li>two</li></ul><ol><li>a</li><li>b</li></ol><p>See <a href="https://example.test/x">spec</a> and <code>code</code>.</p>'
    );
    expect(markdownToHtml("<script>alert(1)</script> & [x](javascript:alert(1))")).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; [x](javascript:alert(1))</p>");
    expect(descriptionToHtml("<p>Already <b>html</b></p>")).toBe("<p>Already <b>html</b></p>");
  });
});

describe("Create sends exactly the edited fields, with the view's confirmation", () => {
  it("makes one create call carrying type, fields, parent and confirmation", async () => {
    const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: '{"id":50,"rev":1,"fields":{}}' }] });
    const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
    const api = new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools: ["wit_work_item_write"], review: GRANT });

    // The user edited the proposal: new title, dropped the tags, cleared the effort.
    const edited = { ...EMPTY_VALUES, ...proposal, acceptance: "", title: " Add password reset (email) ", tags: [], effort: "" };
    await api.createWorkItem("Issue", toCreateFields(edited, new Set(["System.Description", "Microsoft.VSTS.Common.Priority", "Microsoft.VSTS.Scheduling.Effort"])), 7);

    expect(callTool).toHaveBeenCalledTimes(1);
    const sent = callTool.mock.calls[0][1] as Record<string, unknown>;
    const { reviewToken, ...rest } = sent;
    expect(reviewToken).toBe(formatToken(GRANT, "wit_work_item_write", rest));
    expect(callTool).toHaveBeenCalledWith("wit_work_item_write", {
      action: "create",
      reviewToken,
      project: "Dev",
      workItemType: "Issue",
      fields: [
        { name: "System.Title", value: "Add password reset (email)" },
        { name: "System.Description", value: "<p>Users cannot recover access.</p>".replace("</p>", "</p>") + "<ul><li>email link</li><li>expiry</li></ul>", format: "Html" },
        { name: "System.AssignedTo", value: "marcus@gaavi.test" },
        { name: "System.AreaPath", value: "Dev\\Accounts" },
        { name: "System.IterationPath", value: "Dev\\Sprint 2" },
        { name: "Microsoft.VSTS.Common.Priority", value: "2" },
      ],
      parentId: 7,
    });
  });

  it("sends the confirmation with an edit too", async () => {
    const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: '{"id":5,"fields":{}}' }] });
    const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
    const api = new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools: ["wit_work_item_write"], review: GRANT });
    await api.updateWorkItem(5, [{ op: "replace", path: "/fields/System.State", value: "Doing" }]);
    expect((callTool.mock.calls[0][1] as { reviewToken?: string }).reviewToken).toMatch(/^[0-9a-f]{16}$/);
  });
});
