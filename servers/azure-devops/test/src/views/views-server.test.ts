import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

// The apps SDK ships as ESM only, which this CommonJS test setup cannot load; its helper only forwards to registerResource.
jest.mock(
  "@modelcontextprotocol/ext-apps/server",
  () => ({
    RESOURCE_MIME_TYPE: "text/html;profile=mcp-app",
    registerAppResource: (server: McpServer, name: string, uri: string, config: Record<string, unknown>, read: never) => server.registerResource(name, uri, config as never, read),
  }),
  { virtual: true }
);
jest.mock("../../../src/generated/views-bundle", () => ({ VIEW_BUNDLE_JS: "/*bundle*/" }), { virtual: true });

import { issueReviewGrant, resetReviewState } from "../../../src/views/confirm";
import { formatToken } from "../../../src/views/web/lib/review";

/** Arguments with the proof a view would add for exactly these arguments. */
const signed = (tool: string, args: Record<string, unknown>, grant = issueReviewGrant()): Record<string, unknown> => ({ ...args, reviewToken: formatToken(grant, tool, args) });
import { APP_VIEWS, AppViewId, BACKLOG_WRITE_TOOL, TOOL_VIEWS, buildViewHtml, captureTools, installViews } from "../../../src/views/server";

/** Registers stand-ins for the upstream tools the views link to (same names and action shapes). */
function registerUpstream(server: McpServer): void {
  server.tool("wit_backlog", "backlog", { action: z.enum(["list", "list_work_items", "reorder"]), ids: z.array(z.number()).optional() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `backlog:${args.action}:${JSON.stringify(args.ids ?? [])}` }],
  }));
  server.tool("work", "work", { action: z.string() }, { readOnlyHint: true }, async (args) => ({ content: [{ type: "text", text: `work:${args.action}` }] }));
  server.tool("wit_work_item_attachment", "att", { attachmentId: z.string(), savePath: z.string().optional() }, { readOnlyHint: true }, async (args) => ({
    content: [{ type: "text", text: `att:${args.attachmentId}:${args.savePath ?? "inline"}` }],
  }));
  server.tool("pipelines_artifact", "art", { action: z.string(), destinationPath: z.string().optional() }, { readOnlyHint: true }, async (args) => ({
    content: [{ type: "text", text: `art:${args.destinationPath ?? "inline"}` }],
  }));
  server.tool("wit_work_item_write", "write", { action: z.string(), id: z.number().optional(), workItemType: z.string().optional() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `wrote:${JSON.stringify(args)}` }],
  }));
  server.tool("work_iteration_write", "iter", { action: z.string(), project: z.string() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `iter:${JSON.stringify(args)}` }],
  }));
  server.tool("testplan_test_plan_write", "plan", { action: z.string(), project: z.string() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `plan:${JSON.stringify(args)}` }],
  }));
  server.tool("testplan_test_suite_write", "suite", { action: z.string(), project: z.string() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `suite:${JSON.stringify(args)}` }],
  }));
  server.tool("testplan_test_case_write", "case", { action: z.string(), project: z.string().optional() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `case:${JSON.stringify(args)}` }],
  }));
  server.tool("repo_pull_request_write", "pr", { action: z.string(), project: z.string().optional() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `pr:${JSON.stringify(args)}` }],
  }));
  server.tool("pipelines_write", "pipe", { action: z.string(), project: z.string().optional() }, { readOnlyHint: false }, async (args) => ({
    content: [{ type: "text", text: `pipe:${JSON.stringify(args)}` }],
  }));
  server.tool("wit_work_item", "item", { action: z.string() }, { readOnlyHint: true }, async (args) => ({ content: [{ type: "text", text: `item:${args.action}` }] }));
}

async function connect(withViews: boolean): Promise<Client> {
  const server = new McpServer({ name: "t", version: "0" });
  const captured = captureTools(server, () => registerUpstream(server));
  if (withViews) installViews(server, captured, { org: "gaavi", project: "Dev", team: "Dev Team" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "c", version: "0" });
  await client.connect(b);
  return client;
}

