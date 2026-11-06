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

// Renders every view in the preview with a real Chrome at 360, 640 and 900px and fails if any view is
// wider than its frame (a horizontal page scroll). Skipped where no Chrome is installed.
(chrome ? describe : describe.skip)("view layout", () => {
  it("has no horizontal overflow at 360, 640 and 900px", () => {
    const run = spawnSync(process.execPath, [join(__dirname, "..", "..", "..", "bin", "measure-views.mjs"), "--overflow-only"], {
      encoding: "utf8",
      timeout: 600_000,
      killSignal: "SIGKILL",
      env: { ...process.env, CHROME_PATH: chrome },
    });
    expect(`${run.stdout}${run.stderr}`).toContain("No horizontal overflow at 360, 640, 900px");
    expect(run.status).toBe(0);
  }, 660_000);
});
