import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
// @ts-expect-error the parity table is a plain ES module shared with the measure script
import { JUSTIFIED, MATRIX, SPEC } from '../bin/parity-spec.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

describe('parity matrix', () => {
  it('has every spec item in exactly one row, and every justification names a real item', () => {
    const owners = new Map<string, string[]>();
    for (const row of MATRIX as Array<{ id: string; keys?: string[] }>) {
      for (const key of row.keys ?? []) owners.set(key, [...(owners.get(key) ?? []), row.id]);
    }
    for (const key of Object.keys(SPEC)) {
      expect(owners.get(key), `${key} must be in exactly one matrix row`).toHaveLength(1);
    }
    for (const key of owners.keys()) expect(SPEC[key], `${key} is not a spec item`).toBeTruthy();
    for (const key of Object.keys(JUSTIFIED)) {
      const [item, prop] = key.split('.');
      expect(SPEC[item]?.[prop], `${key} justifies an item that is not in the spec`).toBeDefined();
    }
  });

  it('asks for a capture, in words, wherever a state has none', () => {
    for (const row of MATRIX as Array<{ id: string; capture: string | null; need?: string }>) {
      if (!row.capture) expect((row.need ?? '').length, row.id).toBeGreaterThan(40);
    }
  });

  it('is committed: docs/parity-matrix.md names every row and every spec item', () => {
    const doc = readFileSync(path.join(root, 'docs', 'parity-matrix.md'), 'utf8');
    for (const row of MATRIX as Array<{ id: string }>)
      expect(doc, row.id).toContain(`\`${row.id}\``);
    for (const key of Object.keys(SPEC)) expect(doc, key).toContain(`| ${key} |`);
    expect(doc).not.toContain('| DIFF |');
  });

  it('measures every row in Chrome and fails on any unjustified difference', () => {
    const run = spawnSync(process.execPath, ['bin/measure-views.mjs', '--assert'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 280_000,
      env: { ...process.env, MEASURE_PREVIEW_PORT: '6393', MEASURE_DEBUG_PORT: '9443' },
    });
    if (run.status === 3) {
      console.warn('parity assertion skipped: no Chrome found');
      return;
    }
    expect(run.stdout, run.stderr).toContain('Parity: every row matches its spec or is justified');
    expect(run.status).toBe(0);
  }, 290_000);

  // In this file so the two Chrome runs happen one after the other: run side by side they starve the
  // rest of the suite of CPU and make unrelated tests time out.
  it('has no horizontal page overflow in any view at 360px', () => {
    const run = spawnSync(
      process.execPath,
      ['bin/measure-views.mjs', '--responsive', '--widths', '360', '--themes', 'light'],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 280_000,
        env: { ...process.env, MEASURE_PREVIEW_PORT: '6392', MEASURE_DEBUG_PORT: '9442' },
      }
    );
    if (run.status === 3) {
      console.warn('responsive overflow check skipped: no Chrome found');
      return;
    }
    expect(run.stdout, run.stderr).toContain('No horizontal overflow at 360px');
    expect(run.status).toBe(0);
  }, 290_000);

  it('keeps one stable frame height while navigating list, detail and back', () => {
    const run = spawnSync(process.execPath, ['bin/measure-views.mjs', '--frame'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 200_000,
      env: { ...process.env, MEASURE_PREVIEW_PORT: '6395', MEASURE_DEBUG_PORT: '9445' },
    });
    if (run.status === 3) {
      console.warn('frame check skipped: no Chrome found');
      return;
    }
    expect(run.stdout, run.stderr).toContain('Frame: no view reports a smaller size');
    expect(run.status).toBe(0);
  }, 210_000);

  it('has readable text (WCAG AA) and no surface darker than #141414 in light and dark', () => {
    const run = spawnSync(process.execPath, ['bin/measure-views.mjs', '--contrast'], {
      cwd: root,
      encoding: 'utf8',
      timeout: 400_000,
      env: { ...process.env, MEASURE_PREVIEW_PORT: '6394', MEASURE_DEBUG_PORT: '9444' },
    });
    if (run.status === 3) {
      console.warn('contrast check skipped: no Chrome found');
      return;
    }
    expect(run.stdout, run.stderr).toContain('Contrast: every visible text meets WCAG AA');
    expect(run.status).toBe(0);
  }, 410_000);
});
