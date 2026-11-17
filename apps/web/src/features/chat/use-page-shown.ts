/**
 * Whether the page can be seen: false in a background tab or on a locked phone. Work
 * that only draws what is on screen (a reply growing, a count of seconds) waits while it
 * is false and catches up when the page is shown again.
 */
import { useEffect, useState } from "react";

const shownNow = () => typeof document === "undefined" || document.visibilityState !== "hidden";

export function usePageShown(): boolean {
  const [shown, setShown] = useState(shownNow);
  useEffect(() => {
    const onChange = () => setShown(shownNow());
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return shown;
}
