/**
 * Windowing for the page tree: with thousands of pages open, only the rows near the
 * part of the tree that is on screen are drawn.
 *
 * Every row is the same height, so this is arithmetic rather than a library: a row's
 * place is its number times the height of a row and the gap under it. The tree lives in
 * two kinds of scrolling box (the sidebar, which scrolls by itself, and the notes home
 * on a phone, where the whole window scrolls), and both are handled here.
 */
import { type RefObject, useCallback, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

/** Windowing starts above this many rows. Below it the tree draws every row, as it always has. */
export const WINDOW_FROM = 200;
/** Rows are drawn in steps of this many, so that scrolling by one row redraws nothing. */
const STEP = 8;
/** Rows kept ready above and below what is on screen, at the least. */
const MIN_OVERSCAN = 12;
/** Space a row is given from the edge of the scrolling box when it is brought into view. */
const MARGIN_ROWS = 2;
/** The bars over the top and bottom of the window on a phone, which a row must not end up under. */
const WINDOW_INSET = { top: 56, bottom: 72 };

export interface WindowRange {
  /** First row drawn. */
  start: number;
  /** One past the last row drawn. */
  end: number;
}

/**
 * The rows to draw. `top` and `bottom` are the edges of the visible part of the
 * scrolling box, measured from the top of the tree (so `top` is negative until the tree
 * reaches the top of the box).
 */
export function windowRange(count: number, stride: number, top: number, bottom: number, overscan: number): WindowRange {
  if (count <= 0 || stride <= 0) return { start: 0, end: 0 };
  const first = Math.floor(top / stride) - overscan;
  const last = Math.ceil(bottom / stride) + overscan;
  const start = Math.min(count, Math.max(0, Math.floor(first / STEP) * STEP));
  const end = Math.min(count, Math.max(start, Math.ceil(last / STEP) * STEP));
  return { start, end };
}

export type Scroller = HTMLElement | Window;

/** The box that scrolls the tree: the nearest ancestor that scrolls up and down, or the window. */
export function scrollParent(element: HTMLElement): Scroller {
  for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return window;
}

/** The visible part of a scrolling box, in the window's coordinates. */
export function viewOf(scroller: Scroller): { top: number; bottom: number; isWindow: boolean } {
  if (scroller instanceof HTMLElement) {
    const rect = scroller.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, isWindow: false };
  }
  return { top: 0, bottom: window.innerHeight, isWindow: true };
}

export function scrollByY(scroller: Scroller, delta: number): void {
  if (delta === 0) return;
  if (scroller instanceof HTMLElement) scroller.scrollTop += delta;
  else window.scrollBy({ top: delta, behavior: "instant" });
}

/** Near the top or bottom edge of the scrolling box, a drag scrolls it. This is how close. */
const EDGE = 72;
/** Fastest scroll while dragging at the very edge, in pixels a frame. */
const EDGE_SPEED = 16;

/**
 * How far to scroll this frame while something is dragged at height `y`: nothing in the
 * middle, faster the nearer the edge, negative for up.
 */
export function edgeSpeed(y: number, view: { top: number; bottom: number; isWindow: boolean }): number {
  const inset = view.isWindow && narrow() ? WINDOW_INSET : { top: 0, bottom: 0 };
  const top = view.top + inset.top;
  const bottom = view.bottom - inset.bottom;
  const zone = Math.min(EDGE, (bottom - top) / 4);
  if (zone <= 0) return 0;
  const into = y < top + zone ? (top + zone - y) / zone : y > bottom - zone ? (y - (bottom - zone)) / zone : 0;
  if (into === 0) return 0;
  const speed = Math.max(2, Math.round(Math.min(1, into) * EDGE_SPEED));
  return y < top + zone ? -speed : speed;
}

/**
 * Whether scrolling that way would bring more of the tree into view. A drag near the
 * bottom of the screen must not scroll the page on past the end of the tree: the rows
 * would slide out from under the finger, towards whatever the screen shows below them.
 */
export function treeContinues(
  tree: { top: number; bottom: number },
  view: { top: number; bottom: number; isWindow: boolean },
  direction: number,
): boolean {
  const inset = view.isWindow && narrow() ? WINDOW_INSET : { top: 0, bottom: 0 };
  if (direction > 0) return tree.bottom > view.bottom - inset.bottom + 1;
  if (direction < 0) return tree.top < view.top + inset.top - 1;
  return false;
}

