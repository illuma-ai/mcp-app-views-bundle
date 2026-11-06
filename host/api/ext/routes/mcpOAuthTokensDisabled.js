/**
 * Replacement for the stock `GET /api/mcp/oauth/tokens/:flowId` handler.
 *
 * The stock handler returned the raw access and refresh tokens of a completed OAuth flow to
 * the owning user's browser. Nothing in the client calls it, and tokens belong on the server,
 * so the route now answers 404 for everyone and never reads the flow state. Authentication still
 * runs first (see the seam in api/server/routes/mcp.js), so an anonymous caller gets 401 and
 * cannot probe the route.
 *
 * Flow progress stays available through `GET /api/mcp/oauth/status/:flowId`, which carries no
 * token material.
 */

/**
 * @param {import('express').Request} _req
 * @param {import('express').Response} res
 * @returns {import('express').Response}
 */
function oauthTokensDisabledHandler(_req, res) {
  return res.status(404).json({ error: 'Not found' });
}

module.exports = { oauthTokensDisabledHandler };