describe("view linking", () => {
  it("links the view tools through _meta.ui and nothing else", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    const meta = Object.fromEntries(tools.map((t) => [t.name, (t._meta as { ui?: { resourceUri?: string } } | undefined)?.ui?.resourceUri]));
    expect(meta.wit_backlog).toBe(APP_VIEWS[AppViewId.Board].uri);
    expect(meta.work).toBe(APP_VIEWS[AppViewId.Sprint].uri);
    expect(meta.wit_work_item_form).toBe(APP_VIEWS[AppViewId.NewItem].uri);
    expect(meta.pipelines_artifact).toBeUndefined();
    expect(Object.keys(TOOL_VIEWS).sort()).toEqual([
      "pipelines_build",
      "pipelines_build_log",
      "pipelines_definition",
      "pipelines_run",
      "pipelines_run_form",
      "repo_pull_request",
      "repo_pull_request_form",
      "repo_pull_request_org",
      "repo_pull_request_thread",
      "testplan",
      "testplan_show_test_results_from_build_id",
      "testplan_test_case_form",
      "wit_backlog",
      "wit_board",
      "wit_query",
      "wit_work_item",
      "wit_work_item_form",
      "work",
      "work_sprint",
    ]);
    expect(meta.wit_work_item).toBe(APP_VIEWS[AppViewId.WorkItem].uri);
    expect(meta.wit_board).toBe(APP_VIEWS[AppViewId.Board].uri);
    expect(meta.work_sprint).toBe(APP_VIEWS[AppViewId.Sprint].uri);
  });

  it("leaves tool results byte-identical with or without views", async () => {
    const [plain, viewed] = await Promise.all([connect(false), connect(true)]);
    for (const [name, args] of [
      ["work", { action: "list_team_iterations" }],
      ["wit_backlog", { action: "list" }],
      ["wit_work_item", { action: "get" }],
    ] as const) {
      expect(JSON.stringify(await viewed.callTool({ name, arguments: args }))).toBe(JSON.stringify(await plain.callTool({ name, arguments: args })));
    }
  });

  it("serves each view as a self-contained document with a strict CSP and no web fonts", async () => {
    const client = await connect(true);
    for (const view of Object.values(AppViewId)) {
      const res = await client.readResource({ uri: APP_VIEWS[view].uri });
      const html = String((res.contents[0] as { text?: string }).text);
      expect(html).toContain("default-src 'none'");
      expect(html).toContain("connect-src 'none'");
      expect(html).toContain("font-src 'none'");
      expect(html).not.toMatch(/https?:\/\/fonts\./);
    }
    expect(buildViewHtml(AppViewId.Board, { org: "o", project: "p", team: "t", tools: ["x<y"] })).toContain("x\\u003cy");
  });
});

describe("tool descriptions say what opens", () => {
  it("prefixes the linked upstream tools and leaves the others alone", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    const desc = (name: string) => tools.find((t) => t.name === name)?.description ?? "";
    expect(desc("wit_backlog")).toMatch(/^Board and backlog of a team \(opens the board view\)/);
    expect(desc("work")).toMatch(/^Sprints and iterations of a team \(opens the sprint view/);
    expect(desc("wit_work_item")).toMatch(/\(opens the work item view/);
    expect(desc("pipelines_artifact")).toBe("art");
  });

  it("offers entry tools named for the board and the sprint", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "wit_board")?.description).toMatch(/opens the board view/);
    expect(tools.find((t) => t.name === "work_sprint")?.description).toMatch(/opens the sprint view/);
    expect(tools.find((t) => t.name === "wit_board")?.annotations?.readOnlyHint).toBe(true);
  });

  it("answers an entry tool with a text summary, or a plain error without a project", async () => {
    const client = await connect(true);
    const ok = (await client.callTool({ name: "wit_board", arguments: {} })) as { content: { text: string }[]; isError?: boolean };
    // The stand-in upstream tools return plain text, so the summary reports that it could not be built; the view still opens.
    expect(ok.content[0].text).toMatch(/Could not summarise|board, /);

    const server = new McpServer({ name: "t", version: "0" });
    const captured = captureTools(server, () => registerUpstream(server));
    installViews(server, captured, { org: "gaavi", project: "", team: "" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const bare = new Client({ name: "c", version: "0" });
    await bare.connect(b);
    const res = (await bare.callTool({ name: "work_sprint", arguments: {} })) as { content: { text: string }[]; isError?: boolean };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toMatch(/ADO_MCP_PROJECT/);
  });
});

describe("backlog read and write split", () => {
  it("refuses reorder on the read tool and points to the write tool", async () => {
    const client = await connect(true);
    const res = (await client.callTool({ name: "wit_backlog", arguments: { action: "reorder", ids: [1] } })) as { isError?: boolean; content: { text: string }[] };
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain(BACKLOG_WRITE_TOOL);
  });

  it("still serves the read actions", async () => {
    const client = await connect(true);
    const res = (await client.callTool({ name: "wit_backlog", arguments: { action: "list" } })) as { content: { text: string }[] };
    expect(res.content[0].text).toBe("backlog:list:[]");
  });

  it("runs reorder through the write tool, which is marked as a write", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "wit_backlog")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === BACKLOG_WRITE_TOOL)?.annotations?.readOnlyHint).toBe(false);
    const res = (await client.callTool({ name: BACKLOG_WRITE_TOOL, arguments: { action: "reorder", ids: [4, 5] } })) as { content: { text: string }[] };
    expect(res.content[0].text).toBe("backlog:reorder:[4,5]");
  });
});

