/** Small pieces shared by the views: the mail API context, icon buttons, async actions. */
import {
  Button,
  Menu,
  MenuItem,
  MenuList,
  MenuPopover,
  MenuTrigger,
  SplitButton,
  Tooltip,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import type { MenuButtonProps } from '@fluentui/react-components';
import type { ReactElement, RefObject } from 'react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import type { MailApi } from '../mail/api.js';

export const ApiContext = createContext<MailApi | null>(null);

/** Width below which the calendar becomes an agenda and the file list drops columns. */
export const NARROW_PX = 560;

/**
 * Keeps a command bar on one line. Attach `ref` to the bar (overflow hidden, no wrapping) and render
 * only the first `visible` of its `count` items, the rest under a "..." button that is shown when
 * `visible < count`. The bar is measured, not estimated: after every layout, if its content is wider
 * than the bar itself (the "..." button included), one more item moves into the menu; when the bar's
 * width or the item count changes, every item is tried again. Runs before paint, so nothing is seen
 * clipped.
 */
export function useOverflowFit<T extends HTMLElement>(
  count: number
): { ref: RefObject<T | null>; visible: number } {
  const ref = useRef<T | null>(null);
  const [visible, setVisible] = useState(count);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (): void => setWidth(el.clientWidth);
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(el);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);
  // A new width or item count: start again from everything shown.
  useLayoutEffect(() => setVisible(count), [width, count]);
  // Too wide: move the last visible item into the menu, and look again.
  useLayoutEffect(() => {
    const el = ref.current;
    if (el && visible > 0 && el.scrollWidth > el.clientWidth + 1) setVisible(visible - 1);
  });
  return { ref, visible: Math.min(visible, count) };
}

/** True while the frame is narrower than `px` (follows the frame as the host resizes it). */
export function useNarrower(px: number): boolean {
  const query = `(max-width: ${px - 0.02}px)`;
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && Boolean(window.matchMedia?.(query).matches)
  );
  useEffect(() => {
    const list = window.matchMedia?.(query);
    if (!list) return;
    const update = (): void => setNarrow(list.matches);
    update();
    list.addEventListener?.('change', update);
    return () => list.removeEventListener?.('change', update);
  }, [query]);
  return narrow;
}

/** The mail API of the current view. */
export function useApi(): MailApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error('MailApi is not provided');
  return api;
}

export interface IconButtonProps {
  label: string;
  icon: ReactElement;
  onClick?: () => void;
  disabled?: boolean;
  size?: 'small' | 'medium';
  appearance?: 'subtle' | 'transparent' | 'outline';
  pressed?: boolean;
}

/** An icon-only button with a tooltip; the label is also its accessible name. */
export function IconButton({
  label,
  icon,
  onClick,
  disabled,
  size = 'medium',
  appearance = 'subtle',
  pressed,
}: IconButtonProps): ReactElement {
  return (
    <Tooltip content={label} relationship="label" withArrow>
      <Button
        appearance={appearance}
        size={size}
        icon={icon}
        disabled={disabled}
        aria-pressed={pressed}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      />
    </Tooltip>
  );
}

/**
 * Runs one async action at a time. `busy` is true while it runs; a failure is returned as text in
 * `error` (and cleared by the next run) so views can show it in context.
 */
export function useAction(): {
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

const useSplitStyles = makeStyles({ regular: { fontWeight: tokens.fontWeightRegular } });

export interface ActionItem {
  label: string;
  icon?: ReactElement;
  disabled?: boolean;
  onClick: () => void;
}

/** A primary action with a drop-down of related actions (New mail, Send). */
export function SplitAction(props: {
  label: string;
  icon: ReactElement;
  onClick: () => void;
  disabled?: boolean;
  items: ActionItem[];
  menuLabel: string;
}): ReactElement {
  const s = useSplitStyles();
  return (
    <Menu positioning="below-end">
      <MenuTrigger disableButtonEnhancement>
        {(triggerProps: MenuButtonProps) => (
          <SplitButton
            appearance="primary"
            icon={props.icon}
            disabled={props.disabled}
            menuButton={{ ...triggerProps, 'aria-label': props.menuLabel }}
            primaryActionButton={{ onClick: props.onClick, className: s.regular }}
          >
            {props.label}
          </SplitButton>
        )}
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {props.items.map((item) => (
            <MenuItem
              key={item.label}
              icon={item.icon}
              disabled={item.disabled}
              onClick={item.onClick}
            >
              {item.label}
            </MenuItem>
          ))}
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
