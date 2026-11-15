/**
 * The two ideas inside BM25, the scoring used by the full-text index.
 *
 * 1. Inverse document frequency: a word found in few passages tells you more than a
 *    word found in most of them.
 * 2. Saturating term frequency: the second mention of a word adds less than the first,
 *    and long passages are marked down a little so they do not win by sheer length.
 */

export const BM25_K1 = 1.2;
export const BM25_B = 0.75;

/**
 * The IDF as the index (SQLite FTS5) works it out: ln((N − n + 0.5) ÷ (n + 0.5)). A word
 * in more than half of everything would come out negative, so the index gives it a
 * weight of almost nothing instead.
 */
export const IDF_FLOOR = 1e-6;
export function inverseDocumentFrequency(total: number, containing: number): number {
  const idf = Math.log((total - containing + 0.5) / (containing + 0.5));
  return idf > 0 ? idf : IDF_FLOOR;
}

/**
 * How much one word contributes, before IDF, when it appears `count` times in a passage
 * whose length is `lengthRatio` times the average. Rises quickly, then flattens towards k1 + 1.
 */
export function termFrequencyPart(count: number, lengthRatio = 1, k1 = BM25_K1, b = BM25_B): number {
  if (count <= 0) return 0;
  return (count * (k1 + 1)) / (count + k1 * (1 - b + b * lengthRatio));
}

/** The ceiling the term-frequency part approaches and never reaches. */
export const termFrequencyCeiling = (k1 = BM25_K1) => k1 + 1;

export function saturationCurve(maxCount: number, lengthRatio = 1): Array<{ count: number; value: number }> {
  return Array.from({ length: maxCount + 1 }, (_, count) => ({ count, value: termFrequencyPart(count, lengthRatio) }));
}
