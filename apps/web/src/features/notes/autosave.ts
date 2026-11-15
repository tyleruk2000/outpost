/**
 * The save queue of an open page, with no React and no network in it.
 *
 * The page tells it which fields changed (`touch`). After a pause in typing it reads
 * the current values of those fields (`collect`) and sends them (`send`) together with
 * the `updatedAt` they were based on. One save is in flight at a time; anything typed
 * meanwhile is remembered and goes out in a follow-up save, so no keystroke is dropped.
 *
 * When a save fails nothing is thrown away:
 * - the server cannot be reached: the changes stay queued and are retried, less and
 *   less often, until it answers;
 * - the page was changed somewhere else (409): saving stops until the person picks a
 *   side, `keepMine` or `reset` after loading the other version;
 * - anything else: the message is shown and the next edit, or `retry`, tries again.
 */

export type SaveFailure =
  | { kind: "offline" }
  | { kind: "conflict"; current: { updatedAt: number; title: string } }
  | { kind: "error"; message: string };

export type AutosaveStatus = { kind: "saved" } | { kind: "saving" } | SaveFailure;

export interface AutosaveOptions<P extends object> {
  /** `updatedAt` of the page as it was loaded. */
  baseUpdatedAt: number;
  /** Reads the current value of each listed field. Called right before sending. */
  collect(keys: ReadonlySet<keyof P>): Partial<P>;
  /**
   * Sends a change and resolves with the page's new `updatedAt`. `baseUpdatedAt` is
   * undefined when the person chose to overwrite the other version.
   */
  send(patch: Partial<P>, baseUpdatedAt: number | undefined, options: { unloading: boolean }): Promise<number>;
  /** Says what kind of failure a rejected `send` was. */
  classify(error: unknown): SaveFailure;
  onStatus?(status: AutosaveStatus): void;
  /** Everything not yet saved, to keep somewhere that survives a reload. `null` once all of it is saved. */
  onDraft?(unsaved: Partial<P> | null): void;
  debounceMs?: number;
  /** Waits between retries while the server is unreachable; the last one repeats. */
  retryDelaysMs?: readonly number[];
}

export interface Autosaver<P extends object> {
  /** A field changed. */
  touch(key: keyof P): void;
  /**
   * Save now instead of waiting for a pause (on blur, when the tab is hidden).
   * `unloading` says the tab itself is closing, so the request must outlive it.
   */
  flush(options?: { unloading?: boolean }): void;
  /** Try again after a failure. */
  retry(): void;
  /** After a conflict: send every listed field, overwriting the other version. */
  keepMine(keys: Iterable<keyof P>): void;
  /** The page was loaded afresh (the other version, or a remote change): forget local changes. */
  reset(baseUpdatedAt: number): void;
  /** Something else saved the page on this tab's behalf; later saves build on that. */
  rebase(updatedAt: number): void;
  /**
   * The page is leaving the screen. Reads what is unsaved now, while it can still be
   * read, and sends it, after the save in flight if there is one.
   */
  close(): void;
  status(): AutosaveStatus;
  baseUpdatedAt(): number;
  /** Nothing waiting and nothing in flight. */
  isClean(): boolean;
  /**
   * True when there are changes that a `flush` could not send right now: a save is in
   * flight, or saving is stopped by a conflict or a failure.
   */
  isStuck(): boolean;
}

const DEFAULT_RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000] as const;

