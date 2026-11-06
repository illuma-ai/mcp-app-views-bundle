import { describe, expect, it, jest } from "@jest/globals";
import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

import { AdoApi, type HostBridge } from "../../../src/views/web/lib/api";
import { type ReviewGrant, formatToken } from "../../../src/views/web/lib/review";
import {
  VOTES,
  branchName,
  buildFeed,
  defaultMergeMessage,
  mergeBanner,
  toCommits,
  toUpdates,
  isOpenThread,
  toBranches,
  toPullDetail,
  toPullSummaries,
  toRepos,
  toReviewers,
  toThreads,
  voteLabel,
  voteSummary,
} from "../../../src/views/web/lib/pulls";
import { PullDetailView, PullForm, PullList } from "../../../src/views/web/ui/PullViews";
import { pullPrefillFrom } from "../../../src/views/web/ui/PullScreens";

const GRANT: ReviewGrant = { nonce: "ab12", slot: 4_000_000, key: "view-key" };

const RAW = {
  mergeStatus: "succeeded",
  pullRequestId: 7,
  title: "Validate the form",
  statusName: "Active",
  isDraft: false,
  createdBy: { displayName: "Marcus Webb", uniqueName: "marcus@x.test" },
  creationDate: "2026-11-06T09:00:00Z",
  sourceRefName: "refs/heads/feature/a",
  targetRefName: "refs/heads/main",
  description: "Adds rules.\n\n- one\n- two",
  repository: { id: "r1", name: "Dev", project: { name: "Dev" } },
  reviewers: [
    { id: "1", displayName: "Kavya H", uniqueName: "kavya@x.test", vote: 10, isRequired: true },
    { id: "2", displayName: "Priya", uniqueName: "priya@x.test", vote: -5 },
    { id: "3", displayName: "Alex", uniqueName: "alex@x.test", vote: 0 },
  ],
  labelSummary: { labels: ["ui"] },
  workItemRefs: [{ id: "10" }],
  changedFilesSummary: {
    changeEntries: [
      { changeType: "edit", item: { path: "/a.ts" } },
      { changeType: 1, item: { path: "/b.ts" } },
      { changeType: "delete, sourceRename", item: { path: "/c.ts" } },
    ],
  },
};

describe("pull request data", () => {
  it("reads the list result, status, branches and reviewers", () => {
    const [p] = toPullSummaries([{ ...RAW, reviewers: undefined, repository: "Dev" }]);
    expect(p).toMatchObject({ id: 7, title: "Validate the form", repository: "Dev", status: "Active", source: "feature/a", target: "main", author: { name: "Marcus Webb" } });
    expect(toPullSummaries([{ ...RAW, isDraft: true }])[0].status).toBe("Draft");
    expect(toPullSummaries([{ ...RAW, statusName: "Completed" }])[0].status).toBe("Completed");
    expect(branchName("refs/heads/x/y")).toBe("x/y");
  });

  it("reads a full pull request with reviewers, labels, work items and changed files", () => {
    const d = toPullDetail(RAW);
    expect(d.reviewers.map((r) => [r.person.name, r.vote, r.isRequired])).toEqual([
      ["Kavya H", 10, true],
      ["Priya", -5, false],
      ["Alex", 0, false],
    ]);
    expect(d.labels).toEqual(["ui"]);
    expect(d.workItemIds).toEqual([10]);
    expect(d.files.map((f) => [f.path, f.change])).toEqual([
      ["/a.ts", "edit"],
      ["/b.ts", "add"],
      ["/c.ts", "delete"],
    ]);
  });

  it("labels votes the way the web UI does and counts them", () => {
    expect(VOTES.map((v) => [v.name, v.value])).toEqual([
      ["Approved", 10],
      ["ApprovedWithSuggestions", 5],
      ["WaitingForAuthor", -5],
      ["Rejected", -10],
      ["NoVote", 0],
    ]);
    expect([voteLabel(10), voteLabel(5), voteLabel(-5), voteLabel(-10), voteLabel(0), voteLabel(undefined)]).toEqual([
      "Approve",
      "Approve with suggestions",
      "Wait for author",
      "Reject",
      "No vote",
      "No vote",
    ]);
    expect(voteSummary(toReviewers(RAW.reviewers))).toEqual({ approved: 1, rejected: 0, waiting: 1, none: 1 });
  });

  it("keeps threads with a human comment and tells open from resolved", () => {
    const threads = toThreads([
      {
        id: 1,
        status: "Active",
        threadContext: { filePath: "/a.ts", rightFileStart: { line: 4 } },
        comments: [{ id: 1, content: "Why?", author: { displayName: "Priya" }, publishedDate: "2026-11-06T10:00:00Z" }],
      },
      { id: 2, status: "Fixed", comments: [{ id: 1, content: "Done", author: { displayName: "Marcus" } }] },
      { id: 3, status: "Active", comments: [{ id: 1, content: "", author: { displayName: "System" } }] },
    ]);
    expect(threads.map((t) => t.id)).toEqual([1, 2]);
    expect(threads[0]).toMatchObject({ filePath: "/a.ts", line: 4 });
    expect([isOpenThread("Active"), isOpenThread("Fixed")]).toEqual([true, false]);
  });

  it("reads repositories and branches", () => {
    expect(
      toRepos([
        { id: "r1", name: "Dev" },
        { id: "r2", name: "Old", isDisabled: true },
      ])
    ).toEqual([{ id: "r1", name: "Dev" }]);
    expect(toBranches(["main", "x", 5])).toEqual(["main", "x"]);
    expect(pullPrefillFrom({ repository: "Dev", sourceRefName: "refs/heads/a", title: "T", isDraft: true, labels: ["ui", "api"] })).toMatchObject({
      repository: "Dev",
      title: "T",
      isDraft: true,
      labels: "ui, api",
    });
  });
});

