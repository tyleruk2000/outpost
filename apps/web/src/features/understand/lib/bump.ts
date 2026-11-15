/**
 * Layout for the fusion chart: keyword ranks down the left, the fused order in the
 * middle, meaning ranks down the right, and a line for each passage from where each
 * search placed it to where it ended up.
 */

export interface BumpInput {
  chunkId: number;
  keywordRank: number | null;
  semanticRank: number | null;
  /** 1-based place in the fused list. */
  rank: number;
}

export interface BumpLine {
  chunkId: number;
  keywordRank: number | null;
  semanticRank: number | null;
  rank: number;
  /** Vertical centre of the passage's row in each column; null where that search did not return it. */
  keywordY: number | null;
  semanticY: number | null;
  fusedY: number;
  /** Fell below the rows shown in the middle column; its lines run to the "lower down" row. */
  below: boolean;
}

export interface BumpLayout {
  lines: BumpLine[];
  /** Rows drawn in each column. */
  keywordRows: number;
  semanticRows: number;
  fusedRows: number;
  /** Passages that did not make the middle column. */
  belowCount: number;
  /** Centre of the "lower down" row, when there is one. */
  belowY: number | null;
  height: number;
}

export function layoutBump(
  rows: readonly BumpInput[],
  { shown = 10, rowHeight = 24, top = 0 }: { shown?: number; rowHeight?: number; top?: number } = {},
): BumpLayout {
  const y = (rank: number) => top + (rank - 0.5) * rowHeight;
  const fusedRows = Math.min(shown, rows.length);
  const belowCount = Math.max(0, rows.length - fusedRows);
  const keywordRows = rows.reduce((max, row) => Math.max(max, row.keywordRank ?? 0), 0);
  const semanticRows = rows.reduce((max, row) => Math.max(max, row.semanticRank ?? 0), 0);
  // The "lower down" row sits one clear row beneath the last fused place.
  const belowY = belowCount > 0 ? y(fusedRows + 2) : null;
  const lines = rows.map((row): BumpLine => {
    const below = row.rank > fusedRows;
    return {
      chunkId: row.chunkId,
      keywordRank: row.keywordRank,
      semanticRank: row.semanticRank,
      rank: row.rank,
      keywordY: row.keywordRank === null ? null : y(row.keywordRank),
      semanticY: row.semanticRank === null ? null : y(row.semanticRank),
      fusedY: below ? belowY! : y(row.rank),
      below,
    };
  });
  const deepest = Math.max(keywordRows, semanticRows, belowCount > 0 ? fusedRows + 2 : fusedRows);
  return { lines, keywordRows, semanticRows, fusedRows, belowCount, belowY, height: top + deepest * rowHeight };
}

/** A smooth link between two points at the same heights, leaving and arriving level. */
export function linkPath(x0: number, y0: number, x1: number, y1: number): string {
  const mid = (x0 + x1) / 2;
  const r = (value: number) => Math.round(value * 10) / 10;
  return `M${r(x0)},${r(y0)} C${r(mid)},${r(y0)} ${r(mid)},${r(y1)} ${r(x1)},${r(y1)}`;
}

/** Which searches found a passage, in words. */
export function foundBy(row: { keywordRank: number | null; semanticRank: number | null }): string {
  if (row.keywordRank !== null && row.semanticRank !== null) return "found by both searches";
  if (row.keywordRank !== null) return "found by words only";
  if (row.semanticRank !== null) return "found by meaning only";
  return "found by neither search";
}
