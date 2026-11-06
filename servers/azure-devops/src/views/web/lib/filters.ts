/** The board's filter bar: keyword, assignee, tags, iteration, area and parent. Pure. */
import type { Card } from "./work-items";

export interface FilterState {
  keyword: string;
  assignee: string;
  tag: string;
  iteration: string;
  area: string;
  parent: string;
}

export const NO_FILTER: FilterState = { keyword: "", assignee: "", tag: "", iteration: "", area: "", parent: "" };

export function isFiltering(f: FilterState): boolean {
  return Object.values(f).some((v) => v !== "");
}

/** The distinct values the dropdowns offer, from the cards on the board (parents by id, shown by title). */
export function filterOptions(cards: Card[], parentTitles: ReadonlyMap<number, string>): Record<"assignee" | "tag" | "iteration" | "area", string[]> & { parent: { value: string; label: string }[] } {
  const uniq = (list: (string | undefined)[]): string[] => [...new Set(list.filter((v): v is string => Boolean(v)))].sort((a, b) => a.localeCompare(b));
  return {
    assignee: uniq(cards.map((c) => c.assignee?.name)),
    tag: uniq(cards.flatMap((c) => c.tags)),
    iteration: uniq(cards.map((c) => c.iterationPath)),
    area: uniq(cards.map((c) => c.areaPath)),
    parent: [...new Set(cards.map((c) => c.parent).filter((p): p is number => p !== undefined))].map((id) => ({ value: String(id), label: `${id} ${parentTitles.get(id) ?? ""}`.trim() })),
  };
}

/** Whether a card passes every active filter; the keyword matches the title, id, assignee and tags. */
export function matchesFilters(card: Card, f: FilterState): boolean {
  const keyword = f.keyword.trim().toLowerCase();
  if (keyword) {
    const haystack = [card.title, String(card.id), card.assignee?.name ?? "", card.tags.join(" "), card.state].join(" ").toLowerCase();
    if (!keyword.split(/\s+/).every((word) => haystack.includes(word))) return false;
  }
  if (f.assignee && card.assignee?.name !== f.assignee) return false;
  if (f.tag && !card.tags.includes(f.tag)) return false;
  if (f.iteration && card.iterationPath !== f.iteration) return false;
  if (f.area && card.areaPath !== f.area) return false;
  if (f.parent && String(card.parent ?? "") !== f.parent) return false;
  return true;
}
