import { describe, expect, it } from "@jest/globals";
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

const chrome = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find((p) => p && existsSync(p));

// Renders every row of bin/parity-spec.mjs in the preview with a real Chrome and compares it with the
// capture's value (docs/parity-matrix.md). Fails on a difference that is neither within the tolerance nor
// justified in the spec. Skipped where no Chrome is installed.
(chrome ? describe : describe.skip)("parity with the web UI captures", () => {
  it("has no unjustified difference", () => {
    const run = spawnSync(process.execPath, [join(__dirname, "..", "..", "..", "bin", "measure-views.mjs"), "--parity"], {
      encoding: "utf8",
      timeout: 600_000,
      killSignal: "SIGKILL",
      env: { ...process.env, CHROME_PATH: chrome, MEASURE_PORT: "6393" },
    });
    const out = `${run.stdout}${run.stderr}`;
    expect(out.split("\n").filter((l) => l.startsWith("FAIL"))).toEqual([]);
    expect(out).toContain("0 unjustified differences");
    expect(run.status).toBe(0);
  }, 660_000);
});
