import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { configureWorkTools } from "../../../src/tools/work";
import { configureWorkItemTools } from "../../../src/tools/work-items";

jest.mock("../../../src/index", () => ({ orgName: "gaavi" }));

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

function handlerFor(server: McpServer, tool: string): Handler {
  const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === tool);
  if (!call) throw new Error(`${tool} not registered`);
  return call[call.length - 1] as Handler;
}

describe("work_iteration_write update", () => {
  let server: McpServer;
  const updateClassificationNode = jest.fn<(...a: unknown[]) => Promise<unknown>>();

  beforeEach(() => {
    updateClassificationNode.mockReset();
    server = { tool: jest.fn() } as unknown as McpServer;
    const connection = { getWorkItemTrackingApi: async () => ({ updateClassificationNode }) };
    configureWorkTools(
      server,
      async () => "t",
      async () => connection as never
    );
  });

  it("sets the dates of an existing iteration, keeping its name", async () => {
    updateClassificationNode.mockResolvedValue({ name: "Sprint 1" });
    const res = await handlerFor(
      server,
      "work_iteration_write"
    )({
      action: "update",
      project: "Dev",
      iterations: [{ path: "Dev\\Iteration\\Sprint 1", startDate: "2026-11-02T00:00:00Z", finishDate: "2026-11-13T00:00:00Z" }],
    });
    expect(res.isError).toBeUndefined();
    const [node, project, group, path] = updateClassificationNode.mock.calls[0] as [{ name: string; attributes: { startDate: Date; finishDate: Date } }, string, number, string];
    expect(project).toBe("Dev");
    expect(path).toBe("Sprint 1");
    expect(group).toBeDefined();
    expect(node.name).toBe("Sprint 1");
    expect(node.attributes.startDate.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(node.attributes.finishDate.toISOString()).toBe("2026-11-13T00:00:00.000Z");
  });

  it("renames an iteration and accepts a bare name as the path", async () => {
    updateClassificationNode.mockResolvedValue({ name: "Release 1" });
    await handlerFor(server, "work_iteration_write")({ action: "update", project: "Dev", iterations: [{ path: "Sprint 2", newName: "Release 1" }] });
    const [node, , , path] = updateClassificationNode.mock.calls[0] as [{ name: string; attributes?: unknown }, string, number, string];
    expect(path).toBe("Sprint 2");
    expect(node.name).toBe("Release 1");
    expect(node.attributes).toBeUndefined();
  });

  it("reports an error when nothing could be updated", async () => {
    const res = await handlerFor(server, "work_iteration_write")({ action: "update", project: "Dev", iterations: [{ path: "Sprint 1" }] });
    expect(res.isError).toBe(true);
    expect(updateClassificationNode).not.toHaveBeenCalled();
  });
});

describe("wit_work_item_write create with a parent", () => {
  it("adds the parent link, iteration and area in the one create call", async () => {
    const server = { tool: jest.fn() } as unknown as McpServer;
    const createWorkItem = jest.fn<(...a: unknown[]) => Promise<unknown>>().mockResolvedValue({ id: 5 });
    const connection = { serverUrl: "https://dev.azure.com/gaavi", getWorkItemTrackingApi: async () => ({ createWorkItem }) };
    configureWorkItemTools(
      server,
      async () => "t",
      async () => connection as never,
      () => "ua"
    );

    await handlerFor(
      server,
      "wit_work_item_write"
    )({
      action: "create",
      project: "Dev",
      workItemType: "Task",
      parentId: 12,
      fields: [
        { name: "System.Title", value: "Write tests" },
        { name: "System.IterationPath", value: "Dev\\Sprint 1" },
        { name: "System.AreaPath", value: "Dev" },
      ],
    });

    const [, document, project, type] = createWorkItem.mock.calls[0] as [null, { op: string; path: string; value: unknown }[], string, string];
    expect(project).toBe("Dev");
    expect(type).toBe("Task");
    expect(document.map((d) => d.path)).toEqual(["/fields/System.Title", "/fields/System.IterationPath", "/fields/System.AreaPath", "/relations/-"]);
    expect(document[3].value).toEqual({ rel: "System.LinkTypes.Hierarchy-Reverse", url: "https://dev.azure.com/gaavi/Dev/_apis/wit/workItems/12" });
  });
});