const narrow = () => typeof window !== "undefined" && window.matchMedia("(max-width: 47.99rem)").matches;
/** Row height plus the one-pixel gap, before the first row can be measured. */
const guessStride = () => (narrow() ? 45 : 31);

export interface TreeWindow {
  /** Whether rows are being left out. False for a small tree. */
  windowed: boolean;
  range: WindowRange;
  /** Height of a row plus the gap under it, in pixels. */
  stride: number;
  scroller(): Scroller;
  /** Scrolls just enough for a row to be on screen with room around it. `centre` puts a row that is off screen in the middle, and leaves one that is on screen alone. */
  reveal(at: number, how?: "nearest" | "centre"): void;
}

export function useTreeWindow(treeRef: RefObject<HTMLElement | null>, count: number): TreeWindow {
  const windowed = count > WINDOW_FROM;
  const [stride, setStride] = useState(guessStride);
  const [range, setRange] = useState<WindowRange>(() => ({ start: 0, end: Math.min(count, 64) }));
  const scrollerRef = useRef<Scroller | null>(null);

  const scroller = useCallback((): Scroller => {
    if (!scrollerRef.current) scrollerRef.current = treeRef.current ? scrollParent(treeRef.current) : window;
    return scrollerRef.current;
  }, [treeRef]);

  /** The real height of a row and its gap: it differs between phone and desktop layouts. */
  const readStride = useCallback(() => {
    const height = treeRef.current?.querySelector<HTMLElement>('[role="treeitem"]')?.offsetHeight ?? 0;
    return height > 0 ? height + 1 : stride;
  }, [treeRef, stride]);

  const measure = useCallback(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const measured = readStride();
    if (measured !== stride) setStride(measured);
    if (!windowed) return;
    const view = viewOf(scroller());
    const top = tree.getBoundingClientRect().top;
    const overscan = Math.max(MIN_OVERSCAN, Math.ceil((view.bottom - view.top) / measured / 2));
    const next = windowRange(count, measured, view.top - top, view.bottom - top, overscan);
    setRange((current) => (current.start === next.start && current.end === next.end ? current : next));
  }, [treeRef, scroller, count, stride, windowed, readStride]);

  // After every render: the tree may have moved (a branch above opened, the favourites grew).
  useLayoutEffect(measure);

  useLayoutEffect(() => {
    const target = scroller();
    const observed = target instanceof HTMLElement ? target : document.documentElement;
    const observer = new ResizeObserver(measure);
    observer.observe(observed);
    window.addEventListener("resize", measure);
    // Drawn before the browser paints the scrolled frame, so no gap of empty rows shows.
    const onScroll = () => flushSync(measure);
    if (windowed) target.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
      target.removeEventListener("scroll", onScroll);
    };
  }, [scroller, measure, windowed]);

  const reveal = useCallback(
    (at: number, how: "nearest" | "centre" = "nearest") => {
      const tree = treeRef.current;
      if (!tree || at < 0) return;
      const target = scroller();
      const view = viewOf(target);
      const inset = view.isWindow && narrow() ? WINDOW_INSET : { top: 0, bottom: 0 };
      const edge = { top: view.top + inset.top, bottom: view.bottom - inset.bottom };
      const box = tree.getBoundingClientRect();
      // A tree that is not laid out (the sidebar on a phone) has nowhere to scroll to.
      if (edge.bottom <= edge.top || (box.width === 0 && box.height === 0)) return;
      const rowStride = readStride();
      const top = box.top + at * rowStride;
      const bottom = top + rowStride;
      const margin = Math.min(rowStride * MARGIN_ROWS, (edge.bottom - edge.top) / 4);
      let delta = 0;
      if (how === "centre") {
        // A row that can be seen is left where it is: this is for a page opened from somewhere else.
        if (top >= edge.top && bottom <= edge.bottom) return;
        delta = (top + bottom) / 2 - (edge.top + edge.bottom) / 2;
      } else if (top < edge.top + margin) delta = top - (edge.top + margin);
      else if (bottom > edge.bottom - margin) delta = bottom - (edge.bottom - margin);
      if (delta === 0) return;
      scrollByY(target, delta);
      // Draw the rows there now, not a frame later when the scroll event arrives.
      measure();
    },
    [treeRef, scroller, readStride, measure],
  );

  return { windowed, range: windowed ? range : { start: 0, end: count }, stride, scroller, reveal };
}
