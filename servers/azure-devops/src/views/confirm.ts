/**
 * Review-before-write proof, server side. Over HTTP the writes that create or change work refuse to
 * run unless they carry a review token that only a view's own button can make (see
 * web/lib/review.ts for the token format).
 *
 * Properties, each covered by a test:
 *  - bound to the tool and its arguments: a token for one change is rejected for another;
 *  - bound to the signed-in user and to one view document (nonce);
 *  - expires: `ADO_MCP_REVIEW_TTL_MINUTES` after the view document was read (default 30);
 *  - single use: once a write with a token succeeded, the same token is refused.
 *
 * The per-view key is derived from a secret, so it is never stored. SCALE: replicas must share
 * `ADO_MCP_CONFIRM_SECRET`, otherwise a view read on one replica cannot write through another (a
 * per-process random key is used when it is unset). The single-use list is per process; with several
 * replicas a token can be replayed once per replica until it expires, which the expiry bounds.
 */
import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { getRequestToken } from "../http/request-context.js";
import { type ReviewGrant, parseToken, reviewMac } from "./web/lib/review.js";

const fallbackSecret = randomBytes(32).toString("hex");
const MINUTE = 60_000;

/** True when a shared secret is configured (replicas can then verify each other's views). */
export function hasSharedConfirmSecret(): boolean {
  return Boolean(process.env.ADO_MCP_CONFIRM_SECRET);
}

function secret(): string {
  return process.env.ADO_MCP_CONFIRM_SECRET || fallbackSecret;
}

function ttlMinutes(): number {
  const n = Number(process.env.ADO_MCP_REVIEW_TTL_MINUTES);
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 30;
}

/** Stable identity of the token's owner: the object id claim, else the subject, else a hash of the token. */
export function identityOf(accessToken: string): string {
  const parts = accessToken.split(".");
  if (parts.length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { oid?: string; sub?: string };
      const id = claims.oid ?? claims.sub;
      if (id) return id;
    } catch {
      /* not a JWT payload we can read: fall through */
    }
  }
  return `h:${createHash("sha256").update(accessToken).digest("hex")}`;
}

function currentIdentity(): string {
  try {
    return identityOf(getRequestToken());
  } catch {
    return identityOf(""); // no request context (tests)
  }
}

function viewKey(identity: string, nonce: string, slot: number): string {
  return createHmac("sha256", secret()).update(`view|${identity}|${nonce}|${slot}`).digest("hex");
}

/** A fresh grant for the user of the current request: put into one view document. */
export function issueReviewGrant(now: number = Date.now()): ReviewGrant {
  const nonce = randomBytes(2).toString("hex");
  const slot = Math.floor(now / MINUTE) + ttlMinutes();
  return { nonce, slot, key: viewKey(currentIdentity(), nonce, slot) };
}

export type ReviewVerdict = "ok" | "missing" | "expired" | "used" | "invalid";

const used = new Map<string, number>();

function sweep(now: number): void {
  for (const [token, expires] of used) if (expires < now) used.delete(token);
}

/** Resolves the 16-bit slot in a token to the full expiry minute nearest to now. */
function fullSlot(slot16: number, nowSlot: number): number {
  const base = Math.floor(nowSlot / 65536) * 65536;
  const candidates = [base - 65536 + slot16, base + slot16, base + 65536 + slot16];
  return candidates.reduce((best, c) => (Math.abs(c - nowSlot) < Math.abs(best - nowSlot) ? c : best));
}

/** Checks a write's token against its tool and arguments. Does not consume it: call `markReviewUsed` after the write succeeded. */
export function verifyReview(tool: string, args: Record<string, unknown>, token: unknown, now: number = Date.now()): ReviewVerdict {
  const parsed = parseToken(token);
  if (!parsed) return token === undefined || token === null || token === "" ? "missing" : "invalid";
  const nowSlot = Math.floor(now / MINUTE);
  const slot = fullSlot(parsed.slot16, nowSlot);
  const expected = reviewMac(viewKey(currentIdentity(), parsed.nonce, slot), tool, args);
  const a = Buffer.from(expected);
  const b = Buffer.from(parsed.mac);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return "invalid";
  if (slot < nowSlot) return "expired";
  sweep(now);
  return used.has(String(token)) ? "used" : "ok";
}

/** Marks a token as spent until it would have expired anyway. */
export function markReviewUsed(token: unknown, now: number = Date.now()): void {
  const parsed = parseToken(token);
  if (!parsed) return;
  used.set(String(token), (fullSlot(parsed.slot16, Math.floor(now / MINUTE)) + 1) * MINUTE);
}

/** Test helper: forget spent tokens. */
export function resetReviewState(): void {
  used.clear();
}
