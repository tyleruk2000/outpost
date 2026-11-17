/**
 * The marks of the food and supplies layer: one small drawing for each kind of place, on
 * a rounded square in the layer's colour.
 *
 * They are drawn in the line style of the saved places' icons (`lib/place-icons.ts`: a few
 * strokes on a 24 × 24 grid, round ends and joins), and three of them are those icons
 * (water, fuel, the cross). The square tells them apart from a person's own places, which
 * are round; it is filled, as every published public record is. The same strokes are used
 * on the map (drawn into small pictures the map asks for by name, `drawFoodImage`) and in
 * the legend and lists (`FoodMark`), so a kind is the same shape everywhere. Nothing is
 * fetched.
 */
import { FOOD_KINDS, type FoodKind } from "@outpost/shared";
import { PLACE_GLYPHS, type PlaceGlyph } from "@/features/maps/lib/place-icons";

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

export const FOOD_GLYPHS: Record<FoodKind, PlaceGlyph> = {
  // A trolley.
  "food:supermarket": { strokes: ["M2.5 4.5h2.8l2.3 10.5h10.6l2-7.5H6.4"], fills: [circle(9, 19.3, 1.6), circle(17, 19.3, 1.6)] },
  // A shopping bag.
  "food:small-shop": { strokes: ["M5 8.5h14l-1 11.5H6Z", "M9 8.5V7a3 3 0 0 1 6 0v1.5"] },
  // An apple and its stalk.
  "food:greengrocer": {
    strokes: [
      "M12 8c-2-1.5-7.5-1.8-7.5 4.3 0 4.5 3 8.2 5.2 8.2.9 0 1.4-.5 2.3-.5s1.4.5 2.3.5c2.2 0 5.2-3.7 5.2-8.2C19.5 6.2 14 6.5 12 8Z",
      "M12 8c0-2.2.9-3.6 2.6-4.5",
    ],
  },
  // A cleaver.
  "food:butcher": { strokes: ["M3 6h11.5v8.5H5.2A2.2 2.2 0 0 1 3 12.3Z", "M14.5 9.5h6.5"], fills: [circle(6, 9, 1)] },
  // A loaf, scored.
  "food:baker": {
    strokes: ["M3.5 18.5V13c0-4 3.8-6.5 8.5-6.5s8.5 2.5 8.5 6.5v5.5Z", "M8.5 10l-1.6 3", "M12.8 9.5l-1.6 3", "M17 10.3l-1.4 2.7"],
  },
  // An ear of wheat.
  "food:farm-shop": {
    strokes: [
      "M12 21V4",
      "M12 9.5C9.4 9.5 8 7.9 8 5.5c2.6 0 4 1.6 4 4Z",
      "M12 9.5c2.6 0 4-1.6 4-4-2.6 0-4 1.6-4 4Z",
      "M12 15c-2.6 0-4-1.6-4-4 2.6 0 4 1.6 4 4Z",
      "M12 15c2.6 0 4-1.6 4-4-2.6 0-4 1.6-4 4Z",
    ],
  },
  // A stall: an awning on two posts.
  "food:market": {
    strokes: ["M3 9.5 5 4.5h14l2 5", "M3 9.5a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0", "M5 12.5V20", "M19 12.5V20", "M3 20h18"],
  },
  // A basket.
  "food:retailer": { strokes: ["M3 10h18l-2.2 9.5H5.2Z", "M7.5 10l3-5.5", "M16.5 10l-3-5.5", "M9.5 13.5v3", "M14.5 13.5v3"] },
  // A heart.
  "food:food-bank": { strokes: ["M12 19.5S4.5 15 4.5 9.6A3.9 3.9 0 0 1 12 7.8a3.9 3.9 0 0 1 7.5 1.8C19.5 15 12 19.5 12 19.5Z"] },
  "food:water": PLACE_GLYPHS.water,
  "food:fuel": PLACE_GLYPHS.fuel,
  "food:pharmacy": PLACE_GLYPHS["first-aid"],
};

/** The tile: its side, the corner, the ring of the page colour round it, and the drawing on it. */
export const FOOD_TILE = { side: 19, corner: 5, ring: 1.5, glyph: 13, strokeWidth: 2.5 } as const;

const slug = (kind: string) => kind.replace(/^food:/, "");
const KIND_BY_SLUG = new Map<string, FoodKind>(FOOD_KINDS.map((entry) => [slug(entry.kind), entry.kind]));

