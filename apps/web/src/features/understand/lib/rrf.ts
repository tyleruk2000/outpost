/**
 * Reciprocal rank fusion, recomputed in the browser so that the page's sliders can show
 * "what if" without asking the server. This is the same sum the server uses:
 *
 *   score = keywordWeight / (k + keywordRank) + semanticWeight / (k + semanticRank)
 *
 * A passage missing from one list simply gets nothing from that list.
 */

export interface RankPair {
  chunkId: number;
  /** 1-based place in each list, or null when that search did not return the passage. */
  keywordRank: number | null;
  semanticRank: number | null;
}

export interface Fused {
  keywordPart: number;
  semanticPart: number;
  score: number;
  /** 1-based place in the fused list. */
  rank: number;
}

export interface FusionSettings {
  k: number;
  keywordWeight: number;
  semanticWeight: number;
}

export const reciprocal = (weight: number, k: number, rank: number | null) => (rank === null ? 0 : weight / (k + rank));

const place = (rank: number | null) => rank ?? Number.POSITIVE_INFINITY;

/**
 * Fuses the two rank lists. Ties keep the server's order: it adds keyword results
 * first, then meaning results, and sorts stably.
 */
export function fuse<T extends RankPair>(pairs: readonly T[], { k, keywordWeight, semanticWeight }: FusionSettings): Array<T & Fused> {
  const scored = pairs.map((pair) => {
    const keywordPart = reciprocal(keywordWeight, k, pair.keywordRank);
    const semanticPart = reciprocal(semanticWeight, k, pair.semanticRank);
    return { ...pair, keywordPart, semanticPart, score: keywordPart + semanticPart, rank: 0 };
  });
  scored.sort((a, b) => b.score - a.score || place(a.keywordRank) - place(b.keywordRank) || place(a.semanticRank) - place(b.semanticRank));
  scored.forEach((row, index) => {
    row.rank = index + 1;
  });
  return scored;
}

/** Every passage either search returned, with its place in each list. */
export function rankPairs<T extends { chunkId: number; rank: number }>(
  keyword: readonly T[],
  semantic: readonly T[],
): Array<RankPair & { hit: T }> {
  const pairs = new Map<number, RankPair & { hit: T }>();
  for (const hit of keyword)
    if (!pairs.has(hit.chunkId)) pairs.set(hit.chunkId, { chunkId: hit.chunkId, keywordRank: hit.rank, semanticRank: null, hit });
  for (const hit of semantic) {
    const known = pairs.get(hit.chunkId);
    if (known) known.semanticRank ??= hit.rank;
    else pairs.set(hit.chunkId, { chunkId: hit.chunkId, keywordRank: null, semanticRank: hit.rank, hit });
  }
  return [...pairs.values()];
}

/** How far each passage moved between two orderings: positive means it rose. */
export function movement(
  before: ReadonlyArray<{ chunkId: number; rank: number }>,
  after: ReadonlyArray<{ chunkId: number; rank: number }>,
): Map<number, number> {
  const was = new Map(before.map((row) => [row.chunkId, row.rank]));
  return new Map(after.map((row) => [row.chunkId, (was.get(row.chunkId) ?? row.rank) - row.rank]));
}

/** Points of weight ÷ (k + rank) for ranks 1 to `ranks`, for drawing the curve. */
export function reciprocalCurve(k: number, ranks: number, weight = 1): Array<{ rank: number; value: number }> {
  return Array.from({ length: Math.max(0, ranks) }, (_, index) => ({ rank: index + 1, value: weight / (k + index + 1) }));
}
