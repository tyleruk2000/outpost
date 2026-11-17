import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/**
 * The width of an element in whole pixels, kept up to date as it resizes. Charts are drawn
 * in real pixels so that text and thin lines are never stretched; this is how they learn
 * their size. It is measured before the first paint, so a chart never spills off a phone
 * for a frame. `fallback` is the width until then (and in tests, where nothing has a
 * size); a width of nothing, as when the element is hidden, keeps the last one.
 */
export function useWidth<T extends HTMLElement = HTMLDivElement>(fallback = 0): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const next = Math.round(element.getBoundingClientRect().width);
      if (next > 0) setWidth(next);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
