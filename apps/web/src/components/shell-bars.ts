/**
 * A screen's say over the phone's bars. A task that has a bar of its own at the top of the
 * screen (Directions on Maps) asks for the bar of screens at the foot to be put away while it
 * is in hand: the search bar on top means the bottom bar is there, a task's bar on top means
 * it is not. Released when the task ends or the screen goes.
 */
import { useEffect, useSyncExternalStore } from "react";

let holds = 0;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether a task has asked for the bottom bar to be put away. */
export function useBottomBarHidden(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => holds > 0,
    () => false,
  );
}

/** Puts the phone's bottom bar away while `hidden` is true. */
export function useHideBottomBar(hidden: boolean): void {
  useEffect(() => {
    if (!hidden) return;
    holds += 1;
    emit();
    return () => {
      holds -= 1;
      emit();
    };
  }, [hidden]);
}

/**
 * Screens that put a bar of their own in the top bar's place on a phone. Maps carries its
 * search, or a task's bar, at the top; the app's top bar (and its quick search) is not shown
 * there, and quick search is the first row of the More sheet instead.
 */
export const ownsTopBar = (pathname: string) => pathname === "/maps";
