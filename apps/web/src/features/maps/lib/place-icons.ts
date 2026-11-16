/**
 * The drawings of the icons a saved place can carry, and their names.
 *
 * Each is a few strokes on a 24 × 24 grid, in the line style of the icons the rest of
 * the app uses (Lucide: round ends, round joins, no fill unless a shape is too small to
 * read as an outline), and drawn to be told apart at the size a marker has on a phone,
 * about 15 pixels across. That rules out most of the detail an interface icon can carry,
 * so these were drawn for the job rather than taken from the interface set: a tent is
 * two poles and a flap, a car park is the letter P.
 *
 * The same strokes are used three ways, so that an icon is the same shape everywhere:
 * as SVG in the lists and the editor (`ui.tsx`), drawn into small pictures for the map
 * to place (`map/place-images.ts`), and through those on a printed map. Nothing is
 * fetched: they are part of the app.
 */
import { MARKER_ICONS, type MarkerColor, type MarkerIcon } from "@outpost/shared";
import { MARKER_HEX } from "./palette";

export interface PlaceGlyph {
  /** Stroked paths, as SVG path data. */
  strokes: string[];
  /** Filled shapes, for the parts too small to read as an outline. */
  fills?: string[];
}

export type DrawnIcon = Exclude<MarkerIcon, "pin">;

const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;

export const PLACE_GLYPHS: Record<DrawnIcon, PlaceGlyph> = {
  // A closed house: roof, walls and a door.
  home: { strokes: ["M3.5 11.5 12 4l8.5 7.5", "M6 9.8V20h12V9.8", "M10 20v-5.5h4V20"] },
  // A roof on two posts with nothing between them: a shelter open to the weather, a bothy, a hut.
  shelter: { strokes: ["M2.5 12.5 12 4.5l9.5 8", "M6 9.8V20.5", "M18 9.8V20.5"] },
  // Two crossed poles, the flap between them, and the ground.
  tent: { strokes: ["M4.5 19.5 13.5 4.5", "M19.5 19.5 10.5 4.5", "M15 19.5l-3-5-3 5", "M3 19.5h18"] },
  parking: { strokes: ["M8.5 20V4.5h5a4.5 4.5 0 0 1 0 9h-5"] },
  water: { strokes: ["M12 3.5C12 3.5 5.5 10.2 5.5 14.5a6.5 6.5 0 0 0 13 0C18.5 10.2 12 3.5 12 3.5Z"] },
  // A fork and a knife.
  food: { strokes: ["M5.5 4v4.5a3 3 0 0 0 6 0V4", "M8.5 4v16", "M17.5 20v-7h-3c0-4 1-7 3-9v9"] },
  // The cross of a first-aid box.
  "first-aid": { strokes: [], fills: ["M9.2 4h5.6v5.2H20v5.6h-5.2V20H9.2v-5.2H4V9.2h5.2Z"] },
  // A pump: the body, its window, the ground, and the hose.
  fuel: {
    strokes: [
      "M4.5 20V6A1.5 1.5 0 0 1 6 4.5h6A1.5 1.5 0 0 1 13.5 6v14",
      "M3 20h12",
      "M4.5 10.5h9",
      "M13.5 13h1.8a1.5 1.5 0 0 1 1.5 1.5v2.2a1.7 1.7 0 0 0 3.4 0V9.5L17 6.3",
    ],
  },
  // Two peaks.
  summit: { strokes: ["M2.5 19.5 9 6l4.3 8 2.4-3.4 5.8 8.9Z"] },
  // An eye.
  viewpoint: {
    strokes: ["M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"],
    fills: [circle(12, 12, 2.6)],
  },
  // A mast on its legs, sending.
  mast: {
    strokes: ["M7.5 20.5 12 9l4.5 11.5", "M6.6 3.6a7 7 0 0 0 0 9.8", "M17.4 3.6a7 7 0 0 1 0 9.8"],
    fills: [circle(12, 8.5, 2)],
  },
  // Two people.
  meeting: {
    strokes: [circle(8, 8.3, 2.6), circle(16.5, 9.3, 2.2), "M3 19.5a5 5 0 0 1 10 0", "M15 14.9a4.4 4.4 0 0 1 6 4.6"],
  },
  // A warning triangle.
  danger: { strokes: ["M12 4.2 21.2 19.5H2.8Z", "M12 10v4.2"], fills: [circle(12, 16.8, 0.9)] },
  star: { strokes: ["M12 3.8 14.17 9.61 20.37 9.88 15.52 13.74 17.17 19.72 12 16.3 6.83 19.72 8.48 13.74 3.63 9.88 9.83 9.61Z"] },
  flag: { strokes: ["M6 21V4", "M6 4.5h11.5l-2.8 4 2.8 4H6"] },
};

