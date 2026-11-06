import { createHmac } from "crypto";
import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { z } from "zod";

import { requestContext } from "../../../src/http/request-context";
import { hasSharedConfirmSecret, issueReviewGrant, markReviewUsed, resetReviewState, verifyReview } from "../../../src/views/confirm";
import { boundMessage, canonicalJson, formatToken, hmacSha256Hex, parseToken } from "../../../src/views/web/lib/review";

jest.mock("@modelcontextprotocol/ext-apps/server", () => ({ RESOURCE_MIME_TYPE: "text/html;profile=mcp-app", registerAppResource: () => undefined }), { virtual: true });
jest.mock("../../../src/generated/views-bundle", () => ({ VIEW_BUNDLE_JS: "" }), { virtual: true });
import { captureTools } from "../../../src/views/server";

const TOOL = "wit_work_item_write";
const A = { action: "update", project: "Dev", id: 4, updates: [{ op: "replace", path: "/fields/System.State", value: "Doing" }] };
const B = { ...A, id: 5 };
const MINUTE = 60_000;

beforeEach(() => resetReviewState());

describe("the proof the view computes", () => {
  it("is plain JavaScript HMAC-SHA256 that agrees with Node's", () => {
    for (const [key, message] of [
      ["", ""],
      ["key", "The quick brown fox jumps over the lazy dog"],
      ["k".repeat(100), "long key is hashed first"],
      ["clé", "mensaje ñ — 日本語 😀"],
      ["a".repeat(64), "m".repeat(1000)],
    ]) {
      expect(hmacSha256Hex(key, message)).toBe(createHmac("sha256", key).update(message).digest("hex"));
    }
  });

  it("canonicalises arguments the same whatever their key order, and leaves out empty values", () => {
    expect(canonicalJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: null, e: undefined } })).toBe('{"a":{"d":[3,{"x":2,"y":1}]},"b":1}');
    expect(boundMessage(TOOL, { ...A, extra: "not bound", fields: undefined })).toBe(boundMessage(TOOL, A));
  });

  it("has the 16 character layout nonce, expiry, mac", () => {
    const token = formatToken({ nonce: "ab12", slot: 0x12345, key: "k" }, TOOL, A);
    expect(token).toMatch(/^ab122345[0-9a-f]{8}$/);
    expect(parseToken(token)).toMatchObject({ nonce: "ab12", slot16: 0x2345 });
    expect(parseToken("short")).toBeUndefined();
  });
});

