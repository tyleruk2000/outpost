import { useEffect, useState } from "react";

/**
 * `value` once it has stopped changing for `delay` milliseconds: what is typed in a search
 * box, asked for once the person pauses rather than at every key. It starts as the first
 * value given, so a box opened with words already in it asks at once.
 */
export function useDebounced<T>(value: T, delay: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return settled;
}