/** What each icon is called, in the editor and to a screen reader. */
export const PLACE_ICON_NAMES: Record<MarkerIcon, string> = {
  pin: "Pin",
  home: "Home",
  shelter: "Shelter or hut",
  tent: "Camp",
  parking: "Car park",
  water: "Water",
  food: "Food",
  "first-aid": "First aid",
  fuel: "Fuel",
  summit: "Summit",
  viewpoint: "Viewpoint",
  mast: "Radio mast",
  meeting: "Meeting point",
  danger: "Danger",
  star: "Star",
  flag: "Flag",
};

/**
 * A place's icon, whatever it was given as. A place kept on a phone before there were
 * icons has none, and a newer Outpost may name one this one does not draw: both are the
 * plain pin.
 */
export function iconOf(place: { icon?: string | null }): MarkerIcon {
  return (MARKER_ICONS as readonly string[]).includes(place.icon ?? "") ? (place.icon as MarkerIcon) : "pin";
}

/** Whether an icon is one that is drawn; the plain pin is a dot. */
export const isDrawn = (icon: MarkerIcon): icon is DrawnIcon => icon !== "pin";

/**
 * The colour an icon is drawn in on top of a marker colour: white where that reaches
 * 3:1 against it, which is every colour but amber, and near-black on amber.
 */
export const GLYPH_ON: Record<MarkerColor, string> = {
  teal: "#ffffff",
  amber: "#161e21",
  red: "#ffffff",
  green: "#ffffff",
  blue: "#ffffff",
  violet: "#ffffff",
  slate: "#ffffff",
};

/** WCAG contrast between two hex colours: for the test that holds `GLYPH_ON` to its rule. */
export function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channel = (index: number) => {
      const value = Number.parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16) / 255;
      return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(0) + 0.7152 * channel(1) + 0.0722 * channel(2);
  };
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (light + 0.05) / (dark + 0.05);
}

// ── On the map ──────────────────────────────────────────────────────────────

/** A marker with an icon is a disc this many pixels across, inside a ring of the page colour. */
export const BADGE = { radius: 11, ring: 2, glyph: 15, strokeWidth: 2.4 } as const;

/**
 * The name of the picture the map draws for a place with an icon: the disc in the
 * place's colour, the ring round it in the page colour of the map's theme, and the icon.
 * The name says everything the picture depends on ("place-tent-teal-ffffff"), so the map
 * can ask for one it has not got and be given it (`map/place-images.ts`).
 */
export const PLACE_IMAGE_PREFIX = "place-";

/** The page colour as the last part of a picture's name: six hex digits. Anything else is taken as white. */
export const pageKey = (page: string): string => (/^#[0-9a-f]{6}$/i.test(page) ? page.slice(1).toLowerCase() : "ffffff");

export const placeImageId = (icon: DrawnIcon, color: MarkerColor, page: string): string =>
  `${PLACE_IMAGE_PREFIX}${icon}-${color}-${pageKey(page)}`;

export function parsePlaceImageId(id: string): { icon: DrawnIcon; color: MarkerColor; page: string } | null {
  const match = /^place-([a-z-]+)-([a-z]+)-([0-9a-f]{6})$/.exec(id);
  if (!match) return null;
  const [, icon, color, page] = match as unknown as [string, string, string, string];
  if (!Object.hasOwn(PLACE_GLYPHS, icon) || !Object.hasOwn(MARKER_HEX, color)) return null;
  return { icon: icon as DrawnIcon, color: color as MarkerColor, page: `#${page}` };
}

/** The icon of a place as the pin on the map carries it while the place is being edited or moved; nothing for a plain pin. */
export function pinGlyphOf(
  icon: MarkerIcon,
  color: MarkerColor,
): { id: string; strokes: string[]; fills?: string[]; color: string } | undefined {
  if (!isDrawn(icon)) return undefined;
  return { id: `${icon}-${color}`, ...PLACE_GLYPHS[icon], color: GLYPH_ON[color] };
}
