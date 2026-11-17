/**
 * A limit on how often one address may do something: so many times in a window, counted
 * from the times it last did. No timer runs; old times are dropped when the address next
 * asks, and the list of addresses is trimmed when it grows, so it costs nothing at rest.
 */
import { AppError } from "../../core/errors.ts";

/** More addresses than a home network has; past this, the oldest are forgotten. */
const MAX_KEYS = 1000;

export class RateLimit {
  private readonly seen = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly words: string;

  constructor(limit: number, windowMs: number, words: string) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.words = words;
  }

  /** Counts one more for `key`, or throws `too_many` when it is over the limit. */
  take(key: string, now = Date.now()): void {
    const since = now - this.windowMs;
    const times = (this.seen.get(key) ?? []).filter((at) => at > since);
    if (times.length >= this.limit) {
      this.seen.set(key, times);
      const wait = Math.max(1, Math.ceil((times[0]! + this.windowMs - now) / 1000));
      throw new AppError("too_many", `${this.words} Try again in ${wait} second${wait === 1 ? "" : "s"}.`, { retryAfterSeconds: wait });
    }
    times.push(now);
    // Map order is insertion order: setting it again makes it the newest.
    this.seen.delete(key);
    this.seen.set(key, times);
    if (this.seen.size > MAX_KEYS) this.seen.delete(this.seen.keys().next().value!);
  }

  clear(): void {
    this.seen.clear();
  }
}
