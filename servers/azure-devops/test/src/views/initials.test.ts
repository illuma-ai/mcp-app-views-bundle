import { describe, expect, it } from "@jest/globals";
import { initialsOf } from "../../../src/views/web/ui/parts";

describe("avatar initials", () => {
  it("shows two initials, as the web UI does", () => {
    expect(initialsOf("Kavya H")).toBe("KH");
    expect(initialsOf("Kanwarjeet Singh Hora")).toBe("KH");
    expect(initialsOf("marcus webb <marcus@gaavi.test>")).toBe("MW");
  });
  it("gives one letter for one word and a placeholder for nothing", () => {
    expect(initialsOf("Priya")).toBe("P");
    expect(initialsOf("  ")).toBe("?");
  });
});
