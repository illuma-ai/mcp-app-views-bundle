const { ResourceType, PermissionBits } = require('librechat-data-provider');
const { checkPermission } = require('~/server/services/PermissionService');
const db = require('~/models');

/**
 * `tool_options` of an agent the user may view, for the app tool-approval verdict. An unknown
 * or unviewable agent yields undefined, so the caller falls back to the normal dialog.
 *
 * @param {string} agentId
 * @param {{ id: string, role?: string }} user
 * @returns {Promise<import('librechat-data-provider').AgentToolOptions | undefined>}
 */
async function getViewableAgentToolOptions(agentId, user) {
  const agent = await db.getAgent({ id: agentId });
  if (!agent) {
    return undefined;
  }
  const canView = await checkPermission({
    userId: user.id,
    role: user.role,
    resourceType: ResourceType.AGENT,
    resourceId: agent._id,
    requiredPermission: PermissionBits.VIEW,
  });
  return canView ? agent.tool_options : undefined;
}

module.exports = { getViewableAgentToolOptions };
