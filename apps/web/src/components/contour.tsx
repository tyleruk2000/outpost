/**
 * The one decorative element in Outpost: a small contour map, drawn with the same
 * method a real one is. A height field is built from a few seeded hills, then marching
 * squares traces a line wherever the surface crosses each level.
 *
 * It appears on Home and in empty states, in the border colour, and nowhere else.
 */
import { memo, useMemo } from "react";
import { cn } from "@/lib/utils";

function seeded(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function heightField(columns: number, rows: number, seed: number): Float32Array {
  const random = seeded(seed);
  // A ridge line of summits with a few outlying tops reads as terrain; evenly scattered
  // round hills read as ripples.
  const ridgeY = rows * (0.3 + random() * 0.4);
  const tilt = (random() - 0.5) * 0.5;
  const hills = Array.from({ length: 11 }, (_, index) => {
    const along = (index + random() * 0.8) / 11;
    const onRidge = index % 3 !== 2;
    return {
      x: along * columns * 1.1 - columns * 0.05,
      y: onRidge ? ridgeY + (along - 0.5) * tilt * rows + (random() - 0.5) * rows * 0.25 : random() * rows,
      spreadX: (0.05 + random() * 0.09) * columns,
      spreadY: (0.12 + random() * 0.22) * rows,
      height: onRidge ? 0.55 + random() * 0.6 : 0.25 + random() * 0.35,
    };
  });
  const field = new Float32Array((columns + 1) * (rows + 1));
  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      let value = 0;
      for (const hill of hills) {
        const dx = (x - hill.x) / hill.spreadX;
        const dy = (y - hill.y) / hill.spreadY;
        value += hill.height * Math.exp(-(dx * dx + dy * dy) / 2);
      }
      field[y * (columns + 1) + x] = value;
    }
  }
  return field;
}

/** Marching squares: for one level, the line segments where the field crosses it. */
function traceLevel(field: Float32Array, columns: number, rows: number, level: number, cell: number): string {
  const at = (x: number, y: number) => field[y * (columns + 1) + x]!;
  const lerp = (a: number, b: number) => (level - a) / (b - a || 1e-6);
  let path = "";
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < columns; x += 1) {
      const tl = at(x, y);
      const tr = at(x + 1, y);
      const br = at(x + 1, y + 1);
      const bl = at(x, y + 1);
      const index = (tl > level ? 8 : 0) | (tr > level ? 4 : 0) | (br > level ? 2 : 0) | (bl > level ? 1 : 0);
      if (index === 0 || index === 15) continue;
      const top: [number, number] = [x + lerp(tl, tr), y];
      const right: [number, number] = [x + 1, y + lerp(tr, br)];
      const bottom: [number, number] = [x + lerp(bl, br), y + 1];
      const left: [number, number] = [x, y + lerp(tl, bl)];
      const segments: Array<[[number, number], [number, number]]> = [];
      switch (index) {
        case 1:
        case 14:
          segments.push([left, bottom]);
          break;
        case 2:
        case 13:
          segments.push([bottom, right]);
          break;
        case 3:
        case 12:
          segments.push([left, right]);
          break;
        case 4:
        case 11:
          segments.push([top, right]);
          break;
        case 6:
        case 9:
          segments.push([top, bottom]);
          break;
        case 7:
        case 8:
          segments.push([left, top]);
          break;
        case 5:
          segments.push([left, top], [bottom, right]);
          break;
        case 10:
          segments.push([left, bottom], [top, right]);
          break;
      }
      for (const [from, to] of segments) {
        path += `M${(from[0] * cell).toFixed(1)} ${(from[1] * cell).toFixed(1)}L${(to[0] * cell).toFixed(1)} ${(to[1] * cell).toFixed(1)}`;
      }
    }
  }
  return path;
}

export const Contour = memo(function Contour({
  seed = 7,
  columns = 72,
  rows = 28,
  levels = 12,
  className,
}: {
  seed?: number;
  columns?: number;
  rows?: number;
  levels?: number;
  className?: string;
}) {
  const cell = 10;
  const paths = useMemo(() => {
    const field = heightField(columns, rows, seed);
    let max = 0;
    for (const value of field) max = Math.max(max, value);
    return Array.from({ length: levels }, (_, index) => {
      const level = ((index + 0.6) / (levels + 0.4)) * max;
      return { d: traceLevel(field, columns, rows, level, cell), index: (index + 1) % 4 === 0 };
    });
  }, [seed, columns, rows, levels]);

  return (
    <svg
      viewBox={`0 0 ${columns * cell} ${rows * cell}`}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden
      focusable="false"
      className={cn("pointer-events-none text-border-strong", className)}
    >
      {paths.map((path, index) => (
        // Every fourth line is an index contour, drawn heavier, as on a printed map.
        <path
          // biome-ignore lint/suspicious/noArrayIndexKey: levels are a fixed, ordered list
          key={index}
          d={path.d}
          fill="none"
          stroke="currentColor"
          strokeWidth={path.index ? 1.4 : 0.8}
          strokeLinecap="round"
          opacity={path.index ? 0.9 : 0.6}
        />
      ))}
    </svg>
  );
});
