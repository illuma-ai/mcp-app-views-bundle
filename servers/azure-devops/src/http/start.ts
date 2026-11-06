import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getBearerHandler, WebApi } from "azure-devops-node-api";

import { logger } from "../logger.js";
import { disableElicitation } from "../shared/elicitations.js";
import { configureAllTools } from "../tools.js";
import { captureTools, installViews } from "../views/server.js";
import { UserAgentComposer } from "../useragent.js";
import { packageVersion } from "../version.js";
import { hasSharedConfirmSecret } from "../views/confirm.js";
import { assertSafePublicBinding, loadHttpAuthConfig, ListenAddress } from "./config.js";
import { loadRateLimitConfig } from "./rate-limit.js";
import { getRequestToken } from "./request-context.js";
import { startHttpServer } from "./server.js";

export interface HttpStartOptions {
  orgName: string;
  enabledDomains: Set<string>;
  listen: ListenAddress;
}

/** Defaults the chat host can rely on so users do not have to name them in every request. */
export function buildServerInstructions(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const project = env.ADO_MCP_PROJECT?.trim();
  const team = env.ADO_MCP_TEAM?.trim();
  if (!project && !team) return undefined;
  const parts: string[] = [];
  if (project) parts.push(`The default Azure DevOps project is "${project}"; use it whenever the user does not name a project.`);
  if (team) parts.push(`The default team is "${team}"; use it whenever the user does not name a team.`);
  return parts.join(" ");
}

/**
 * Builds one MCP server wired to the per-request user token.
 * The token provider and the connection provider both read the request context, so each
 * request talks to Azure DevOps as the signed-in user and never as another one.
 */
export function createUserScopedServer(orgName: string, enabledDomains: Set<string>): McpServer {
  const orgUrl = `https://dev.azure.com/${orgName}`;
  const userAgentComposer = new UserAgentComposer(packageVersion);
  const server = new McpServer({ name: "Azure DevOps MCP Server", version: packageVersion }, { instructions: buildServerInstructions() });
  server.server.oninitialized = () => userAgentComposer.appendMcpClientInfo(server.server.getClientVersion());

  const tokenProvider = async () => getRequestToken();
  const connectionProvider = async (): Promise<WebApi> =>
    new WebApi(orgUrl, getBearerHandler(getRequestToken()), undefined, {
      productName: "AzureDevOps.MCP",
      productVersion: packageVersion,
      userAgent: userAgentComposer.userAgent,
    });

  const captured = captureTools(server, () => configureAllTools(server, tokenProvider, connectionProvider, () => userAgentComposer.userAgent, enabledDomains));
  installViews(server, captured, { org: orgName, project: process.env.ADO_MCP_PROJECT?.trim() ?? "", team: process.env.ADO_MCP_TEAM?.trim() ?? "" });
  return server;
}

/** Entry used by index.ts for `--http`. Validates configuration before binding the port. */
export async function runHttpMode(options: HttpStartOptions): Promise<void> {
  // The chat host cannot answer elicitation requests: resolve project and team from defaults or fail plainly.
  disableElicitation();
  // A project's default team is named "<project> Team"; use it when no team default is given.
  const defaultProject = process.env.ADO_MCP_PROJECT?.trim();
  if (defaultProject && !process.env.ADO_MCP_TEAM?.trim()) process.env.ADO_MCP_TEAM = `${defaultProject} Team`;
  // The upstream tools read their default project/team from lower-case variable names, which differ
  // from ours on case-sensitive systems; mirror ours so the defaults apply everywhere.
  if (process.env.ADO_MCP_PROJECT) process.env.ado_mcp_project ??= process.env.ADO_MCP_PROJECT;
  if (process.env.ADO_MCP_TEAM) process.env.ado_mcp_team ??= process.env.ADO_MCP_TEAM;
  const auth = loadHttpAuthConfig();
  assertSafePublicBinding(options.listen, auth);
  if (!hasSharedConfirmSecret())
    logger.warn("ADO_MCP_CONFIRM_SECRET is not set: review tokens use a per-process key, so with more than one replica set the same ADO_MCP_CONFIRM_SECRET on all of them");
  const { port } = await startHttpServer(
    {
      auth,
      createMcpServer: () => createUserScopedServer(options.orgName, options.enabledDomains),
      corsOrigin: process.env.ADO_MCP_CORS_ORIGIN,
      rateLimit: loadRateLimitConfig(),
    },
    options.listen
  );
  logger.info(`Azure DevOps MCP (HTTP) listening on http://${options.listen.host}:${port}/mcp`, { organization: options.orgName, domains: Array.from(options.enabledDomains) });
}
