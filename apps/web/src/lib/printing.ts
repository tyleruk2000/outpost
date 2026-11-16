/**
 * Asking the browser to print, and saying so when it will not.
 *
 * `window.print()` is not the same thing everywhere. A desktop browser opens its print
 * dialogue and waits. Safari on an iPhone opens a sheet and lets the page carry on. A
 * page shown inside another app's web view on iOS does nothing at all unless that app
 * has arranged for printing (WebKit calls the app and, if the app has no answer,
 * returns in silence), and a site opened from the Home Screen as an app of its own has
 * a history of the same. None of them reports failure. docs/encryption.md ("Printing from a phone") has the
 * sources.
 *
 * So a Print button here does three things: it is left out where the browser has no
 * `window.print`; it stands second, behind another way, where the app was opened from
 * the Home Screen; and after a press it watches for the one sign a page gets that
 * printing began. If that sign does not come, the screen says what to do instead.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PrintSupport {
  /** The browser has `window.print` to call. That it does anything is not known until it is tried. */
  canPrint: boolean;
  /** Opened from the Home Screen as an app of its own, without the browser's toolbar and its Share menu. */
  standalone: boolean;
}

export function printSupport(): PrintSupport {
  const standalone =
    // Safari's own flag, older than the media query and still the plain answer on an iPhone.
    (navigator as { standalone?: boolean }).standalone === true ||
    (typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches === true);
  return { canPrint: typeof window.print === "function", standalone };
}

/**
 * How long after a press to wait for a sign of printing before saying that none came.
 * Where a dialogue opens, the sign comes before it or with it.
 */
export const PRINT_WAIT_MS = 1500;

export interface Printing extends PrintSupport {
  /** Asks the browser to print the page. */
  print: () => void;
  /** A press of Print was followed by no sign that printing began. */
  unanswered: boolean;
  /** Which way to put first: the browser's print, or whatever else the screen offers. */
  lead: "print" | "other";
}

export function usePrinting(): Printing {
  const [support] = useState(printSupport);
  const [unanswered, setUnanswered] = useState(false);
  const watch = useRef<{ stop: () => void } | null>(null);
  useEffect(() => () => watch.current?.stop(), []);

  const print = useCallback(() => {
    watch.current?.stop();
    setUnanswered(false);
    let began = false;
    const mark = () => {
      began = true;
    };
    // The two signs a page gets: the event before printing, and the page being laid out for paper.
    const media = typeof window.matchMedia === "function" ? window.matchMedia("print") : null;
    window.addEventListener("beforeprint", mark);
    media?.addEventListener?.("change", mark);
    const timer = window.setTimeout(() => {
      stop();
      if (!began) setUnanswered(true);
    }, PRINT_WAIT_MS);
    const stop = () => {
      window.clearTimeout(timer);
      window.removeEventListener("beforeprint", mark);
      media?.removeEventListener?.("change", mark);
      watch.current = null;
    };
    watch.current = { stop };
    try {
      window.print();
    } catch {
      // A browser that throws has not printed; the wait above says so.
    }
  }, []);

  return { ...support, print, unanswered, lead: support.canPrint && !support.standalone ? "print" : "other" };
}
