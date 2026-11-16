/**
 * Looking up from long work.
 *
 * The server answers every request on one thread. Work that goes on for a while on
 * that thread (writing a list in batches, reading a large file a piece at a time) awaits
 * this between pieces: it resolves once whatever was waiting (requests, timers, the
 * progress of other jobs) has had its turn.
 */
export const yieldToEventLoop = (): Promise<void> => new Promise<void>((resolve) => setImmediate(resolve));
