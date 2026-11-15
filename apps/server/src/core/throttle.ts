/**
 * A shared speed limit for transfers.
 *
 * Every transfer asks permission before writing each chunk. Permission is granted in
 * arrival order at the configured rate, so the limit holds across all downloads
 * together and each gets a fair share. With no limit set, asking costs nothing.
 */
export class RateLimiter {
  private bytesPerSecond: number | null = null;
  /** Moment at which the next chunk may start, given what has already been granted. */
  private nextFree = 0;

  get limit(): number | null {
    return this.bytesPerSecond;
  }

  setLimit(bytesPerSecond: number | null): void {
    this.bytesPerSecond = bytesPerSecond && bytesPerSecond > 0 ? bytesPerSecond : null;
    // Whatever was owed under the old limit is forgotten; the new one applies from now.
    this.nextFree = 0;
  }

  /** Resolves when `bytes` may be transferred. Rejects if `signal` aborts while waiting. */
  take(bytes: number, signal?: AbortSignal): Promise<void> {
    const limit = this.bytesPerSecond;
    if (limit === null || bytes <= 0) return Promise.resolve();
    const now = Date.now();
    const start = Math.max(now, this.nextFree);
    this.nextFree = start + (bytes / limit) * 1000;
    const wait = start - now;
    if (wait <= 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      if (signal?.aborted) return reject(signal.reason);
      const timer = setTimeout(() => {
        signal?.removeEventListener("abort", onAbort);
        resolve();
      }, wait);
      const onAbort = () => {
        clearTimeout(timer);
        reject(signal!.reason);
      };
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
