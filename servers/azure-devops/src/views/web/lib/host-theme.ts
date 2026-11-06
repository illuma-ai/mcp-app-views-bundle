/**
 * Host theme plumbing. The views are drawn with the Fluent theme (light, dark or high contrast);
 * only the outer frame takes colours from the host's style variables, so the view blends into the
 * surrounding chat. Variables arrive as bare "R G B" triplets from the chat host and as colour
 * strings from others; both are accepted.
 */
import type { CSSProperties } from "react";

const TRIPLET = /^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/;

/**
 * Normalises a colour to "R G B". Accepts a triplet, #rgb / #rrggbb and rgb()/rgba() with comma or
 * space separators; anything else returns undefined and the Fluent default stays.
 */
export function toTriplet(value: string): string | undefined {
  const v = value.trim();
  if (TRIPLET.test(v)) return v.replace(/\s+/g, " ");
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex) {
    const s = hex[1].length === 3 ? [...hex[1]].map((c) => c + c).join("") : hex[1];
    return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)).join(" ");
  }
  const rgb = /^rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})/i.exec(v);
  return rgb ? `${rgb[1]} ${rgb[2]} ${rgb[3]}` : undefined;
}

/** Which Fluent theme to use. Forced colours (high contrast) win over the host's light/dark. */
export function themeKind(hostTheme: string | undefined, forcedColors: boolean): "light" | "dark" | "highContrast" {
  if (forcedColors) return "highContrast";
  return hostTheme === "dark" ? "dark" : "light";
}

/** Border and background of the outer frame from the host's variables (undefined parts are omitted). */
export function frameStyle(vars: Record<string, unknown> | undefined): CSSProperties {
  const color = (name: string): string | undefined => {
    const raw = vars?.[name];
    const t = typeof raw === "string" ? toTriplet(raw) : undefined;
    return t ? `rgb(${t})` : undefined;
  };
  return {
    backgroundColor: color("--color-background-secondary"),
    borderColor: color("--color-border-secondary"),
  };
}

/**
 * Surface roles that sit one layer apart from their page. The Fluent light and dark palettes run in
 * opposite directions (Background3 is the lightest-darker layer in light, near black in dark), so the
 * same token cannot play the same role in both: an inset surface (info boxes, board lanes, tag chips) is
 * Background3 on a light page and Background2 on a dark one; the board page itself is Background2 in
 * light and Background1 in dark. No role is darker than #1f1f1f in the dark theme.
 */
export const SURFACE = {
  inset: "var(--kInset, var(--colorNeutralBackground3))",
  board: "var(--kBoard, var(--colorNeutralBackground2))",
} as const;

/** The CSS variables for the surface roles in a theme (set on the Fluent provider). */
export function surfaceVars(kind: "light" | "dark" | "highContrast"): Record<string, string> {
  return kind === "dark"
    ? { "--kInset": "var(--colorNeutralBackground2)", "--kBoard": "var(--colorNeutralBackground1)" }
    : { "--kInset": "var(--colorNeutralBackground3)", "--kBoard": "var(--colorNeutralBackground2)" };
}