describe("verification", () => {
  const now = Date.UTC(2026, 10, 6, 12, 0, 0);

  it("accepts the token for exactly the arguments it was made for", () => {
    const grant = issueReviewGrant(now);
    expect(verifyReview(TOOL, A, formatToken(grant, TOOL, A), now)).toBe("ok");
  });

  it("rejects a token made for other arguments, another tool, or a forged mac", () => {
    const grant = issueReviewGrant(now);
    const token = formatToken(grant, TOOL, A);
    expect(verifyReview(TOOL, B, token, now)).toBe("invalid");
    expect(verifyReview("work_iteration_write", A, token, now)).toBe("invalid");
    expect(verifyReview(TOOL, A, `${token.slice(0, 8)}00000000`, now)).toBe("invalid");
    expect(verifyReview(TOOL, A, undefined, now)).toBe("missing");
    expect(verifyReview(TOOL, A, "guess", now)).toBe("invalid");
  });

  it("rejects an expired token", () => {
    const grant = issueReviewGrant(now);
    const token = formatToken(grant, TOOL, A);
    expect(verifyReview(TOOL, A, token, now + 29 * MINUTE)).toBe("ok");
    expect(verifyReview(TOOL, A, token, now + 32 * MINUTE)).toBe("expired");
  });

  it("rejects a replay once the write succeeded, but not before", () => {
    const grant = issueReviewGrant(now);
    const token = formatToken(grant, TOOL, A);
    expect(verifyReview(TOOL, A, token, now)).toBe("ok");
    expect(verifyReview(TOOL, A, token, now)).toBe("ok"); // not spent yet: a failed write can be retried
    markReviewUsed(token, now);
    expect(verifyReview(TOOL, A, token, now)).toBe("used");
  });

  it("belongs to the user the view was read for", async () => {
    const jwt = (sub: string): string => `${Buffer.from("{}").toString("base64url")}.${Buffer.from(JSON.stringify({ sub })).toString("base64url")}.s`;
    const grant = await requestContext.run({ accessToken: jwt("alice") }, async () => issueReviewGrant(now));
    const token = formatToken(grant, TOOL, A);
    expect(await requestContext.run({ accessToken: jwt("alice") }, async () => verifyReview(TOOL, A, token, now))).toBe("ok");
    expect(await requestContext.run({ accessToken: jwt("bob") }, async () => verifyReview(TOOL, A, token, now))).toBe("invalid");
  });

  it("is not derived from the Entra client secret", () => {
    const before = process.env.ADO_MCP_CLIENT_SECRET;
    process.env.ADO_MCP_CLIENT_SECRET = "client-secret";
    try {
      const grant = issueReviewGrant(now);
      // A key made from the client secret would verify here; the per-process random key does not.
      const forged = createHmac("sha256", "client-secret").update(`view|h:${"x"}|${grant.nonce}|${grant.slot}`).digest("hex");
      expect(grant.key).not.toBe(forged);
      expect(hasSharedConfirmSecret()).toBe(false);
    } finally {
      if (before === undefined) delete process.env.ADO_MCP_CLIENT_SECRET;
      else process.env.ADO_MCP_CLIENT_SECRET = before;
    }
  });
});

describe("through the guarded tool", () => {
  async function connect(): Promise<Client> {
    const server = new McpServer({ name: "t", version: "0" });
    captureTools(server, () => {
      server.tool(TOOL, "write", { action: z.string(), project: z.string().optional(), id: z.number().optional(), updates: z.array(z.any()).optional() }, { readOnlyHint: false }, async (args) =>
        args.id === 999 ? { content: [{ type: "text", text: "upstream failure" }], isError: true } : { content: [{ type: "text", text: `wrote ${args.id}` }] }
      );
    });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await server.connect(a);
    const client = new Client({ name: "c", version: "0" });
    await client.connect(b);
    return client;
  }
  const call = async (client: Client, args: Record<string, unknown>) => (await client.callTool({ name: TOOL, arguments: args })) as { isError?: boolean; content: { text: string }[] };

  it("runs a change once with its own token and refuses the replay, other arguments and an expired token", async () => {
    const client = await connect();
    const grant = issueReviewGrant();
    const token = formatToken(grant, TOOL, A);

    expect((await call(client, { ...A, reviewToken: formatToken(grant, TOOL, B) })).isError).toBe(true); // token for B, args A
    const ok = await call(client, { ...A, reviewToken: token });
    expect(ok.isError).toBeUndefined();
    expect(ok.content[0].text).toBe("wrote 4");

    const replay = await call(client, { ...A, reviewToken: token });
    expect(replay.isError).toBe(true);
    expect(replay.content[0].text).toMatch(/already made/);

    const expired = issueReviewGrant(Date.now() - 31 * MINUTE);
    const late = await call(client, { ...B, reviewToken: formatToken(expired, TOOL, B) });
    expect(late.isError).toBe(true);
    expect(late.content[0].text).toMatch(/expired/);
  });

  it("does not spend the token when the write itself failed", async () => {
    const client = await connect();
    const failing = { action: "update", project: "Dev", id: 999 };
    const token = formatToken(issueReviewGrant(), TOOL, failing);
    expect((await call(client, { ...failing, reviewToken: token })).content[0].text).toBe("upstream failure");
    expect((await call(client, { ...failing, reviewToken: token })).content[0].text).toBe("upstream failure"); // retried, not "already made"
  });
});