describe("new work item form entry tool", () => {
  it("is read-only and creates nothing", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "wit_work_item_form")?.annotations?.readOnlyHint).toBe(true);
    // The model can propose every field a type can have.
    const props = Object.keys((tools.find((t) => t.name === "wit_work_item_form")?.inputSchema as { properties: Record<string, unknown> }).properties);
    expect(props).toEqual(expect.arrayContaining(["project", "team"]));
    for (const k of ["priority", "remainingWork", "effort", "storyPoints", "activity", "severity", "reproSteps", "startDate", "targetDate", "assignedTo", "tags", "acceptanceCriteria"])
      expect(props).toContain(k);
    const res = (await client.callTool({ name: "wit_work_item_form", arguments: { type: "Issue", title: "Ship it" } })) as { content: { text: string }[] };
    const scoped = (await client.callTool({ name: "wit_work_item_form", arguments: { type: "User Story", title: "T", project: "DevAgile" } })) as { content: { text: string }[] };
    expect(JSON.parse(scoped.content[0].text)).toMatchObject({ project: "DevAgile", team: "DevAgile Team" });
    const body = JSON.parse(res.content[0].text);
    expect(body.note).toMatch(/Nothing has been created/);
    expect(body.proposal).toEqual({ type: "Issue", title: "Ship it" });
    expect(body.project).toBe("Dev");
  });
});

describe("server-local file writes are refused over HTTP", () => {
  it("refuses savePath and destinationPath but serves the inline form", async () => {
    const client = await connect(true);
    const call = async (name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };

    const saved = await call("wit_work_item_attachment", { attachmentId: "a1", savePath: "downloads" });
    expect(saved.isError).toBe(true);
    expect(saved.content[0].text).toContain("savePath is not available over HTTP");
    expect((await call("wit_work_item_attachment", { attachmentId: "a1" })).content[0].text).toBe("att:a1:inline");

    const artifact = await call("pipelines_artifact", { action: "download", destinationPath: "/tmp/x" });
    expect(artifact.isError).toBe(true);
    expect((await call("pipelines_artifact", { action: "download" })).content[0].text).toBe("art:inline");
  });

  it("is not applied when the tools are registered without capture (the stdio path)", async () => {
    const server = new McpServer({ name: "t", version: "0" });
    registerUpstream(server);
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "c", version: "0" });
    await client.connect(b);
    const res = (await client.callTool({ name: "wit_work_item_attachment", arguments: { attachmentId: "a1", savePath: "downloads" } })) as { content: { text: string }[] };
    expect(res.content[0].text).toBe("att:a1:downloads");
  });
});

describe("review before create and save", () => {
  beforeEach(() => resetReviewState());
  const call = async (client: Client, name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };

  it("refuses a create, update or sprint write that does not come from a view", async () => {
    const client = await connect(true);
    for (const [name, args] of [
      ["wit_work_item_write", { action: "create", workItemType: "Issue" }],
      ["wit_work_item_write", { action: "update", id: 4 }],
      ["wit_work_item_write", { action: "update_batch" }],
      ["wit_work_item_write", { action: "add_child" }],
      ["work_iteration_write", { action: "create", project: "Dev" }],
      ["work_iteration_write", { action: "update", project: "Dev" }],
    ] as const) {
      const res = await call(client, name, args);
      expect({ name, action: args.action, refused: res.isError }).toEqual({ name, action: args.action, refused: true });
      expect(res.content[0].text).toMatch(/Nothing was changed/);
      expect(res.content[0].text).not.toMatch(/token/i);
    }
    expect((await call(client, "wit_work_item_write", { action: "create", workItemType: "Issue" })).content[0].text).toContain("wit_work_item_form");
  });

  it("refuses a wrong confirmation too", async () => {
    const client = await connect(true);
    const res = await call(client, "wit_work_item_write", { action: "create", workItemType: "Issue", reviewToken: "guess" });
    expect(res.isError).toBe(true);
  });

  it("runs the write when the view's confirmation is present, and the upstream tool never sees it", async () => {
    const client = await connect(true);
    const res = await call(client, "wit_work_item_write", signed("wit_work_item_write", { action: "create", workItemType: "Issue" }));
    expect(res.isError).toBeUndefined();
    expect(res.content[0].text).toBe('wrote:{"action":"create","workItemType":"Issue"}');
    const iter = await call(client, "work_iteration_write", signed("work_iteration_write", { action: "create", project: "Dev" }));
    expect(iter.content[0].text).toBe('iter:{"action":"create","project":"Dev"}');
  });

  it("does not advertise the confirmation in the tool schema, and leaves other actions alone", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    const schema = JSON.stringify(tools.find((t) => t.name === "wit_work_item_write")?.inputSchema);
    expect(schema).not.toMatch(/reviewToken/);
    expect(schema).toContain("workItemType");
    const iter = await call(client, "work_iteration_write", { action: "assign", project: "Dev" });
    expect(iter.isError).toBeUndefined();
  });

  it("puts a per-user token in the view document", async () => {
    const client = await connect(true);
    const res = await client.readResource({ uri: APP_VIEWS[AppViewId.NewItem].uri });
    const html = String((res.contents[0] as { text?: string }).text);
    expect(html).toMatch(/"review":\{"nonce":"[0-9a-f]{4}","slot":\d+,"key":"[0-9a-f]{64}"\}/);
  });
});

