import { type RefObject, useLayoutEffect, useRef, useState } from "react";

/**
 * The width of an element, kept up to date. Charts are drawn in real pixels so that
 * text, 2px lines and rounded ends are never stretched; this is how they learn their size.
 * Zero until the element has been measured.
 */
export function useWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () =>
      setWidth((current) => {
        const next = Math.round(element.getBoundingClientRect().width);
        return next === current ? current : next;
      });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
