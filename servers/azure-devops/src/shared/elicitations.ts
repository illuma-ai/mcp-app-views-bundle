// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebApi } from "azure-devops-node-api";

interface ElicitResolved {
  resolved: string;
}

interface ElicitResponse {
  response: { content: { type: "text"; text: string }[]; isError?: boolean };
}

export type ElicitResult = ElicitResolved | ElicitResponse;

let elicitationDisabled = false;

/**
 * Turns elicitation off for the whole process. The HTTP mode runs behind a chat host whose app
 * bridge cannot answer elicitation requests, so a tool that lacks a project or team must resolve it
 * from the defaults or answer with a plain error, never ask the client.
 */
export function disableElicitation(): void {
  elicitationDisabled = true;
}

function errorResponse(text: string): ElicitResponse {
  return { response: { content: [{ type: "text", text }], isError: true } };
}

export async function elicitProject(server: McpServer, connection: WebApi, message?: string): Promise<ElicitResult> {
  // Check for default project from environment variable
  const defaultProject = process.env.ado_mcp_project;

  if (defaultProject) {
    return { resolved: defaultProject };
  }

  const coreApi = await connection.getCoreApi();
  const projects = await coreApi.getProjects("wellFormed", 100, 0, undefined, false);

  if (!projects || projects.length === 0) {
    return { response: { content: [{ type: "text", text: "No projects found to select from." }], isError: true } };
  }

  if (elicitationDisabled) {
    const names = projects.map((p) => p.name ?? p.id ?? "").filter(Boolean);
    if (names.length === 1) return { resolved: names[0] };
    return errorResponse(`A project is required. Pass the project argument (one of: ${names.join(", ")}) or set the server default (ADO_MCP_PROJECT).`);
  }

  const result = await server.server.elicitInput({
    mode: "form",
    message: message ?? "Select the Azure DevOps project.",
    requestedSchema: {
      type: "object",
      properties: {
        project: {
          type: "string",
          title: "Project",
          description: "The Azure DevOps project.",
          oneOf: projects.map((p) => ({
            const: p.name ?? p.id ?? "",
            title: p.name ?? p.id ?? "Unknown project",
          })),
        },
      },
      required: ["project"],
    },
  });

  if (result.action !== "accept" || !result.content?.project) {
    return { response: { content: [{ type: "text", text: "Project selection cancelled." }] } };
  }

  return { resolved: String(result.content.project) };
}

export async function elicitTeam(server: McpServer, connection: WebApi, project: string, message?: string): Promise<ElicitResult> {
  // Check for default team from environment variable
  const defaultTeam = process.env.ado_mcp_team;

  if (defaultTeam) {
    return { resolved: defaultTeam };
  }

  const coreApi = await connection.getCoreApi();
  const teams = await coreApi.getTeams(project, undefined, undefined, undefined, false);

  if (!teams || teams.length === 0) {
    return { response: { content: [{ type: "text", text: "No teams found to select from." }], isError: true } };
  }

  if (elicitationDisabled) {
    const names = teams.map((t) => t.name ?? t.id ?? "").filter(Boolean);
    // The project's default team is named "<project> Team"; a project with one team has no choice.
    const preferred = names.find((n) => n.toLowerCase() === `${project} team`.toLowerCase()) ?? (names.length === 1 ? names[0] : undefined);
    if (preferred) return { resolved: preferred };
    return errorResponse(`A team is required. Pass the team argument (one of: ${names.join(", ")}) or set the server default (ADO_MCP_TEAM).`);
  }

  const result = await server.server.elicitInput({
    mode: "form",
    message: message ?? "Select the team.",
    requestedSchema: {
      type: "object",
      properties: {
        team: {
          type: "string",
          title: "Team",
          description: "The team from a specific Azure DevOps project.",
          oneOf: teams.map((t) => ({
            const: t.name ?? t.id ?? "",
            title: t.name ?? t.id ?? "Unknown team",
          })),
        },
      },
      required: ["team"],
    },
  });

  if (result.action !== "accept" || !result.content?.team) {
    return { response: { content: [{ type: "text", text: "Team selection cancelled." }] } };
  }

  return { resolved: String(result.content.team) };
}