describe("test plan writes need the review token too", () => {
  const call = async (client: Client, name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };

  it("refuses plan, suite and test case creates and step edits without it", async () => {
    const client = await connect(true);
    for (const [name, args] of [
      ["testplan_test_plan_write", { action: "create", project: "Dev" }],
      ["testplan_test_suite_write", { action: "create", project: "Dev" }],
      ["testplan_test_case_write", { action: "create", project: "Dev" }],
      ["testplan_test_case_write", { action: "update_steps", project: "Dev" }],
    ] as const) {
      const res = await call(client, name, args);
      expect({ name, action: args.action, refused: res.isError }).toEqual({ name, action: args.action, refused: true });
      expect(res.content[0].text).toMatch(/Nothing was changed/);
      expect(res.content[0].text).not.toMatch(/token/i);
    }
    expect((await call(client, "testplan_test_case_write", { action: "create", project: "Dev" })).content[0].text).toContain("testplan_test_case_form");
  });

  it("runs them with the view's token, and leaves add_test_cases to the host card", async () => {
    const client = await connect(true);
    const ok = await call(client, "testplan_test_case_write", signed("testplan_test_case_write", { action: "create", project: "Dev" }));
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0].text).toBe('case:{"action":"create","project":"Dev"}');
    expect((await call(client, "testplan_test_suite_write", { action: "add_test_cases", project: "Dev" })).isError).toBeUndefined();
  });

  it("opens the test case form read-only and links the test plan views", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "testplan_test_case_form")?.annotations?.readOnlyHint).toBe(true);
    const res = await call(client, "testplan_test_case_form", { title: "T", steps: ["1. a|b"] });
    expect(JSON.parse(res.content[0].text).note).toMatch(/Nothing has been created/);
    expect(Object.keys(TOOL_VIEWS)).toEqual(expect.arrayContaining(["testplan", "testplan_test_case_form", "testplan_show_test_results_from_build_id"]));
  });
});

describe("pull request creates need the review token too", () => {
  const call = async (client: Client, name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };

  it("refuses a create without the view's token, but not a vote", async () => {
    resetReviewState();
    const client = await connect(true);
    const refused = await call(client, "repo_pull_request_write", { action: "create", project: "Dev" });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("repo_pull_request_form");
    expect(refused.content[0].text).not.toMatch(/token/i);
    expect((await call(client, "repo_pull_request_write", { action: "vote", project: "Dev" })).isError).toBeUndefined();
    const ok = await call(client, "repo_pull_request_write", signed("repo_pull_request_write", { action: "create", project: "Dev" }));
    expect(ok.content[0].text).toBe('pr:{"action":"create","project":"Dev"}');
  });

  it("opens the pull request form read-only", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "repo_pull_request_form")?.annotations?.readOnlyHint).toBe(true);
    const res = await call(client, "repo_pull_request_form", { title: "T", sourceRefName: "a" });
    expect(JSON.parse(res.content[0].text).note).toMatch(/Nothing has been created/);
  });
});

describe("pipeline runs need the review token", () => {
  const call = async (client: Client, name: string, args: Record<string, unknown>) => (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };

  it("refuses run_pipeline without the view's token, but not other actions", async () => {
    resetReviewState();
    const client = await connect(true);
    const refused = await call(client, "pipelines_write", { action: "run_pipeline", project: "Dev" });
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toContain("pipelines_run_form");
    expect(refused.content[0].text).not.toMatch(/token/i);
    expect((await call(client, "pipelines_write", { action: "rename_pipeline", project: "Dev" })).isError).toBeUndefined();
    const ok = await call(client, "pipelines_write", signed("pipelines_write", { action: "run_pipeline", project: "Dev" }));
    expect(ok.content[0].text).toBe('pipe:{"action":"run_pipeline","project":"Dev"}');
  });

  it("opens the run pipeline form read-only", async () => {
    const client = await connect(true);
    const { tools } = await client.listTools();
    expect(tools.find((t) => t.name === "pipelines_run_form")?.annotations?.readOnlyHint).toBe(true);
    const res = await call(client, "pipelines_run_form", { pipeline: "Dev", branch: "main" });
    expect(JSON.parse(res.content[0].text).note).toMatch(/Nothing has been started/);
  });
});
