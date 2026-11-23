/**
 * Whether a media query matches, kept up to date. For a choice CSS cannot make alone (which navigation to draw,
 * whether a panel overlays the page); a choice of look stays in CSS (`md:`, `pointer-coarse:`).
 */
import { useSyncExternalStore } from "react";

/**
 * A tablet's width, 768 to 1023 px: the sidebar is a rail of icons, opened over the page when asked for. Under it
 * the phone's bars; above it the full sidebar beside the page. Asked as the narrow band rather than as "wide", so
 * that where there is no measure (a test's stand-in window) the app is drawn as on a desktop.
 */
export const TABLET = "(min-width: 48rem) and (max-width: 63.99rem)";

export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    (changed) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const media = window.matchMedia(query);
      media.addEventListener("change", changed);
      return () => media.removeEventListener("change", changed);
    },
    () => (typeof window === "undefined" || !window.matchMedia ? fallback : window.matchMedia(query).matches),
    () => fallback,
  );
}
