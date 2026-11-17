/**
 * Time on a game, counted only while the game is going and its screen is in view: a game
 * left in a background tab or on a locked phone is not timed. Nothing ticks to count it:
 * the time is worked out from `performance.now()` when it is asked for.
 */
import { useEffect, useRef, useState } from "react";
import { isPageVisible, usePageVisible } from "@/lib/page-visible";

export interface PlayTime {
  /** Seconds played since the last lap (or since the game started), and starts the next lap. */
  lap(): number;
  /** Seconds played since the last lap, without starting another. */
  peek(): number;
}

/**
 * The clock of a game that is `running` (started and not yet over). A game adds `lap()`
 * to the seconds it keeps whenever it moves, and `peek()` to show or keep the time
 * between moves.
 */
export function usePlayTime(running: boolean): PlayTime {
  const clock = useRef({ since: null as number | null, banked: 0, running });
  clock.current.running = running;
  const [time] = useState<PlayTime>(() => {
    const peek = () => {
      const { since, banked } = clock.current;
      return banked + (since === null ? 0 : (performance.now() - since) / 1000);
    };
    return {
      peek,
      lap() {
        const seconds = peek();
        clock.current.banked = 0;
        if (clock.current.since !== null) clock.current.since = performance.now();
        return seconds;
      },
    };
  });

  useEffect(() => {
    const state = clock.current;
    const pause = () => {
      if (state.since === null) return;
      state.banked += (performance.now() - state.since) / 1000;
      state.since = null;
    };
    const resume = () => {
      if (state.since === null && state.running && isPageVisible()) state.since = performance.now();
    };
    if (running) resume();
    else pause();
    const changed = () => (isPageVisible() ? resume() : pause());
    document.addEventListener("visibilitychange", changed);
    return () => document.removeEventListener("visibilitychange", changed);
  }, [running]);

  return time;
}

/** Draws again once a second while `on` and the page is in view: for a clock on screen, and nothing else. */
export function useEverySecond(on: boolean): void {
  const visible = usePageVisible();
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!on || !visible) return;
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1000);
    return () => window.clearInterval(timer);
  }, [on, visible]);
}
