/**
 * The queue that searches of archives wait in before they reach kiwix-serve.
 *
 * kiwix-serve works on four requests at once and makes the rest wait inside it, and a
 * search it has begun runs to its end even when whoever asked has gone away (both
 * measured against kiwix-serve 3.8.2; see docs/search-reference-collections.md). Sent all at once, the
 * searches of two dozen archives sit where they cannot be taken back: a person who
 * types three letters has three sets of them queued, and anyone reading an article
 * waits behind them all.
 *
 * So the waiting is done here instead, where a search nobody wants any more costs
 * nothing to drop:
 *
 *  - only a few searches are at kiwix-serve at once;
 *  - a search still waiting is dropped the moment nobody is waiting for it;
 *  - a search that has begun keeps its place until kiwix-serve has finished with it,
 *    wanted or not, because that is when the work really ends. Its answer is kept, so
 *    asking again gets it at once;
 *  - two people asking the same thing share one search;
 *  - answers are remembered for a few minutes.
 *
 * Two queues can share kiwix-serve's places (`createPlaces`): each keeps its own limit, and
 * together they never have more than the shared number there. A place given back goes to
 * the queue that joined the places first, so quick title searches go before full text.
 */

/** Places at kiwix-serve shared by several queues. The queues take and give back; others only read `taken`. */
export interface Places {
  readonly total: number;
  /** Places taken now, by every queue sharing them. */
  taken(): number;
  take(): void;
  giveBack(): void;
  /** Lets each queue that joined, in the order they joined, start what it has waiting. */
  offer(): void;
  join(pump: () => void): void;
}

export function createPlaces(total: number): Places {
  let taken = 0;
  const pumps: Array<() => void> = [];
  return {
    total,
    taken: () => taken,
    take: () => {
      taken += 1;
    },
    giveBack: () => {
      taken -= 1;
    },
    offer: () => {
      for (const pump of pumps) pump();
    },
    join: (pump) => {
      pumps.push(pump);
    },
  };
}

export interface SearchQueueOptions {
  /** How many searches may be at kiwix-serve at once. */
  concurrency: number;
  /** Places shared with other queues: a search also waits for one of them. */
  places?: Places;
  /** How long a caller waits for one search once it has begun. */
  limitMs: number;
  /** How long a search may go on holding its place before it is given up on. */
  ceilingMs: number;
  /** How many answers are remembered, and for how long. */
  remember: number;
  rememberMs: number;
  /** Hears of a caller that could not be told its answer. The others are told all the same. */
  onError?: (error: unknown) => void;
}

export type Asked<T> =
  | { status: "found"; value: T }
  /** It began but did not answer within the limit. It may still finish, and be remembered. */
  | { status: "slow" }
  | { status: "failed"; message: string }
  /** The caller stopped waiting before there was an answer. */
  | { status: "gone" };

export interface SearchQueue<T> {
  /**
   * Asks for one search. `run` is given a signal that fires only when the search is
   * given up on altogether; `signal` is the caller's own, and stops only the caller's wait.
   */
  ask(key: string, run: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal): Promise<Asked<T>>;
  /** Searches at kiwix-serve now, and searches waiting for a place. */
  load(): { running: number; waiting: number };
  /** Gives up on everything. For shutdown. */
  close(): void;
}

interface Waiter<T> {
  settle(answer: Asked<T>): void;
  timer?: NodeJS.Timeout;
}

interface Task<T> {
  key: string;
  run: (signal: AbortSignal) => Promise<T>;
  waiters: Set<Waiter<T>>;
  running: boolean;
}

export function createSearchQueue<T>(options: SearchQueueOptions): SearchQueue<T> {
  const tasks = new Map<string, Task<T>>();
  const waiting: Task<T>[] = [];
  // A Map keeps the order things were put in, so the first key is the one remembered longest.
  const remembered = new Map<string, { at: number; value: T }>();
  const shutdown = new AbortController();
  let running = 0;

  function recall(key: string): { value: T } | undefined {
    const entry = remembered.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.at > options.rememberMs) {
      remembered.delete(key);
      return undefined;
    }
    return entry;
  }

  function remember(key: string, value: T): void {
    remembered.delete(key);
    remembered.set(key, { at: Date.now(), value });
    while (remembered.size > options.remember) remembered.delete(remembered.keys().next().value!);
  }

  function settleAll(task: Task<T>, answer: Asked<T>): void {
    for (const waiter of [...task.waiters]) {
      try {
        waiter.settle(answer);
      } catch (error) {
        options.onError?.(error);
      }
    }
  }

  /** The limit runs from when the search begins, or from when a caller joins one already begun. */
  function startLimit(waiter: Waiter<T>): void {
    waiter.timer = setTimeout(() => waiter.settle({ status: "slow" }), options.limitMs);
    waiter.timer.unref();
  }

  const { places } = options;
  const placeFree = () => !places || places.taken() < places.total;

  function pump(): void {
    while (running < options.concurrency && waiting.length > 0 && placeFree()) {
      const task = waiting.shift()!;
      task.running = true;
      running += 1;
      places?.take();
      for (const waiter of task.waiters) startLimit(waiter);
      const signal = AbortSignal.any([shutdown.signal, AbortSignal.timeout(options.ceilingMs)]);
      // The place is given back before anyone is told, so that whoever hears the answer sees the queue as it now is.
      const finish = (answer: Asked<T>) => {
        tasks.delete(task.key);
        running -= 1;
        places?.giveBack();
        try {
          settleAll(task, answer);
        } finally {
          // A shared place goes to whichever queue joined first and has a search waiting.
          if (places) places.offer();
          else pump();
        }
      };
      // `run` may throw before it returns a promise; that is a failure like any other.
      Promise.resolve()
        .then(() => task.run(signal))
        .then(
          (value) => {
            remember(task.key, value);
            finish({ status: "found", value });
          },
          (error: unknown) => finish({ status: "failed", message: error instanceof Error ? error.message : String(error) }),
        );
    }
  }
  places?.join(pump);

  return {
    ask(key, run, signal) {
      if (signal?.aborted) return Promise.resolve({ status: "gone" });
      const known = recall(key);
      if (known) return Promise.resolve({ status: "found", value: known.value });

      let task = tasks.get(key);
      if (!task) {
        task = { key, run, waiters: new Set(), running: false };
        tasks.set(key, task);
        waiting.push(task);
      }
      const joined = task;
      return new Promise<Asked<T>>((resolve) => {
        const leave = () => waiter.settle({ status: "gone" });
        const waiter: Waiter<T> = {
          settle(answer) {
            if (!joined.waiters.delete(waiter)) return;
            clearTimeout(waiter.timer);
            signal?.removeEventListener("abort", leave);
            // Nobody wants it and it has not begun: it never needs to reach kiwix-serve.
            if (joined.waiters.size === 0 && !joined.running) {
              const at = waiting.indexOf(joined);
              if (at !== -1) waiting.splice(at, 1);
              tasks.delete(joined.key);
            }
            resolve(answer);
          },
        };
        joined.waiters.add(waiter);
        signal?.addEventListener("abort", leave, { once: true });
        if (joined.running) startLimit(waiter);
        else pump();
      });
    },

    load: () => ({ running, waiting: waiting.length }),

    close() {
      shutdown.abort();
      for (const task of [...tasks.values()]) settleAll(task, { status: "gone" });
      waiting.length = 0;
    },
  };
}