const html = (node: ReactElement): string =>
  renderToStaticMarkup(<FluentProvider theme={webLightTheme}>{node}</FluentProvider>)
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ");

describe("rendered words", () => {
  it("pull request list", () => {
    const out = html(<PullList pulls={toPullSummaries([RAW])} tab="Active" canCreate />);
    for (const w of [
      "Pull requests",
      "New pull request",
      "Active",
      "Completed",
      "Abandoned",
      "Validate the form",
      "!7",
      "Marcus Webb",
      "Mine",
      "Created by",
      "Assigned to",
      "Marcus Webb request !7 into",
      "Created",
    ])
      expect(out).toContain(w);
    const markup = renderToStaticMarkup(
      <FluentProvider theme={webLightTheme}>
        <PullList pulls={toPullSummaries([RAW])} tab="Active" canCreate />
      </FluentProvider>
    );
    for (const w of ['placeholder="Pull Request ID or title"', 'aria-label="Created by"', 'aria-label="Assigned to"']) expect(markup).toContain(w);
    expect(html(<PullList pulls={[]} tab="Completed" canCreate={false} />)).toContain("No completed pull requests");
  });

  it("pull request detail: reviewers with votes, discussion, files tab", () => {
    const pull = toPullDetail(RAW);
    const threads = toThreads([{ id: 1, status: "Active", comments: [{ id: 1, content: "Why?", author: { displayName: "Priya" } }] }]);
    const out = html(<PullDetailView pull={pull} threads={threads} updates={[]} commits={[]} workItems={[]} canVote canComment canEdit />);
    for (const w of [
      "Validate the form",
      "Approve",
      "Complete",
      "Active",
      "!7",
      "proposes to merge",
      "Overview",
      "Files",
      "Updates",
      "Commits",
      "Description",
      "Reviewers",
      "Add",
      "Required",
      "Optional",
      "Kavya H",
      "Wait for author",
      "Tags",
      "Work items",
      "No work items",
      "Show everything (2)",
      "created the pull request",
      "No merge conflicts",
      "Last checked",
      "Reply",
      "Resolve",
    ])
      expect(out).toContain(w);
    const raw = (canComment: boolean): string =>
      renderToStaticMarkup(
        <FluentProvider theme={webLightTheme}>
          <PullDetailView pull={pull} threads={threads} updates={[]} commits={[]} workItems={[]} canVote canComment={canComment} canEdit={false} />
        </FluentProvider>
      );
    expect(html(<PullDetailView pull={{ ...pull, reviewers: [], labels: [] }} threads={[]} updates={[]} commits={[]} workItems={[]} canVote canComment canEdit />)).toEqual(
      expect.stringContaining("No tags")
    );
    expect(raw(true)).toContain('placeholder="Add a comment..."');
    expect(raw(false)).not.toContain('placeholder="Add a comment..."');
    const readOnly = html(<PullDetailView pull={pull} threads={threads} updates={[]} commits={[]} workItems={[]} canVote={false} canComment={false} canEdit={false} />);
    expect(readOnly).not.toContain("Add a comment");
    expect(readOnly).not.toContain("Resolve");
  });

  it("new pull request form", () => {
    const out = html(<PullForm repos={[{ id: "r1", name: "Dev" }]} branches={["main", "feature/a"]} initial={{ title: "T", source: "feature/a" }} />);
    for (const w of ["NEW PULL REQUEST *", "Repository", "Source branch", "Target branch", "Title", "Description", "Create as draft", "Nothing is created until you press Create", "Create"])
      expect(out).toContain(w);
  });
});

