/**
 * Reciprocal rank fusion: combines several ranked lists into one using only positions,
 * so that scores from unrelated systems (BM25, cosine similarity, another server's
 * full-text engine) never have to be compared directly.
 *
 *   score(item) = Σ over lists  weight / (k + rank)
 */
export interface RankedList<T> {
  weight: number;
  items: T[];
}

export interface Fused<T> {
  item: T;
  score: number;
  /** Rank (1-based) in each input list, or null where the item was absent. */
  ranks: Array<number | null>;
}

export function reciprocalRankFusion<T>(lists: RankedList<T>[], keyOf: (item: T) => string, k = 60): Fused<T>[] {
  const fused = new Map<string, Fused<T>>();
  lists.forEach((list, listIndex) => {
    list.items.forEach((item, index) => {
      const key = keyOf(item);
      let entry = fused.get(key);
      if (!entry) {
        entry = { item, score: 0, ranks: lists.map(() => null) };
        fused.set(key, entry);
      }
      if (entry.ranks[listIndex] !== null) return;
      entry.ranks[listIndex] = index + 1;
      entry.score += list.weight / (k + index + 1);
    });
  });
  return [...fused.values()].sort((a, b) => b.score - a.score);
}
