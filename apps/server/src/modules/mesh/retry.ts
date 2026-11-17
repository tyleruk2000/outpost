/**
 * Trying again while a radio that was set up is away: one timer for the next attempt,
 * the wait doubling from two seconds to five minutes, and back to two seconds once it is
 * there again. Nothing is set while nothing is set up, or while it is there.
 */
export interface Retry {
  /** Sets the timer for the next attempt; returns when it is. */
  later(attempt: () => void): number;
  /** The radio is there again: the next wait starts from the first. */
  reset(): void;
  cancel(): void;
  readonly at: number | null;
}

export function createRetry(firstMs = 2000, mostMs = 5 * 60_000): Retry {
  let wait = firstMs;
  let timer: NodeJS.Timeout | undefined;
  let at: number | null = null;
  return {
    later(attempt) {
      clearTimeout(timer);
      // A little spread, so that two links that went at once do not come back at once.
      const delay = Math.round(wait * (0.9 + Math.random() * 0.2));
      at = Date.now() + delay;
      timer = setTimeout(() => {
        timer = undefined;
        at = null;
        attempt();
      }, delay);
      timer.unref();
      wait = Math.min(mostMs, wait * 2);
      return at;
    },
    reset() {
      wait = firstMs;
    },
    cancel() {
      clearTimeout(timer);
      timer = undefined;
      at = null;
      wait = firstMs;
    },
    get at() {
      return at;
    },
  };
}
