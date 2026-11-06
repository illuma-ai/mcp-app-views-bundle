import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { disableElicitation, elicitProject, elicitTeam } from "../../../src/shared/elicitations";
import { configureWorkTools } from "../../../src/tools/work";
import { configureWorkItemTools } from "../../../src/tools/work-items";

jest.mock("../../../src/index", () => ({ orgName: "gaavi" }));

type Handler = (args: Record<string, unknown>) => Promise<{ content: { text: string }[]; isError?: boolean }>;

const elicitInput = jest.fn<() => Promise<unknown>>();
const server = { tool: jest.fn(), server: { elicitInput } } as unknown as McpServer;
const connection = {
  getCoreApi: async () => ({
    getProjects: async () => [{ name: "Dev" }, { name: "Ops" }],
    getTeams: async () => [{ name: "Dev Team" }, { name: "Other" }],
  }),
};
const singleProject = { getCoreApi: async () => ({ getProjects: async () => [{ name: "Dev" }], getTeams: async () => [{ name: "Only" }] }) };

function handlerFor(tool: string): Handler {
  const call = (server.tool as jest.Mock).mock.calls.find(([name]) => name === tool);
  if (!call) throw new Error(`${tool} not registered`);
  return call[call.length - 1] as Handler;
}

// Runs with --http on: the chat host cannot answer elicitation, so no tool path may ask.
describe("no elicitation once the HTTP mode switched it off", () => {
  beforeEach(() => {
    disableElicitation();
    delete process.env.ado_mcp_project;
    delete process.env.ado_mcp_team;
    elicitInput.mockReset();
  });
  afterEach(() => {
    delete process.env.ado_mcp_project;
    delete process.env.ado_mcp_team;
  });

  it("uses the configured defaults", async () => {
    process.env.ado_mcp_project = "Dev";
    process.env.ado_mcp_team = "Dev Team";
    expect(await elicitProject(server, connection as never)).toEqual({ resolved: "Dev" });
    expect(await elicitTeam(server, connection as never, "Dev")).toEqual({ resolved: "Dev Team" });
    expect(elicitInput).not.toHaveBeenCalled();
  });

  it("picks the project's default team or a single choice, otherwise answers with a clear error", async () => {
    expect(await elicitTeam(server, connection as never, "Dev")).toEqual({ resolved: "Dev Team" });
    expect(await elicitProject(server, singleProject as never)).toEqual({ resolved: "Dev" });
    expect(await elicitTeam(server, singleProject as never, "Dev")).toEqual({ resolved: "Only" });

    const project = await elicitProject(server, connection as never);
    expect("response" in project && project.response.isError).toBe(true);
    expect("response" in project && project.response.content[0].text).toMatch(/ADO_MCP_PROJECT/);
    const team = await elicitTeam(server, connection as never, "Ops");
    expect("response" in team && team.response.content[0].text).toMatch(/ADO_MCP_TEAM/);
    expect(elicitInput).not.toHaveBeenCalled();
  });

  it("keeps tool calls without a project or team from asking the client", async () => {
    configureWorkTools(
      server,
      async () => "t",
      async () => connection as never
    );
    configureWorkItemTools(
      server,
      async () => "t",
      async () => connection as never,
      () => "ua"
    );

    // Two projects and no default: a plain error, never a request to the client.
    const iterations = await handlerFor("work")({ action: "list_team_iterations" });
    expect(iterations.isError).toBe(true);
    expect(iterations.content[0].text).toMatch(/project is required/i);

    const backlog = await handlerFor("wit_backlog")({ action: "list" });
    expect(backlog.isError).toBe(true);

    const query = await handlerFor("wit_query")({ action: "wiql", wiql: "SELECT [System.Id] FROM WorkItems" });
    expect(query.isError).toBe(true);
    expect(elicitInput).not.toHaveBeenCalled();
  });
});
