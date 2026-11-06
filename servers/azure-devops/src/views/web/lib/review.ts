/**
 * The review proof shared by the server and the views (pure: no DOM, no Node modules).
 *
 * A guarded write must carry a token that proves it was started by a view's own button for exactly
 * these arguments: token = nonce(4 hex) + expiry slot(4 hex) + mac(8 hex), 16 hex characters. The
 * mac is an HMAC-SHA256 under a per-view key over the tool name and the canonical JSON of the bound
 * arguments. The per-view key is derived on the server from a secret, the user and the view's nonce
 * and expiry, and is put into the view document only, so a model that never sees the document cannot
 * make a token, and a token for one set of arguments is useless for another.
 */

/** Arguments that take part in the proof, per guarded tool (the ones the views send; defaults added by validation are not among them). */
export const BOUND_KEYS: Readonly<Record<string, readonly string[]>> = {
  wit_work_item_write: ["action", "project", "id", "workItemType", "fields", "updates", "parentId", "batchUpdates", "items"],
  work_iteration_write: ["action", "project", "team", "iterations"],
  testplan_test_plan_write: ["action", "project", "name", "iteration", "description", "startDate", "endDate", "areaPath"],
  testplan_test_suite_write: ["action", "project", "planId", "parentSuiteId", "name", "suiteId", "testCaseIds"],
  repo_pull_request_write: [
    "action",
    "repositoryId",
    "project",
    "pullRequestId",
    "sourceRefName",
    "targetRefName",
    "title",
    "description",
    "isDraft",
    "workItems",
    "labels",
    "forkSourceRepositoryId",
    "status",
    "autoComplete",
    "reviewerIds",
    "reviewerAction",
    "isRequired",
    "vote",
    "mergeStrategy",
    "deleteSourceBranch",
    "transitionWorkItems",
    "mergeCommitMessage",
    "bypassPolicy",
    "bypassReason",
  ],
  pipelines_write: ["action", "project", "pipelineId", "resources", "variables", "templateParameters", "stagesToSkip", "previewRun"],
  testplan_test_case_write: ["action", "project", "title", "priority", "areaPath", "iterationPath", "testsWorkItemId", "id", "steps"],
};

/** JSON with object keys sorted, undefined and null left out, so both sides produce the same text. */
export function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined && v !== null)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** The text the mac covers: the tool and its bound arguments. */
export function boundMessage(tool: string, args: Record<string, unknown>): string {
  const keys = BOUND_KEYS[tool] ?? [];
  const bound: Record<string, unknown> = {};
  for (const key of keys) if (args[key] !== undefined && args[key] !== null) bound[key] = args[key];
  return `${tool}|${canonicalJson(bound)}`;
}

// ---- SHA-256 and HMAC in plain JavaScript (the view cannot rely on Web Crypto in a sandboxed frame) ----

const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function utf8(text: string): number[] {
  const out: number[] = [];
  for (const ch of unescape(encodeURIComponent(text))) out.push(ch.charCodeAt(0));
  return out;
}

function sha256Bytes(data: number[]): number[] {
  const h = new Uint32Array([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]);
  const bytes = data.slice();
  const bitLength = data.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  for (let i = 3; i >= 0; i--) bytes.push((high >>> (i * 8)) & 0xff);
  for (let i = 3; i >= 0; i--) bytes.push((bitLength >>> (i * 8)) & 0xff);
  const w = new Uint32Array(64);
  const rotr = (x: number, n: number): number => (x >>> n) | (x << (32 - n));
  for (let off = 0; off < bytes.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) | (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) | 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) | 0;
    }
    h[0] += a;
    h[1] += b;
    h[2] += c;
    h[3] += d;
    h[4] += e;
    h[5] += f;
    h[6] += g;
    h[7] += hh;
  }
  const out: number[] = [];
  for (const word of h) for (let i = 3; i >= 0; i--) out.push((word >>> (i * 8)) & 0xff);
  return out;
}

const toHex = (bytes: number[]): string => bytes.map((b) => b.toString(16).padStart(2, "0")).join("");

/** HMAC-SHA256 as lowercase hex; key and message are read as UTF-8 text. */
export function hmacSha256Hex(key: string, message: string): string {
  let k = utf8(key);
  if (k.length > 64) k = sha256Bytes(k);
  while (k.length < 64) k.push(0);
  const inner = sha256Bytes([...k.map((b) => b ^ 0x36), ...utf8(message)]);
  return toHex(sha256Bytes([...k.map((b) => b ^ 0x5c), ...inner]));
}

/** The 8 hex character mac for one write. */
export function reviewMac(viewKey: string, tool: string, args: Record<string, unknown>): string {
  return hmacSha256Hex(viewKey, boundMessage(tool, args)).slice(0, 8);
}

export interface ReviewGrant {
  /** 4 hex characters identifying the view document. */
  nonce: string;
  /** Expiry in minutes since the Unix epoch. */
  slot: number;
  /** The per-view key (hex). Lives only in the view document. */
  key: string;
}

/** The 16 character token a view sends with one write. */
export function formatToken(grant: ReviewGrant, tool: string, args: Record<string, unknown>): string {
  return `${grant.nonce}${(grant.slot % 65536).toString(16).padStart(4, "0")}${reviewMac(grant.key, tool, args)}`;
}

export interface ParsedToken {
  nonce: string;
  slot16: number;
  mac: string;
}

export function parseToken(token: unknown): ParsedToken | undefined {
  if (typeof token !== "string" || !/^[0-9a-f]{16}$/.test(token)) return undefined;
  return { nonce: token.slice(0, 4), slot16: parseInt(token.slice(4, 8), 16), mac: token.slice(8) };
}
