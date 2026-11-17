/**
 * Whether the page can be seen: false in a background tab or on a locked phone. Work that
 * only shows what is on screen (a clock, a countdown, a chart being sampled, a reply
 * growing) waits while it is false and catches up when the page is shown again.
 */
import { useSyncExternalStore } from "react";

export const isPageVisible = (): boolean => typeof document === "undefined" || document.visibilityState !== "hidden";

function onVisibilityChange(listener: () => void): () => void {
  document.addEventListener("visibilitychange", listener);
  return () => document.removeEventListener("visibilitychange", listener);
}

export function usePageVisible(): boolean {
  return useSyncExternalStore(onVisibilityChange, isPageVisible, () => true);
}
