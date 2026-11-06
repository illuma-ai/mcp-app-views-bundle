import { describe, expect, it, jest } from "@jest/globals";
import { resolveScope } from "../../../src/views/scope";
import { AdoApi, type HostBridge } from "../../../src/views/web/lib/api";

function make(): { api: AdoApi; callTool: jest.Mock<HostBridge["callTool"]> } {
  const callTool = jest.fn<HostBridge["callTool"]>().mockResolvedValue({ content: [{ type: "text", text: "[]" }] });
  const host: HostBridge = { callTool, openLink: async () => undefined, sendMessage: async () => undefined, canCallTools: () => true, canOpenLinks: () => true, canMessage: () => true };
  return { api: new AdoApi(host, { org: "gaavi", project: "Dev", team: "Dev Team", tools: ["repo_pull_request", "wit_query", "repo_repository"] }), callTool };
}

describe("the project a view works in", () => {
  it("is the server default until the opening tool call names another", async () => {
    const { api, callTool } = make();
    api.setScope(undefined, undefined);
    await api.repositories();
    expect(callTool.mock.calls[0][1]).toMatchObject({ project: "Dev" });
    expect(api.config.team).toBe("Dev Team");
  });

  it("follows the project the tool call named, with that project's default team, on every call", async () => {
    const { api, callTool } = make();
    api.setScope("DevAgile", undefined);
    expect(api.config).toMatchObject({ project: "DevAgile", team: "DevAgile Team" });
    await api.repositories();
    await api.pullRequests("Active");
    for (const call of callTool.mock.calls) expect(call[1]).toMatchObject({ project: "DevAgile" });
  });

  it("takes an explicit team, and goes back to the defaults when the next call names none", () => {
    const { api } = make();
    api.setScope("DevAgile", "Platform Team");
    expect(api.config.team).toBe("Platform Team");
    api.setScope(undefined, undefined);
    expect(api.config).toMatchObject({ project: "Dev", team: "Dev Team" });
  });

  it("ignores anything that is not a plain project name", () => {
    const { api } = make();
    for (const bad of ["", "  ", "../x", "a/b", "x".repeat(80), 7, null, { a: 1 }]) api.setScope(bad, undefined);
    expect(api.config.project).toBe("Dev");
  });
});

describe("the form tools report the scope they resolved", () => {
  const config = { project: "Dev", team: "Dev Team" };
  it("uses the server defaults when the call names none", () => {
    expect(resolveScope({}, config)).toEqual({ project: "Dev", team: "Dev Team" });
  });
  it("reports the named project and its default team, not the server's team", () => {
    expect(resolveScope({ project: "DevAgile" }, config)).toEqual({ project: "DevAgile", team: "DevAgile Team" });
    expect(resolveScope({ project: "DevAgile", team: "Platform Team" }, config)).toEqual({ project: "DevAgile", team: "Platform Team" });
  });
  it("ignores names that are not plain project names", () => {
    expect(resolveScope({ project: "../x", team: "a/b" }, config)).toEqual(config);
  });
});
