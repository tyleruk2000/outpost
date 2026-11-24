/**
 * Where the page was scrolled to, for each place in this tab's history. A new screen starts at its top, as it
 * always has; going Back (or Forward) to a screen puts it where it was left, so a person who opened one item from
 * a long list comes back to the list at that item rather than at its top. A screen whose address names a place
 * on it ("…#backup") goes there itself.
 *
 * The screen may not be tall enough yet when it is entered (its code or its data still on the way): the position
 * is tried again each frame for a short while, and given up the moment the person scrolls themselves.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import { type Location, useLocation, useNavigationType } from "react-router";

/** How long to keep trying to reach a remembered position while the screen fills in, in milliseconds. */
const SETTLE_MS = 1000;

const remembered = new Map<string, number>();

/**
 * Whether this entry of history is one being returned to at a place further down than its top (Back or Forward to
 * a screen that was scrolled). A screen that would focus a field as it opens leaves focus alone then: focusing a
 * field far above the window moved the page back up to it (Search on an iPhone, Nov 2026).
 */
export function returnsToPlace(key: string, kind: string): boolean {
  return kind === "POP" && (remembered.get(key) ?? 0) > 0;
}

/** For tests. */
export function forgetScrollPositions(): void {
  remembered.clear();
}

function page(): Element | null {
  return typeof document === "undefined" ? null : (document.scrollingElement ?? document.documentElement);
}

export function useScrollMemory(): void {
  const location: Location = useLocation();
  const kind = useNavigationType();
  const key = useRef(location.key);

  // The browser's own restoring is for whole pages; this app is one page, and it would fight the code below.
  useEffect(() => {
    if (!("scrollRestoration" in history)) return;
    const before = history.scrollRestoration;
    history.scrollRestoration = "manual";
    return () => {
      history.scrollRestoration = before;
    };
  }, []);

  // The position is noted as the person scrolls, under the entry of history in view.
  useEffect(() => {
    let frame = 0;
    const note = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const scroller = page();
        if (scroller) remembered.set(key.current, scroller.scrollTop);
      });
    };
    window.addEventListener("scroll", note, { passive: true });
    return () => {
      window.removeEventListener("scroll", note);
      cancelAnimationFrame(frame);
    };
  }, []);

  // Positions are noted under the entry in view, whichever way it was reached (a tab chosen by ?tab= is an entry too).
  useLayoutEffect(() => {
    key.current = location.key;
  }, [location.key]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the screen changes, by design (not for ?tab= on one screen)
  useLayoutEffect(() => {
    const scroller = page();
    if (!scroller) return;
    const target = kind === "POP" ? remembered.get(location.key) : undefined;
    if (target === undefined || target <= 0) {
      if (!location.hash) scroller.scrollTop = 0;
      return;
    }
    // Back to a screen that was scrolled: there again, as soon as it is tall enough to be.
    let frame = 0;
    let stopped = false;
    const started = performance.now();
    const stop = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
    const attempt = () => {
      if (stopped) return;
      const room = scroller.scrollHeight - scroller.clientHeight;
      scroller.scrollTop = Math.min(target, room);
      if (room >= target || performance.now() - started > SETTLE_MS) stop();
      else frame = requestAnimationFrame(attempt);
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    attempt();
    return stop;
  }, [location.pathname]);
}
