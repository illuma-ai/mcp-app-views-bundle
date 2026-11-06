/**
 * Pointer-based drag of a board card. HTML5 drag and drop is unreliable inside the host's sandboxed
 * frame, so the drag is built on pointer events: press on a card, move past a small threshold, drop
 * on a column. The hook owns the gesture; the board draws the ghost and the drop placeholder from the
 * returned state and decides what a drop means (a state change that the host must approve).
 */
import type { PointerEvent as ReactPointerEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";

/** Pixels the pointer must travel before a press becomes a drag (below that it is a click). */
export const DRAG_THRESHOLD = 4;

export interface LaneRect {
  name: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  /** Vertical extents of the cards in the lane, without the dragged one, in display order. */
  cards: { top: number; bottom: number }[];
}

/** The lane under a horizontal position (the pointer may be anywhere vertically, so a drop above or below a lane still counts). */
export function laneAt(lanes: LaneRect[], x: number): LaneRect | undefined {
  return lanes.find((l) => x >= l.left && x <= l.right);
}

/** Where in a lane the placeholder goes: before the first card whose middle is below the pointer. */
export function indexAt(lane: LaneRect, y: number): number {
  const i = lane.cards.findIndex((c) => y < (c.top + c.bottom) / 2);
  return i === -1 ? lane.cards.length : i;
}

export interface DragState {
  id: number;
  /** Pointer position (viewport coordinates). */
  x: number;
  y: number;
  /** Where inside the card the pointer grabbed it, and the card's size (for the ghost). */
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  /** Lane under the pointer and the placeholder index in it. */
  lane: string | null;
  index: number;
}

interface Pending {
  id: number;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export function useCardDrag(options: {
  enabled: boolean;
  /** Measures the lanes at the moment of the call (the layout may have changed since the press). */
  measure: (draggedId: number) => LaneRect[];
  /** Called on drop over a lane. Starting a state change is the caller's decision. */
  onDrop: (id: number, lane: string) => void;
}): { drag: DragState | null; begin: (e: ReactPointerEvent<HTMLElement>, id: number) => void; justDragged: () => boolean } {
  const [drag, setDrag] = useState<DragState | null>(null);
  const pending = useRef<Pending | null>(null);
  const active = useRef(false);
  const dropped = useRef(0);
  const opts = useRef(options);
  opts.current = options;
  const cleanup = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanup.current?.(), []);

  const begin = useCallback((e: ReactPointerEvent<HTMLElement>, id: number) => {
    if (!opts.current.enabled || e.button !== 0 || (e.target as HTMLElement).closest("[data-nodrag]")) return;
    const rect = e.currentTarget.getBoundingClientRect();
    pending.current = { id, startX: e.clientX, startY: e.clientY, offsetX: e.clientX - rect.left, offsetY: e.clientY - rect.top, width: rect.width, height: rect.height };
    active.current = false;

    const place = (ev: PointerEvent, p: Pending): DragState => {
      const lanes = opts.current.measure(p.id);
      const lane = laneAt(lanes, ev.clientX);
      return {
        id: p.id,
        x: ev.clientX,
        y: ev.clientY,
        offsetX: p.offsetX,
        offsetY: p.offsetY,
        width: p.width,
        height: p.height,
        lane: lane?.name ?? null,
        index: lane ? indexAt(lane, ev.clientY) : 0,
      };
    };
    const move = (ev: PointerEvent): void => {
      const p = pending.current;
      if (!p) return;
      if (!active.current) {
        if (Math.hypot(ev.clientX - p.startX, ev.clientY - p.startY) < DRAG_THRESHOLD) return;
        active.current = true;
      }
      ev.preventDefault();
      setDrag(place(ev, p));
    };
    const stop = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
      cleanup.current = null;
      pending.current = null;
      active.current = false;
      setDrag(null);
    };
    const up = (ev: PointerEvent): void => {
      const p = pending.current;
      if (p && active.current) {
        const lane = laneAt(opts.current.measure(p.id), ev.clientX);
        dropped.current = Date.now();
        if (lane) opts.current.onDrop(p.id, lane.name);
      }
      stop();
    };
    const cancel = (): void => stop();
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === "Escape") stop();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
    // Safety: a pointer released outside the frame (a host dialog, another window) never reaches it.
    window.addEventListener("blur", cancel);
    cleanup.current = stop;
  }, []);

  /** True for a moment after a drop, so the click that ends the gesture does not also open the card. */
  const justDragged = useCallback(() => Date.now() - dropped.current < 250, []);

  return { drag, begin, justDragged };
}
