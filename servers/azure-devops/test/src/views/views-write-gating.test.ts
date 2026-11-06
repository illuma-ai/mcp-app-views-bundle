import { describe, expect, it } from "@jest/globals";
import { readdirSync, readFileSync, statSync } from "fs";
import { join, relative } from "path";

import { WRITE_METHODS, WRITE_TOOLS } from "../../../src/views/web/lib/api";

const WEB = join(__dirname, "..", "..", "..", "src", "views", "web");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sources(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

const files = sources(WEB).map((f) => ({ path: relative(WEB, f).replace(/\\/g, "/"), text: readFileSync(f, "utf8") }));
const apiFile = "lib/api.ts";
/** The shared review-token module lists the guarded tools by name but never calls them. */
const reviewFile = "lib/review.ts";

/** The text between the parenthesis at `open` and its match (string contents are skipped). */
function balanced(text: string, open: number): string {
  let depth = 0;
  let quote: string | null = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
    } else if (c === "'" || c === '"' || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

/**
 * Policy (docs/TRANSFER.md): a view never writes implicitly. A write tool or write method may appear
 * only in the API layer, and a write method may be called only from a handler named on... (a button,
 * menu item, Enter key or drop) that runs it through useWrite().run.
 */
describe("views reach write tools only from explicit handlers", () => {
  it("lists every write tool as a write tool", () => {
    expect([...WRITE_TOOLS].sort()).toEqual(["wit_backlog_write", "wit_work_item_comment_write", "wit_work_item_link_write", "wit_work_item_write", "work_iteration_write"]);
  });

  it("names write tools only in the API layer", () => {
    for (const f of files.filter((x) => x.path !== apiFile && x.path !== reviewFile)) {
      for (const tool of WRITE_TOOLS) expect({ file: f.path, mentions: f.text.includes(tool) }).toEqual({ file: f.path, mentions: false });
      expect({ file: f.path, mentions: /_write['"]/.test(f.text) }).toEqual({ file: f.path, mentions: false });
    }
  });

  it("calls write methods only inside on... handlers that go through write.run", () => {
    const offenders: string[] = [];
    let calls = 0;
    for (const f of files.filter((x) => x.path !== apiFile)) {
      for (const method of WRITE_METHODS) {
        const re = new RegExp(`\\bapi\\.${method}\\(`, "g");
        let m: RegExpExecArray | null;
        while ((m = re.exec(f.text))) {
          calls++;
          const before = f.text.slice(0, m.index);
          // Enclosing handler: the closest two-space-indented declaration above the call.
          const decls = [...before.matchAll(/^ {2}(?:const|function)\s+(\{[^}]*\}|\w+)/gm)];
          const enclosing = decls[decls.length - 1];
          const name = enclosing?.[1] ?? "";
          const body = enclosing ? before.slice(enclosing.index) : "";
          if (!/^on[A-Z]/.test(name) || !/write\.run\(/.test(body)) offenders.push(`${f.path}: api.${method}( in "${name}"`);
        }
      }
    }
    expect(calls).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("never starts a write from an effect or a loader", () => {
    let checked = 0;
    for (const f of files.filter((x) => x.path !== apiFile)) {
      for (const call of f.text.matchAll(/\b(useEffect|useLoad)\(/g)) {
        const body = balanced(f.text, (call.index ?? 0) + call[0].length - 1);
        checked++;
        for (const method of WRITE_METHODS) expect({ file: f.path, method, inLoader: body.includes(`api.${method}(`) }).toEqual({ file: f.path, method, inLoader: false });
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("keeps every write method in the API layer", () => {
    const api = files.find((f) => f.path === apiFile)?.text ?? "";
    for (const method of WRITE_METHODS) expect(api).toMatch(new RegExp(`\\b${method}\\(`));
  });
});
