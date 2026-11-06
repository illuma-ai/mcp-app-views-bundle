const express = require('express');
const request = require('supertest');
const { oauthTokensDisabledHandler } = require('./mcpOAuthTokensDisabled');

describe('oauthTokensDisabledHandler', () => {
  const app = express();
  app.get('/oauth/tokens/:flowId', oauthTokensDisabledHandler);

  it('answers 404 without any token field', async () => {
    const response = await request(app).get('/oauth/tokens/user-1:server');
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: 'Not found' });
    expect(JSON.stringify(response.body)).not.toMatch(/token/i);
  });
});