export function createAutosaver<P extends object>(options: AutosaveOptions<P>): Autosaver<P> {
  const debounceMs = options.debounceMs ?? 800;
  const retryDelays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS;

  let base = options.baseUpdatedAt;
  let status: AutosaveStatus = { kind: "saved" };
  let dirty = new Set<keyof P>();
  /** The patch on its way to the server, kept so that a failure can put it back. */
  let inFlight: Partial<P> | null = null;
  /** Values read when the page closed, waiting for the save in flight to finish. */
  let parting: Partial<P> | null = null;
  let overwriteNext = false;
  let closed = false;
  let failures = 0;
  let lastTouch = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const setStatus = (next: AutosaveStatus) => {
    if (next.kind === status.kind && next.kind !== "conflict" && next.kind !== "error") return;
    status = next;
    options.onStatus?.(next);
  };

  const clearTimer = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };

  const schedule = (delay: number) => {
    clearTimer();
    timer = setTimeout(() => {
      timer = undefined;
      attempt();
    }, delay);
  };

  const keysOf = (patch: Partial<P>) => Object.keys(patch) as Array<keyof P>;

  function dispatch(patch: Partial<P>, unloading: boolean): void {
    inFlight = patch;
    const sentBase = overwriteNext ? undefined : base;
    overwriteNext = false;
    options.send(patch, sentBase, { unloading }).then(
      (updatedAt) => {
        inFlight = null;
        failures = 0;
        base = Math.max(base, updatedAt);
        if (parting) {
          const next = parting;
          parting = null;
          dispatch(next, false);
          return;
        }
        if (dirty.size > 0) {
          setStatus({ kind: "saving" });
          if (!closed) schedule(Math.max(0, debounceMs - (Date.now() - lastTouch)));
          return;
        }
        options.onDraft?.(null);
        setStatus({ kind: "saved" });
      },
      (error: unknown) => {
        inFlight = null;
        const failure = options.classify(error);
        if (closed) {
          // Nothing left to read the page from; the draft is what carries the change over.
          options.onDraft?.({ ...patch, ...parting });
          parting = null;
          setStatus(failure);
          return;
        }
        for (const key of keysOf(patch)) dirty.add(key);
        if (sentBase === undefined) overwriteNext = true;
        setStatus(failure);
        if (failure.kind === "offline") {
          schedule(retryDelays[Math.min(failures, retryDelays.length - 1)] ?? 30000);
          failures += 1;
        }
      },
    );
  }

  /** The pause is over (or someone asked): record the draft, then send if nothing stops it. */
  function attempt(unloading = false): void {
    if (closed || dirty.size === 0) return;
    const patch = options.collect(dirty);
    options.onDraft?.({ ...inFlight, ...patch });
    if (inFlight || status.kind === "conflict") return;
    dirty = new Set();
    if (status.kind !== "offline") setStatus({ kind: "saving" });
    dispatch(patch, unloading);
  }

  return {
    touch(key) {
      if (closed) return;
      dirty.add(key);
      lastTouch = Date.now();
      if (status.kind === "saved" || status.kind === "error") setStatus({ kind: "saving" });
      // While offline the retry timer is already running; an edit must not push it back.
      if (status.kind === "offline" && timer !== undefined) return;
      schedule(debounceMs);
    },

    flush({ unloading = false } = {}) {
      if (closed || dirty.size === 0) return;
      clearTimer();
      attempt(unloading);
    },

    retry() {
      if (closed || status.kind === "conflict") return;
      clearTimer();
      attempt();
    },

    keepMine(keys) {
      if (closed || status.kind !== "conflict") return;
      for (const key of keys) dirty.add(key);
      overwriteNext = true;
      status = { kind: "saving" };
      options.onStatus?.(status);
      clearTimer();
      attempt();
    },

    reset(baseUpdatedAt) {
      clearTimer();
      dirty = new Set();
      overwriteNext = false;
      failures = 0;
      base = Math.max(base, baseUpdatedAt);
      options.onDraft?.(null);
      if (!inFlight) setStatus({ kind: "saved" });
    },

    rebase(updatedAt) {
      base = Math.max(base, updatedAt);
    },

    close() {
      if (closed) return;
      closed = true;
      clearTimer();
      if (dirty.size === 0) return;
      const patch = options.collect(dirty);
      dirty = new Set();
      options.onDraft?.({ ...inFlight, ...patch });
      // A person who has not chosen a side yet has not agreed to overwrite anything.
      if (status.kind === "conflict") return;
      if (inFlight) parting = patch;
      else dispatch(patch, false);
    },

    status: () => status,
    baseUpdatedAt: () => base,
    isClean: () => dirty.size === 0 && inFlight === null && parting === null,
    isStuck: () =>
      dirty.size > 0 && (inFlight !== null || status.kind === "conflict" || status.kind === "offline" || status.kind === "error"),
  };
}
