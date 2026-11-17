import { useLayoutEffect, useRef, useState } from "react";

/**
 * The width a chart has to draw in, for the radio screens' hand-drawn charts: they are laid out in real pixels so
 * that type stays one size on every screen. Measured before the first paint: drawn at the fallback until the resize
 * observer answered, a new chart spilled sideways off a phone for a frame.
 */
export function useWidth(fallback = 640): [React.RefObject<HTMLDivElement | null>, number] {
  const ref = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measured = Math.round(element.getBoundingClientRect().width);
    if (measured > 0) setWidth(measured);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) setWidth(Math.round(entry.contentRect.width));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
