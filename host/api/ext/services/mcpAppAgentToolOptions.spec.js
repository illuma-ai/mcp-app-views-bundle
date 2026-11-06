jest.mock('~/models', () => ({ getAgent: jest.fn() }));
jest.mock('~/server/services/PermissionService', () => ({ checkPermission: jest.fn() }));

const db = require('~/models');
const { checkPermission } = require('~/server/services/PermissionService');
const { getViewableAgentToolOptions } = require('./mcpAppAgentToolOptions');

const user = { id: 'u1', role: 'USER' };

describe('getViewableAgentToolOptions', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns tool_options of a viewable agent', async () => {
    db.getAgent.mockResolvedValue({ _id: 'oid', tool_options: { t: { approval_mode: 'allow' } } });
    checkPermission.mockResolvedValue(true);
    await expect(getViewableAgentToolOptions('agent_1', user)).resolves.toEqual({
      t: { approval_mode: 'allow' },
    });
  });

  it('returns undefined for an agent the user cannot view or that does not exist', async () => {
    db.getAgent.mockResolvedValue({ _id: 'oid', tool_options: { t: { approval_mode: 'allow' } } });
    checkPermission.mockResolvedValue(false);
    await expect(getViewableAgentToolOptions('agent_1', user)).resolves.toBeUndefined();
    db.getAgent.mockResolvedValue(null);
    await expect(getViewableAgentToolOptions('agent_2', user)).resolves.toBeUndefined();
  });
});
