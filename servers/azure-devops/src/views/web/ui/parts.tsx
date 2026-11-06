/** Small pieces shared by the views: API context, icons, avatars, loading and empty states. */
import { Avatar, Button, MessageBar, MessageBarBody, Spinner, Tooltip, makeStyles, mergeClasses, shorthands, tokens } from "@fluentui/react-components";
import { BeakerFilled, BookFilled, BugFilled, CheckboxCheckedFilled, ClipboardFilled, CrownFilled, TrophyFilled } from "@fluentui/react-icons";
import type { ReactElement, ReactNode } from "react";
import { Component, createContext, useCallback, useContext, useRef, useState } from "react";
import type { AdoApi } from "../lib/api";
import { SURFACE } from "../lib/host-theme";
import { FALLBACK_STATE_COLORS, FALLBACK_TYPE_COLORS, type Person } from "../lib/work-items";
import { S } from "./strings";

export const ApiContext = createContext<AdoApi | null>(null);

/** The API of the current view. */
export function useApi(): AdoApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("AdoApi is not provided");
  return api;
}

/**
 * Runs one async write at a time. `busy` is true while it runs; a failure (including the user
 * rejecting the host's approval card) is returned as text in `error`. Views start a write only from
 * an explicit control's handler, never from an effect.
 */
export function useWrite(): {
  busy: boolean;
  error: string | null;
  run: (task: () => Promise<void>, failure: string) => void;
  clearError: () => void;
} {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busyRef = useRef(false);
  const run = useCallback((task: () => Promise<void>, failure: string) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    task()
      .catch((e: Error) => setError(`${failure}: ${e.message}`))
      .finally(() => {
        busyRef.current = false;
        setBusy(false);
      });
  }, []);
  return { busy, error, run, clearError: () => setError(null) };
}

const ICONS: Record<string, (p: { color: string }) => ReactElement> = {
  "Epic": ({ color }) => <CrownFilled color={color} />,
  "Feature": ({ color }) => <TrophyFilled color={color} />,
  "User Story": ({ color }) => <BookFilled color={color} />,
  "Issue": ({ color }) => <ClipboardFilled color={color} />,
  "Task": ({ color }) => <CheckboxCheckedFilled color={color} />,
  "Bug": ({ color }) => <BugFilled color={color} />,
  "Test Case": ({ color }) => <BeakerFilled color={color} />,
};

export function typeColor(type: string, colors?: Record<string, string>): string {
  return colors?.[type] ?? FALLBACK_TYPE_COLORS[type] ?? "#666666";
}

/** The coloured icon of a work item type, as Azure DevOps draws it. */
export function TypeIcon({ type, color }: { type: string; color?: string }): ReactElement {
  const c = color ?? typeColor(type);
  const Icon = ICONS[type] ?? ICONS.Task;
  return (
    <span role="img" aria-label={type} title={type} style={{ display: "inline-flex", fontSize: 16 }}>
      <Icon color={c} />
    </span>
  );
}

const useDot = makeStyles({
  row: { display: "inline-flex", alignItems: "center", gap: "6px", whiteSpace: "nowrap" },
  dot: { width: "8px", height: "8px", borderRadius: "50%", flexShrink: 0 },
});

/** State as Azure DevOps shows it in lists: a coloured dot and the state name. */
export function StateDot({ state, colors }: { state: string; colors?: Record<string, string> }): ReactElement {
  const s = useDot();
  const color = colors?.[state] ?? FALLBACK_STATE_COLORS[state] ?? "#b2b2b2";
  return (
    <span className={s.row}>
      <span className={s.dot} style={{ backgroundColor: color }} aria-hidden="true" />
      <span>{state}</span>
    </span>
  );
}

/** A person's avatar (initials) with an optional name. */
export function PersonChip({ person, showName = true, size = 20 }: { person?: Person; showName?: boolean; size?: 16 | 20 | 24 | 28 | 32 }): ReactElement | null {
  if (!person) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      <Avatar name={person.name} initials={initialsOf(person.name)} size={size} color="colorful" aria-label={person.name} style={size <= 20 ? { fontSize: 9 } : undefined} />
      {showName && <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{person.name}</span>}
    </span>
  );
}

const useTag = makeStyles({
  tag: {
    display: "inline-block",
    fontSize: tokens.fontSizeBase100,
    lineHeight: "16px",
    padding: "0 6px",
    borderRadius: "2px",
    // An inset surface: Background3 in light, Background2 in dark (Background3 is near black there).
    backgroundColor: SURFACE.inset,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    color: tokens.colorNeutralForeground2,
    whiteSpace: "nowrap",
  },
});

export function TagChips({ tags }: { tags: string[] }): ReactElement | null {
  const s = useTag();
  if (tags.length === 0) return null;
  return (
    <span style={{ display: "inline-flex", flexWrap: "wrap", gap: 4 }}>
      {tags.map((t) => (
        <span key={t} className={s.tag}>
          {t}
        </span>
      ))}
    </span>
  );
}

/** The loading state Azure DevOps shows: a centred spinner and the word "Loading...". */
export function Loading(): ReactElement {
  return (
    <div data-k-loading="" style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
      <Spinner size="small" labelPosition="after" label={S.loading} />
    </div>
  );
}

export function ErrorBar({ children }: { children: ReactNode }): ReactElement {
  return (
    <MessageBar intent="error">
      <MessageBarBody>{children}</MessageBarBody>
    </MessageBar>
  );
}

const useLink = makeStyles({
  link: {
    ...shorthands.padding(0),
    minWidth: 0,
    height: "auto",
    fontWeight: tokens.fontWeightRegular,
    textDecorationLine: "underline",
  },
});

/** A text link that opens through the host (the view itself may not navigate). */
export function LinkButton({ onClick, children, className }: { onClick?: () => void; children: ReactNode; className?: string }): ReactElement {
  const s = useLink();
  return (
    <Button appearance="transparent" className={mergeClasses(s.link, className)} onClick={onClick}>
      {children}
    </Button>
  );
}

export { Tooltip };

/** Shows a render error as a message instead of leaving the view blank (a thrown error unmounts the whole tree). */
export class RenderErrorBoundary extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null };
  static getDerivedStateFromError(e: Error): { error: string } {
    return { error: e.message };
  }
  render(): ReactNode {
    return this.state.error ? <ErrorBar>{`This view hit an error: ${this.state.error}`}</ErrorBar> : this.props.children;
  }
}

/** Two initials ("KH") from a display name: the first letters of the first and last words; one word gives one letter. */
export function initialsOf(name: string): string {
  const words = name.replace(/<.*$/, "").trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return (first + last).toUpperCase();
}
