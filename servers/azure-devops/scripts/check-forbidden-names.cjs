#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Brand-neutrality gate: fails when the chat host product name appears anywhere in the repo
 * (code, comments, tests, docs, examples, log strings), case-insensitive. Also reports hits for
 * the retired names and the local checkout folder name; those are warnings, not failures.
 * Skips node_modules, dist, coverage and .git (coverage output holds absolute local paths).
 *
 * Tokens are assembled from fragments so this file does not contain them itself.
 */
const fs = require("fs");
const path = require("path");

const FAIL = [["lib", "re", "chat"].join("")];
const REPORT = [["ran", "ger"].join(""), ["illu", "ma"].join(""), ["tex", "as"].join("")];
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", ".git"]);
const SELF = path.basename(__filename);
const TEXT_LIMIT = 4 * 1024 * 1024;

/** Walks a directory and yields the text files worth scanning. */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile() && entry.name !== SELF && fs.statSync(full).size < TEXT_LIMIT) yield full;
  }
}

/**
 * Scans a root for the given tokens.
 * @param {string} root Directory to scan.
 * @param {string[]} tokens Lower-case tokens to find.
 * @returns {{file: string, line: number, token: string}[]} Every hit.
 */
function scan(root, tokens) {
  const hits = [];
  for (const file of walk(root)) {
    const buf = fs.readFileSync(file);
    if (buf.includes(0)) continue; // binary
    buf
      .toString("utf8")
      .split("\n")
      .forEach((text, i) => {
        const lower = text.toLowerCase();
        for (const token of tokens) if (lower.includes(token)) hits.push({ file: path.relative(root, file).split(path.sep).join("/"), line: i + 1, token: "<forbidden-name>" });
      });
  }
  return hits;
}

module.exports = { scan, FAIL, REPORT };

if (require.main === module) {
  const root = path.resolve(__dirname, "..");
  const failures = scan(root, FAIL);
  const reports = scan(root, REPORT);
  for (const h of reports) console.warn(`report: ${h.file}:${h.line}`);
  for (const h of failures) console.error(`forbidden name: ${h.file}:${h.line}`);
  if (failures.length > 0) process.exit(1);
  console.log(`No forbidden names (${reports.length} report hits).`);
}