/** The name of a kind's picture on the map: "food-baker-1f9aa8-ffffff" (kind, the tile's colour, the page's). */
export const FOOD_IMAGE_PREFIX = "food-";
export const foodImageId = (kind: string, colour: string, page: string) =>
  `${FOOD_IMAGE_PREFIX}${slug(kind)}-${colour.replace("#", "").toLowerCase()}-${page.replace("#", "").toLowerCase()}`;

export function parseFoodImageId(id: string): { kind: FoodKind; colour: string; page: string } | null {
  const match = /^food-([a-z-]+)-([0-9a-f]{6})-([0-9a-f]{6})$/.exec(id);
  const kind = match ? KIND_BY_SLUG.get(match[1]!) : undefined;
  return match && kind ? { kind, colour: `#${match[2]}`, page: `#${match[3]}` } : null;
}

/** The side of a picture in the map's own pixels: the tile, its ring and a pixel to spare. */
export const FOOD_IMAGE_SIZE = FOOD_TILE.side + FOOD_TILE.ring * 2 + 2;

function roundedSquare(context: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, side: number, r: number) {
  context.beginPath();
  context.moveTo(x + r, x);
  context.arcTo(x + side, x, x + side, x + side, r);
  context.arcTo(x + side, x + side, x, x + side, r);
  context.arcTo(x, x + side, x, x, r);
  context.arcTo(x, x, x + side, x, r);
  context.closePath();
}

/** Draws a kind's picture at `ratio` device pixels to each of the map's; null for a name that is not one, or with no canvas. */
export function drawFoodImage(id: string, ratio: number): ImageData | null {
  const spec = parseFoodImageId(id);
  if (!spec) return null;
  const side = Math.round(FOOD_IMAGE_SIZE * ratio);
  const canvas = typeof OffscreenCanvas === "undefined" ? document.createElement("canvas") : new OffscreenCanvas(side, side);
  canvas.width = side;
  canvas.height = side;
  const context = canvas.getContext("2d") as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!context) return null;
  context.scale(ratio, ratio);
  const outer = FOOD_TILE.side + FOOD_TILE.ring * 2;
  const start = (FOOD_IMAGE_SIZE - outer) / 2;
  roundedSquare(context, start, outer, FOOD_TILE.corner + FOOD_TILE.ring);
  context.fillStyle = spec.page;
  context.fill();
  roundedSquare(context, start + FOOD_TILE.ring, FOOD_TILE.side, FOOD_TILE.corner);
  context.fillStyle = spec.colour;
  context.fill();
  const middle = FOOD_IMAGE_SIZE / 2;
  context.translate(middle - FOOD_TILE.glyph / 2, middle - FOOD_TILE.glyph / 2);
  context.scale(FOOD_TILE.glyph / 24, FOOD_TILE.glyph / 24);
  const glyph = FOOD_GLYPHS[spec.kind];
  context.strokeStyle = "#ffffff";
  context.fillStyle = "#ffffff";
  context.lineWidth = FOOD_TILE.strokeWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const path of glyph.strokes) context.stroke(new Path2D(path));
  for (const path of glyph.fills ?? []) context.fill(new Path2D(path));
  return context.getImageData(0, 0, side, side);
}

/** A kind's mark as the map draws it, for the legend and lists. Its name is said beside it, so it is hidden from screen readers. */
export function FoodMark({ kind, colour, className }: { kind: string; colour: string; className?: string }) {
  const glyph = FOOD_GLYPHS[kind as FoodKind];
  if (!glyph) return null;
  const scale = FOOD_TILE.glyph / 24;
  const offset = (22 - FOOD_TILE.glyph) / 2;
  return (
    <svg viewBox="0 0 22 22" className={className ?? "size-[22px] shrink-0"} aria-hidden>
      <rect x="1.5" y="1.5" width="19" height="19" rx={FOOD_TILE.corner} fill={colour} />
      <g
        transform={`translate(${offset} ${offset}) scale(${scale})`}
        stroke="#ffffff"
        fill="none"
        strokeWidth={FOOD_TILE.strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {glyph.strokes.map((path) => (
          <path key={path} d={path} />
        ))}
        {(glyph.fills ?? []).map((path) => (
          <path key={path} d={path} fill="#ffffff" stroke="none" />
        ))}
      </g>
    </svg>
  );
}
