import { describe, expect, it } from "@jest/globals";
import { indexAt, laneAt, type LaneRect } from "../../../src/views/web/ui/drag";
import { NO_FILTER, filterOptions, isFiltering, matchesFilters } from "../../../src/views/web/lib/filters";
import { formatAgo } from "../../../src/views/web/lib/detail";
import type { Card } from "../../../src/views/web/lib/work-items";

const card = (over: Partial<Card>): Card => ({ id: 1, type: "Issue", title: "Welcome emails", state: "To Do", tags: [], rank: 1, ...over });

describe("drag geometry", () => {
  const lanes: LaneRect[] = [
    {
      name: "To Do",
      left: 0,
      right: 100,
      top: 0,
      bottom: 400,
      cards: [
        { top: 40, bottom: 100 },
        { top: 110, bottom: 170 },
      ],
    },
    { name: "Doing", left: 110, right: 210, top: 0, bottom: 400, cards: [] },
  ];

  it("finds the lane under the pointer by its horizontal position", () => {
    expect(laneAt(lanes, 50)?.name).toBe("To Do");
    expect(laneAt(lanes, 150)?.name).toBe("Doing");
    expect(laneAt(lanes, 105)).toBeUndefined();
    expect(laneAt(lanes, 500)).toBeUndefined();
  });

  it("puts the placeholder before the first card whose middle is below the pointer", () => {
    expect(indexAt(lanes[0], 10)).toBe(0);
    expect(indexAt(lanes[0], 90)).toBe(1);
    expect(indexAt(lanes[0], 300)).toBe(2);
    expect(indexAt(lanes[1], 50)).toBe(0);
  });
});

describe("board filters", () => {
  const cards = [
    card({ id: 1, title: "Welcome emails", assignee: { name: "Ada" }, tags: ["email"], parent: 9, iterationPath: "Dev\Sprint 1", areaPath: "Dev" }),
    card({ id: 2, title: "Import accounts", tags: ["data"], parent: 8, iterationPath: "Dev\Sprint 2", areaPath: "Dev\Core" }),
  ];

  it("matches the keyword against title, id, assignee, tags and state, every word", () => {
    expect(matchesFilters(cards[0], { ...NO_FILTER, keyword: "welcome ada" })).toBe(true);
    expect(matchesFilters(cards[0], { ...NO_FILTER, keyword: "import" })).toBe(false);
    expect(matchesFilters(cards[1], { ...NO_FILTER, keyword: "2" })).toBe(true);
    expect(matchesFilters(cards[1], { ...NO_FILTER, keyword: "data to do" })).toBe(true);
  });

  it("combines the dropdown filters", () => {
    expect(matchesFilters(cards[0], { ...NO_FILTER, assignee: "Ada", tag: "email", iteration: "Dev\Sprint 1", area: "Dev", parent: "9" })).toBe(true);
    expect(matchesFilters(cards[0], { ...NO_FILTER, parent: "8" })).toBe(false);
    expect(matchesFilters(cards[1], { ...NO_FILTER, assignee: "Ada" })).toBe(false);
    expect(isFiltering(NO_FILTER)).toBe(false);
    expect(isFiltering({ ...NO_FILTER, tag: "x" })).toBe(true);
  });

  it("offers the values present on the board, parents by title", () => {
    const options = filterOptions(
      cards,
      new Map([
        [9, "Onboarding"],
        [8, "Reports"],
      ])
    );
    expect(options.assignee).toEqual(["Ada"]);
    expect(options.tag).toEqual(["data", "email"]);
    expect(options.parent).toEqual([
      { value: "9", label: "9 Onboarding" },
      { value: "8", label: "8 Reports" },
    ]);
  });
});

describe("relative times", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("formats minutes, hours and days", () => {
    expect(formatAgo("2026-11-05T11:59:40Z", now)).toBe("just now");
    expect(formatAgo("2026-11-05T11:36:00Z", now)).toBe("24m ago");
    expect(formatAgo("2026-11-05T09:00:00Z", now)).toBe("3h ago");
    expect(formatAgo("2026-11-01T12:00:00Z", now)).toBe("4d ago");
    expect(formatAgo(undefined, now)).toBe("");
  });
});
