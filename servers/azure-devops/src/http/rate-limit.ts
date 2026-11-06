/**
 * Per-IP fixed-window rate limiting for the OAuth endpoints and /mcp, mirroring the defaults of the
 * other server (30 per minute for /authorize, /token and /register; 120 per minute for /mcp).
 * SCALE: the counters live in the process, so with N replicas the effective limit is N times higher;
 * a shared limiter belongs in front of the replicas (the ALB or a WAF).
 */
import type { IncomingMessage } from "http";

export interface RateLimitConfig {
  /** Requests per window for /authorize, /token and /register. */
  authMax: number;
  /** Requests per window for /mcp. */
  mcpMax: number;
  windowMs: number;
  disabled: boolean;
  /** Reverse proxies in front of this server whose X-Forwarded-For entries are trusted (0: use the socket address). */
  trustProxyHops: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = { authMax: 30, mcpMax: 120, windowMs: 60_000, disabled: false, trustProxyHops: 0 };

export function loadRateLimitConfig(env: NodeJS.ProcessEnv = process.env): RateLimitConfig {
  const hops = Number(env.ADO_MCP_TRUST_PROXY_HOPS);
  return {
    ...DEFAULT_RATE_LIMIT,
    disabled: env.ADO_MCP_RATE_LIMIT_DISABLED === "true" || env.ADO_MCP_RATE_LIMIT_DISABLED === "1",
    trustProxyHops: Number.isInteger(hops) && hops > 0 ? hops : 0,
  };
}

/** The client address: the socket's, or the entry `hops` places from the right of X-Forwarded-For when a proxy is trusted. */
export function clientIp(req: IncomingMessage, trustProxyHops: number): string {
  if (trustProxyHops > 0) {
    const forwarded = String(req.headers["x-forwarded-for"] ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const entry = forwarded[forwarded.length - trustProxyHops];
    if (entry) return entry;
  }
  return req.socket.remoteAddress ?? "unknown";
}

export class FixedWindowLimiter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  /** Counts one request; returns the seconds to wait when the key is over its limit, else 0. */
  hit(key: string, now: number = Date.now()): number {
    if (this.windows.size > 10_000) this.sweep(now);
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return 0;
    }
    w.count++;
    return w.count > this.max ? Math.max(1, Math.ceil((w.resetAt - now) / 1000)) : 0;
  }

  private sweep(now: number): void {
    for (const [key, w] of this.windows) if (w.resetAt <= now) this.windows.delete(key);
  }
}
