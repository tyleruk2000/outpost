/**
 * A repeater's band as the map draws it: by shape, in the ink colour, so that it reads
 * the same in the dark, in grey on paper, and to someone who cannot tell colours apart.
 * 2 m is a circle, 70 cm a square, 6 m and 10 m a triangle, 23 cm and up a diamond; the
 * rest (4 m, 1.25 m, 33 cm and those no band names) a small circle with a dot. One its
 * list says is not operational is drawn hollow.
 *
 * MapLibre draws a picture it has been given a name for. The pictures are made here in
 * the browser when the map first asks for one (see maps/map/place-images.ts), and the
 * name carries the colours, so a change of theme asks for new ones.
 */
import type { RepeaterBand } from "@outpost/shared";

export type BandShape = "circle" | "square" | "triangle" | "diamond" | "other";

export function bandShape(band: RepeaterBand): BandShape {
  if (band === "2m") return "circle";
  if (band === "70cm") return "square";
  if (band === "6m" || band === "10m") return "triangle";
  if (["23cm", "13cm", "9cm", "5cm", "3cm", "1.2cm", "6mm", "4mm", "2.5mm", "2mm", "1mm"].includes(band)) return "diamond";
  return "other";
}

/** The shapes in the order the key lists them, with the bands each stands for. */
export const BAND_SHAPES: ReadonlyArray<{ shape: BandShape; words: string }> = [
  { shape: "circle", words: "2 m" },
  { shape: "square", words: "70 cm" },
  { shape: "triangle", words: "6 m, 10 m" },
  { shape: "diamond", words: "23 cm and up" },
  { shape: "other", words: "Other bands" },
];

/** The side of a picture in the map's own pixels. */
const SIZE = 18;
const PREFIX = "repeater-";

/** The picture's name for a shape: its fill, the line round it, and the halo that stands it off the map (the page colour). */
export const repeaterImageId = (shape: BandShape, fill: string, line: string, halo: string) => `${PREFIX}${shape}|${fill}|${line}|${halo}`;

/** The outline of a shape on a 18 × 18 grid, as one path: the same for the map and the key. */
export function shapePath(shape: BandShape): string {
  switch (shape) {
    case "square":
      return "M4.5 4.5H13.5V13.5H4.5Z";
    case "triangle":
      return "M9 3.2L15 14H3Z";
    case "diamond":
      return "M9 2.6L15.4 9L9 15.4L2.6 9Z";
    case "other":
    case "circle":
      return "M9 3.6A5.4 5.4 0 1 1 8.99 3.6Z";
  }
}

const SHAPES: readonly string[] = ["circle", "square", "triangle", "diamond", "other"];

/** Draws one picture at `ratio` device pixels to each of the map's. Null for a name that is not a repeater's. */
export function drawRepeaterImage(id: string, ratio: number): ImageData | null {
  if (!id.startsWith(PREFIX)) return null;
  const [shape, fill, line, halo] = id.slice(PREFIX.length).split("|") as [BandShape, string, string, string];
  if (!fill || !line || !halo || !SHAPES.includes(shape)) return null;
  const side = Math.round(SIZE * ratio);
  const canvas = typeof OffscreenCanvas === "undefined" ? document.createElement("canvas") : new OffscreenCanvas(side, side);
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  context.scale(ratio, ratio);
  const path = new Path2D(shapePath(shape));
  context.lineJoin = "round";
  context.lineWidth = 4.5;
  context.strokeStyle = halo;
  context.stroke(path);
  context.fillStyle = fill;
  context.fill(path);
  context.lineWidth = 1.6;
  context.strokeStyle = line;
  context.stroke(path);
  if (shape === "other") {
    context.beginPath();
    context.arc(9, 9, 1.6, 0, Math.PI * 2);
    context.fillStyle = fill === line ? halo : line;
    context.fill();
  }
  return context.getImageData(0, 0, side, side);
}

/** A band's shape as the key and the list draw it beside its name. Hidden from screen readers: the name is said beside it. */
export function BandMark({ shape, hollow = false, className }: { shape: BandShape; hollow?: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 18 18" aria-hidden className={className ?? "size-3.5 shrink-0"}>
      <path
        d={shapePath(shape)}
        fill={hollow ? "var(--page)" : "var(--ink)"}
        stroke="var(--ink)"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      {shape === "other" ? <circle cx="9" cy="9" r="1.6" fill={hollow ? "var(--ink)" : "var(--page)"} /> : null}
    </svg>
  );
}