describe("pull request writes", () => {
  function api(tools: string[]): { api: AdoApi; callTool: jest.Mock<HostBridge["callTool"]> } {
    const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: '{"pullRequestId":9}' }] });
    const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
    return { api: new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools, review: GRANT }), callTool };
  }

  it("Create sends the edited fields with the review token", async () => {
    const { api: a, callTool } = api(["repo_pull_request_write"]);
    await a.createPullRequest({ repositoryId: "r1", source: "feature/a", target: "main", title: "T", description: "d", isDraft: true, workItems: "10 11" });
    const sent = callTool.mock.calls[0][1] as Record<string, unknown>;
    const { reviewToken, ...rest } = sent;
    expect(rest).toEqual({
      action: "create",
      repositoryId: "r1",
      project: "Dev",
      sourceRefName: "refs/heads/feature/a",
      targetRefName: "refs/heads/main",
      title: "T",
      description: "d",
      isDraft: true,
      workItems: "10 11",
    });
    expect(reviewToken).toBe(formatToken(GRANT, "repo_pull_request_write", rest));
  });

  it("votes, comments, replies and resolves with exactly the arguments of the button", async () => {
    const { api: a, callTool } = api(["repo_pull_request_write", "repo_pull_request_thread_write"]);
    await a.votePullRequest("r1", 7, "Approved");
    await a.commentOnPullRequest("r1", 7, "Looks good");
    await a.commentOnPullRequest("r1", 7, "Thanks", 3);
    await a.setThreadStatus("r1", 7, 3, "Fixed");
    expect(callTool.mock.calls.map((c) => [c[0], (c[1] as Record<string, unknown>).action])).toEqual([
      ["repo_pull_request_write", "vote"],
      ["repo_pull_request_thread_write", "create"],
      ["repo_pull_request_thread_write", "reply"],
      ["repo_pull_request_thread_write", "update_status"],
    ]);
    expect(callTool.mock.calls[0][1]).toMatchObject({ repositoryId: "r1", pullRequestId: 7, project: "Dev", vote: "Approved" });
    expect(callTool.mock.calls[2][1]).toMatchObject({ threadId: 3, content: "Thanks" });
  });

  it("Complete carries the dialog options and a review token; edits and reviewers use the update tools", async () => {
    const { api: a, callTool } = api(["repo_pull_request_write", "wit_work_item_link_write"]);
    await a.completePullRequest("r1", 7, { mergeStrategy: "Squash", deleteSourceBranch: true, transitionWorkItems: false, mergeCommitMessage: "m" });
    const sent = callTool.mock.calls[0][1] as Record<string, unknown>;
    const { reviewToken, ...rest } = sent;
    expect(rest).toMatchObject({
      action: "complete",
      repositoryId: "r1",
      pullRequestId: 7,
      mergeStrategy: "Squash",
      deleteSourceBranch: true,
      transitionWorkItems: false,
      bypassPolicy: false,
      mergeCommitMessage: "m",
    });
    expect(reviewToken).toBe(formatToken(GRANT, "repo_pull_request_write", rest));
    await a.updatePullRequest("r1", 7, { description: "new" });
    await a.addReviewer("r1", 7, "u1", true);
    await a.removeReviewer("r1", 7, "u1");
    await a.setLabels("r1", 7, ["ui"]);
    await a.linkWorkItem(23, { projectId: "p", repositoryId: "r1", pullRequestId: 7 });
    await a.unlinkWorkItem(23, { projectId: "p", repositoryId: "r1", pullRequestId: 7 });
    expect(callTool.mock.calls.slice(1).map((c) => [c[0], (c[1] as Record<string, unknown>).action])).toEqual([
      ["repo_pull_request_write", "update"],
      ["repo_pull_request_write", "update_reviewers"],
      ["repo_pull_request_write", "update_reviewers"],
      ["repo_pull_request_write", "update"],
      ["wit_work_item_link_write", "link_to_pull_request"],
      ["wit_work_item_link_write", "unlink"],
    ]);
    expect(callTool.mock.calls[6][1]).toMatchObject({ id: 23, type: "artifact", url: "vstfs:///Git/PullRequestId/p%2Fr1%2F7" });
  });
});

describe("pull request detail helpers", () => {
  it("maps merge status to the banner", () => {
    expect(mergeBanner("succeeded")).toEqual({ tone: "ok", title: "No merge conflicts" });
    expect(mergeBanner("conflicts").tone).toBe("conflict");
    expect(mergeBanner(undefined).tone).toBe("checking");
  });

  it("builds the feed with the creation event first and sorts updates newest first", () => {
    const threads = toThreads([{ id: 1, status: "Active", comments: [{ id: 1, content: "x", author: { displayName: "P" } }] }]);
    const feed = buildFeed({ id: 7, author: { name: "M" }, created: "2026-01-01T00:00:00Z" }, threads);
    expect(feed.map((f) => f.kind)).toEqual(["created", "thread"]);
    expect(toUpdates([{ id: 1 }, { id: 3 }, { id: 2 }]).map((u) => u.id)).toEqual([3, 2, 1]);
    expect(toCommits([{ commitId: "abc", comment: "first\nsecond", author: { name: "A" } }])).toEqual([{ id: "abc", message: "first", author: { name: "A", email: undefined }, date: undefined }]);
    expect(defaultMergeMessage(7, "T", " d ")).toBe("Merged PR 7: T\n\nd");
  });
});
