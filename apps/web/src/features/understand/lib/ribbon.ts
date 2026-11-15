/**
 * Lays a document out as a ribbon: its whole text as a bar, each passage a segment at
 * its true character offsets. Long documents wrap onto several rows, like lines of text.
 * Neighbouring passages sit on alternate lanes so that the text they share is visible
 * as the stretch where both lanes are filled.
 */

export interface RibbonChunk {
  chunkId: number;
  text: string;
  page: number | null;
  heading: string | null;
  charStart: number | null;
  charEnd: number | null;
  overlapWithPrevious: number;
}

export interface Extent {
  start: number;
  end: number;
}

/** A drawn piece of a passage or an overlap. One passage has two pieces when it crosses the end of a row. */
export interface RibbonPiece {
  index: number;
  row: number;
  lane: 0 | 1;
  x: number;
  width: number;
}

export interface RibbonBoundary {
  /** The passage that starts the new section. */
  index: number;
  row: number;
  x: number;
  label: string;
  /** False when the label would run into the one before it; the tick is still drawn. */
  showLabel: boolean;
}

export interface RibbonLayout {
  rows: number;
  /** Characters in the whole text. */
  total: number;
  pixelsPerCharacter: number;
  pieces: RibbonPiece[];
  /** Stretches of text shared by a passage and the one before it. `index` is the later passage. */
  overlaps: RibbonPiece[];
  boundaries: RibbonBoundary[];
}

/**
 * Character ranges for each passage. The server sends true offsets; if any are missing
 * the passages are laid end to end instead, each stepping back by its recorded overlap.
 */
export function extents(chunks: readonly RibbonChunk[]): Extent[] {
  const known = chunks.every((chunk) => chunk.charStart !== null && chunk.charEnd !== null && chunk.charEnd >= chunk.charStart);
  if (known) return chunks.map((chunk) => ({ start: chunk.charStart!, end: chunk.charEnd! }));
  const result: Extent[] = [];
  let cursor = 0;
  for (const chunk of chunks) {
    const start = Math.max(0, cursor - chunk.overlapWithPrevious);
    result.push({ start, end: start + chunk.text.length });
    cursor = start + chunk.text.length;
  }
  return result;
}

/** "Page 3", a heading, or both, for the place a passage belongs to. */
export function placeLabel(chunk: { page: number | null; heading: string | null }): string {
  return [chunk.page !== null ? `Page ${chunk.page}` : null, chunk.heading].filter(Boolean).join(", ");
}

function split(start: number, end: number, rowChars: number, scale: number, index: number, lane: 0 | 1): RibbonPiece[] {
  const pieces: RibbonPiece[] = [];
  let from = start;
  while (from < end) {
    const row = Math.floor(from / rowChars);
    const to = Math.min(end, (row + 1) * rowChars);
    pieces.push({ index, row, lane, x: (from - row * rowChars) * scale, width: (to - from) * scale });
    from = to;
  }
  return pieces;
}

export interface RibbonOptions {
  /** Width of one row in pixels. */
  width: number;
  /** The configured passage size, used to choose a readable scale. */
  chunkSize: number;
  /** A passage of the configured size is drawn at least this wide, until `maxRows` forces it narrower. */
  minPassageWidth?: number;
  maxRows?: number;
  /** Room a boundary label needs before the next one may be shown. */
  labelWidth?: number;
}

export function layoutRibbon(
  chunks: readonly RibbonChunk[],
  { width, chunkSize, minPassageWidth = 56, maxRows = 12, labelWidth = 84 }: RibbonOptions,
): RibbonLayout {
  const ranges = extents(chunks);
  const total = ranges.reduce((max, range) => Math.max(max, range.end), 0);
  if (total === 0 || width <= 0) return { rows: 0, total, pixelsPerCharacter: 0, pieces: [], overlaps: [], boundaries: [] };

  // One row if the text fits at a readable scale; otherwise wrap, up to a limit of rows.
  const readable = minPassageWidth / Math.max(1, chunkSize);
  let rows = Math.max(1, Math.ceil((total * Math.max(width / total, readable)) / width));
  rows = Math.min(rows, maxRows);
  const rowChars = Math.ceil(total / rows);
  const scale = width / rowChars;

  const pieces: RibbonPiece[] = [];
  const overlaps: RibbonPiece[] = [];
  const boundaries: RibbonBoundary[] = [];
  let lastLabel: { row: number; x: number } | undefined;

  ranges.forEach((range, index) => {
    const lane = (index % 2) as 0 | 1;
    pieces.push(...split(range.start, range.end, rowChars, scale, index, lane));
    const previous = ranges[index - 1];
    if (previous && previous.end > range.start)
      overlaps.push(...split(range.start, Math.min(previous.end, range.end), rowChars, scale, index, lane));

    const chunk = chunks[index]!;
    const before = chunks[index - 1];
    const label = placeLabel(chunk);
    if (label && (!before || before.page !== chunk.page || before.heading !== chunk.heading)) {
      const row = Math.min(rows - 1, Math.floor(range.start / rowChars));
      const x = (range.start - row * rowChars) * scale;
      const clear = !lastLabel || lastLabel.row !== row || x - lastLabel.x >= labelWidth;
      const fits = width - x >= labelWidth * 0.6;
      const showLabel = clear && fits;
      if (showLabel) lastLabel = { row, x };
      boundaries.push({ index, row, x, label, showLabel });
    }
  });

  return { rows, total, pixelsPerCharacter: scale, pieces, overlaps, boundaries };
}

/**
 * Splits a passage's text into the part it shares with the passage before it, its own
 * middle, and the part it shares with the passage after it.
 */
export function splitOverlap(
  text: string,
  sharedWithPrevious: number,
  sharedWithNext: number,
): { head: string; body: string; tail: string } {
  const head = Math.max(0, Math.min(text.length, Math.floor(sharedWithPrevious)));
  const tail = Math.max(0, Math.min(text.length - head, Math.floor(sharedWithNext)));
  return { head: text.slice(0, head), body: text.slice(head, text.length - tail), tail: text.slice(text.length - tail) };
}

/** Moves a selection along the ribbon with the arrow keys, Home and End. */
export function stepIndex(current: number, key: string, count: number): number | null {
  if (count === 0) return null;
  switch (key) {
    case "ArrowRight":
    case "ArrowDown":
      return Math.min(count - 1, current + 1);
    case "ArrowLeft":
    case "ArrowUp":
      return Math.max(0, current - 1);
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return null;
  }
}
