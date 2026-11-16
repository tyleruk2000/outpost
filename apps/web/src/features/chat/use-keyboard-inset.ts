/**
 * How much of the window an on-screen keyboard is covering.
 *
 * A phone's keyboard does not make the page shorter: it slides over the bottom of it,
 * and a message box at the foot of the screen ends up underneath. The browser does say
 * how much of the page can still be seen (`window.visualViewport`), so the difference
 * is the keyboard, and the conversation is made that much shorter to sit on top of it.
 *
 * This has been checked with a stand-in for the browser's report (see the test), not
 * on a telephone: no real keyboard was available where it was written.
 */
import { useEffect, useState } from "react";

/** Anything smaller is a toolbar sliding away, not a keyboard. */
const SMALLEST_KEYBOARD = 120;

export function keyboardInset(windowHeight: number, viewport: { height: number; scale: number } | null | undefined): number {
  // Zoomed in with two fingers, the visible part is smaller for a reason that is not a keyboard.
  if (!viewport || Math.abs(viewport.scale - 1) > 0.01) return 0;
  const covered = Math.round(windowHeight - viewport.height);
  return covered >= SMALLEST_KEYBOARD ? covered : 0;
}

export function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    let last = 0;
    const measure = () => {
      const next = keyboardInset(window.innerHeight, viewport);
      // The browser slides the page up to show the box; with the screen now the right height, put it back.
      if (next > 0 && last === 0) window.scrollTo(0, 0);
      last = next;
      setInset(next);
    };
    measure();
    viewport.addEventListener("resize", measure);
    return () => viewport.removeEventListener("resize", measure);
  }, []);
  return inset;
}
