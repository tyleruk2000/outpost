/** Geometry for the map of vectors: fitting the points to the drawing, and finding the point under the pointer. */

export interface Placed {
  x: number;
  y: number;
}

export interface MapFrame {
  toX(value: number): number;
  toY(value: number): number;
  /** Pixels per unit, the same on both axes so that distances on the page are true to the projection. */
  scale: number;
}

/**
 * Fits points into a box with the same scale on both axes. Stretching one axis to fill
 * the space would make some passages look closer together than the projection says.
 */
export function fitFrame(points: readonly Placed[], width: number, height: number, padding = 24): MapFrame {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const point of points) {
    if (point.x < minX) minX = point.x;
    if (point.x > maxX) maxX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.y > maxY) maxY = point.y;
  }
  if (points.length === 0) {
    minX = minY = -1;
    maxX = maxY = 1;
  }
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const innerWidth = Math.max(1, width - padding * 2);
  const innerHeight = Math.max(1, height - padding * 2);
  const scale = Math.min(innerWidth / spanX, innerHeight / spanY);
  const offsetX = padding + (innerWidth - spanX * scale) / 2;
  const offsetY = padding + (innerHeight - spanY * scale) / 2;
  return {
    scale,
    toX: (value) => offsetX + (value - minX) * scale,
    // Screen y grows downward; the projection's second axis is drawn growing upward.
    toY: (value) => offsetY + (maxY - value) * scale,
  };
}

/** Index of the point closest to (x, y), or -1 when none is within `reach` pixels. */
export function nearestPoint(points: readonly Placed[], x: number, y: number, reach = 24): number {
  let best = -1;
  let bestDistance = reach * reach;
  for (let index = 0; index < points.length; index += 1) {
    const dx = points[index]!.x - x;
    const dy = points[index]!.y - y;
    const distance = dx * dx + dy * dy;
    if (distance <= bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/**
 * The order the arrow keys visit points in: most similar to the question first. Without
 * a question, left to right.
 */
export function tourOrder(points: ReadonlyArray<{ x: number; similarity: number | null }>): number[] {
  const order = points.map((_, index) => index);
  const withQuery = points.some((point) => point.similarity !== null);
  order.sort((a, b) => (withQuery ? (points[b]!.similarity ?? -2) - (points[a]!.similarity ?? -2) : points[a]!.x - points[b]!.x) || a - b);
  return order;
}

/** The share of the vectors' variation that the two drawn axes keep together, 0 to 1. */
export const keptShare = (explained: readonly [number, number]) => Math.max(0, Math.min(1, explained[0] + explained[1]));
