import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// The names are built from pieces so this file does not contain them itself. They must not appear
// anywhere in the repository: say "the chat host" or "the host's MCP config" instead.
const FORBIDDEN: Array<[string, RegExp]> = [
  ['the chat host product name', new RegExp('libre' + 'chat', 'i')],
  // not inside a longer word ("arranger", "stranger")
  ['a retired platform name', new RegExp('(?<![a-z])ran' + 'ger', 'i')],
  ['a retired agent name', new RegExp('illu' + 'ma', 'i')],
];

/** Every file the repository carries: tracked or untracked, never ignored, never node_modules, dist or .git. */
function repoFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => !/^(node_modules|dist|\.git)\//.test(f));
}

describe('brand-neutral repository', () => {
  it('has no forbidden product name in any file name or file content', () => {
    const found: string[] = [];
    for (const file of repoFiles()) {
      for (const [label, pattern] of FORBIDDEN) {
        if (pattern.test(file)) found.push(`${file} (path): ${label}`);
      }
      let text: string;
      try {
        text = readFileSync(path.join(root, file), 'utf8');
      } catch {
        continue; // deleted in the working tree, or unreadable
      }
      if (text.includes('\u0000')) continue; // binary
      const lines = text.split(/\r?\n/);
      lines.forEach((line, i) => {
        for (const [label, pattern] of FORBIDDEN) {
          if (pattern.test(line)) found.push(`${file}:${i + 1}: ${label}`);
        }
      });
    }
    expect(found, 'remove these (use "the chat host" in prose)').toEqual([]);
  });
});
