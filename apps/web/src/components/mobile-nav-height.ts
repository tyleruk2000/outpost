import { type RefObject, useLayoutEffect } from "react";

/**
 * How tall a phone's bottom bar is, said to the page as --mobile-nav-height: its names grow with the text, so a
 * screen that ends on it (the map, whose sheet sits on it; the reader) is not left to guess. 9.5 px went under the
 * bar at 125% text. Used by the app's bar and by the bar of the pages kept for when the server is out of reach.
 */
export function useMobileNavHeight(bar: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const element = bar.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const root = document.documentElement;
    const observer = new ResizeObserver(() => {
      const height = element.getBoundingClientRect().height;
      if (height > 0) root.style.setProperty("--mobile-nav-height", `${height}px`);
      else root.style.removeProperty("--mobile-nav-height");
    });
    // The border box: the inset for a home indicator is padding, which the content box does not see.
    observer.observe(element, { box: "border-box" });
    return () => {
      observer.disconnect();
      root.style.removeProperty("--mobile-nav-height");
    };
  }, [bar]);
}
