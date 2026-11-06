import os from 'os';
import path from 'path';
import { PassThrough } from 'stream';
import winston from 'winston';
import { describe, expect, it } from 'vitest';

process.env.MS365_MCP_LOG_DIR = path.join(os.tmpdir(), 'ms365-logger-redaction-test');

const SECRETS = [
  'rt-1.AbCdEfGhIjKlMnOp',
  'at-eyJhbGciOiJIUzI1NiJ9.payload.sig',
  'verifier-0123456789abcdefghij',
  'cs-shhh-client-secret',
  'auth-code-9f8e7d',
];

/** The real logger format, writing to a stream the test can read, the way the console transport prints metadata. */
async function logThrough(write: (log: winston.Logger) => void): Promise<string> {
  const { redactFormat } = await import('../src/logger.js');
  const stream = new PassThrough();
  const chunks: string[] = [];
  stream.on('data', (c) => chunks.push(String(c)));
  const log = winston.createLogger({
    format: winston.format.combine(redactFormat(), winston.format.json()),
    transports: [new winston.transports.Stream({ stream })],
  });
  write(log);
  await new Promise((r) => setTimeout(r, 20));
  return chunks.join('');
}

describe('logger metadata redaction', () => {
  it('never lets a token, verifier, secret or code in a logged object reach a transport', async () => {
    const out = await logThrough((log) =>
      log.error('Token endpoint failed', {
        body: {
          grant_type: 'refresh_token',
          refresh_token: SECRETS[0],
          access_token: SECRETS[1],
          code_verifier: SECRETS[2],
          client_secret: SECRETS[3],
          code: SECRETS[4],
          nested: [{ id_token: SECRETS[1], note: `Bearer ${SECRETS[1]}` }],
        },
        err: new Error(`failed with refresh_token=${SECRETS[0]}`),
      })
    );
    for (const secret of SECRETS) expect(out, secret).not.toContain(secret);
    expect(out).toContain('Token endpoint failed');
    expect(out).toContain('[REDACTED]');
  });

  it('keeps ordinary fields and error codes readable, and survives circular objects', async () => {
    const loop: Record<string, unknown> = { status: 400, code: undefined, error: 'invalid_grant' };
    loop.self = loop;
    const out = await logThrough((log) =>
      log.warn('upstream error', { upstream_status: 400, loop })
    );
    expect(out).toContain('invalid_grant');
    expect(out).toContain('"upstream_status":400');
    expect(out).toContain('[Circular]');
  });
});
