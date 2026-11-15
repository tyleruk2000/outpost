/**
 * Working out what the download queue will do: when each item is likely to start and
 * finish, and what it will leave free on each storage location.
 *
 * It is an estimate and is presented as one. It assumes the present total speed holds
 * and is shared equally between the transfers running at any moment.
 */

export interface QueueItem {
  id: string;
  /** Transferring now, or waiting for a slot. Paused items are not part of the forecast. */
  phase: "active" | "waiting";
  /** Bytes still to fetch, or null when the size is not known yet. */
  remainingBytes: number | null;
}

export interface Forecast {
  id: string;
  /** Seconds from now, or null when it cannot be estimated. */
  startsInSeconds: number | null;
  finishesInSeconds: number | null;
}

export function forecastQueue(items: QueueItem[], options: { concurrency: number; bytesPerSecond: number | null }): Forecast[] {
  const result = new Map<string, Forecast>(items.map((item) => [item.id, { id: item.id, startsInSeconds: null, finishesInSeconds: null }]));
  const speed = options.bytesPerSecond;
  if (!speed || speed <= 0) {
    for (const item of items) if (item.phase === "active") result.get(item.id)!.startsInSeconds = 0;
    return [...result.values()];
  }

  const slots = Math.max(1, options.concurrency);
  const waiting = items.filter((item) => item.phase === "waiting");
  const running: Array<{ id: string; remaining: number | null }> = items
    .filter((item) => item.phase === "active")
    .map((item) => ({ id: item.id, remaining: item.remainingBytes }));
  for (const item of running) result.get(item.id)!.startsInSeconds = 0;

  let clock = 0;
  /** Once a transfer of unknown size holds a slot, nothing after it can be timed. */
  let blind = false;
  const admit = () => {
    while (running.length < slots && waiting.length > 0) {
      const next = waiting.shift()!;
      running.push({ id: next.id, remaining: next.remainingBytes });
      result.get(next.id)!.startsInSeconds = blind ? null : Math.round(clock);
    }
  };
  admit();

  while (running.length > 0) {
    const sized = running.filter((item) => item.remaining !== null);
    if (sized.length === 0) break;
    if (sized.length < running.length) blind = true;
    const each = speed / running.length;
    const soonest = Math.min(...sized.map((item) => item.remaining!));
    const step = soonest / each;
    clock += step;
    for (const item of sized) item.remaining = item.remaining! - soonest;
    for (let index = running.length - 1; index >= 0; index -= 1) {
      const item = running[index]!;
      if (item.remaining !== null && item.remaining <= 0) {
        result.get(item.id)!.finishesInSeconds = Math.round(clock);
        running.splice(index, 1);
      }
    }
    admit();
  }
  return items.map((item) => result.get(item.id)!);
}
