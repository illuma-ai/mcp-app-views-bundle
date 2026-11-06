import { describe, expect, it } from "@jest/globals";
import path from "path";
/* eslint-disable @typescript-eslint/no-require-imports */
const { scan, FAIL, REPORT } = require("../../scripts/check-forbidden-names.cjs") as {
  scan: (root: string, tokens: string[]) => { file: string; line: number }[];
  FAIL: string[];
  REPORT: string[];
};

/* eslint-enable @typescript-eslint/no-require-imports */

const root = path.resolve(__dirname, "../..");

describe("brand neutrality", () => {
  it("never names the chat host product anywhere in the repo", () => {
    expect(scan(root, FAIL)).toEqual([]);
  });

  it("has no retired names or local folder names", () => {
    expect(scan(root, REPORT)).toEqual([]);
  });
});
