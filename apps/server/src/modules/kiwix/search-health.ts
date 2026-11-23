/**
 * Which archives can be searched by their full text, remembered.
 *
 * Some archives have no full-text index (kiwix-serve refuses every search of them), and
 * some fail every time for a while. Warning about them on every search says nothing new
 * and hides the warnings that matter. So the first time an archive is known to be one of
 * these it is marked, once, on its collection (`meta.kiwix.search`): it is then searched
 * by its titles only, nothing is said in the results, and the collection's details say
 * why. The mark is tried again now and then, and goes the first time a search works.
 *
 *  - No full-text index: kiwix-serve refused a search of it (an answer in the 400s) and
 *    said it has no full-text search, or refused twice. Tried again after a week.
 *  - Failing: three searches in a row failed (an error or an answer in the 500s). Tried
 *    again after half an hour.
 *
 * A mark tried again that fails again is renewed at once, with no warning in between.
 */

export interface SearchMark {
  fullText: "none" | "failing";
  /** When it was marked, in milliseconds since 1970. */
  since: number;
  /** What kiwix-serve said, in a few words, for the collection's details. */
  message: string;
}

export const HEALTH_RETRY_MS = { none: 7 * 24 * 3600_000, failing: 30 * 60_000 } as const;
/** Failures in a row before an archive is marked as failing. */
export const FAILURES_TO_MARK = 3;

export interface SearchHealth {
  /** Whether to ask kiwix-serve for this archive's full text now. */
  fullTextNow(id: string): boolean;
  /** kiwix-serve refused the search (an answer in the 400s), with what it said. */
  refused(id: string, status: number, body: string): void;
  /** The search failed (an error, or an answer in the 500s). */
  failed(id: string, message: string): void;
  /** A search worked: whatever was marked is cleared. */
  worked(id: string): void;
}

export function createSearchHealth(store: {
  read(id: string): SearchMark | undefined;
  write(id: string, mark: SearchMark | null): void;
  now?: () => number;
}): SearchHealth {
  const now = store.now ?? Date.now;
  const refusals = new Map<string, number>();
  const failures = new Map<string, number>();
  const plain = (text: string) =>
    text
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 200);
  return {
    fullTextNow(id) {
      const mark = store.read(id);
      return !mark || now() - mark.since >= HEALTH_RETRY_MS[mark.fullText];
    },
    refused(id, status, body) {
      const count = (refusals.get(id) ?? 0) + 1;
      refusals.set(id, count);
      // Marked before and tried again: still refused, so marked again at once.
      if (/full.?text|index/i.test(body) || count >= 2 || store.read(id)?.fullText === "none") {
        refusals.delete(id);
        store.write(id, { fullText: "none", since: now(), message: plain(body) || `kiwix-serve answered ${status}.` });
      }
    },
    failed(id, message) {
      const count = (failures.get(id) ?? 0) + 1;
      failures.set(id, count);
      if (count >= FAILURES_TO_MARK || store.read(id)?.fullText === "failing") {
        failures.delete(id);
        store.write(id, { fullText: "failing", since: now(), message: plain(message) });
      }
    },
    worked(id) {
      refusals.delete(id);
      failures.delete(id);
      if (store.read(id)) store.write(id, null);
    },
  };
}
