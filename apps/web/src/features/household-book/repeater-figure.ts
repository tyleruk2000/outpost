/**
 * The map of a place's repeaters in the household book: the offline map where one was
 * drawn (or a plain grid to scale where none is installed), the place or the journey's
 * line, each repeater as a triangle with its callsign, and round each its likely range as
 * a circle, dashed differently by band so that greyscale keeps them apart. The frame, the
 * scale bar and north are the nuclear and binder maps' own (`mapFigureBlock`).
 *
 * Pure: the picture comes in as data addresses; nothing is fetched.
 */
import { bandOfHz, destinationPoint, type RepeaterBand } from "@outpost/shared";
import type { Content } from "pdfmake/interfaces";
import { PT_PER_MAP_PX } from "@/features/maps/print/paper";
import { mercatorX, mercatorY, paperPoints, scaleForZoom } from "@/features/maps/print/scale";
import { mapFigureBlock, type PicturePiece } from "@/features/nuclear/print-figures";
import { PRINT_COLOURS as C, escapeSvg, figure, PRINT_FONT, round, sheetItemsToSvg } from "@/features/print-kit";
import {
  type BookRepeaterRange,
  horizonRange,
  placeLabel,
  type RepeaterGroup,
  type RepeaterLocation,
  repeaterMapFrame,
} from "./book-repeaters";

/** The offline map under a place's repeaters, drawn on the screen before the book is made. */
export interface BookRepeaterMap {
  pieces: PicturePiece[];
  /** Each piece's picture as a data address. */
  pictures: ReadonlyMap<string, string>;
  /** The map's credits, written out. */
  credits: string | null;
}

/** Room under the scale bar for the key. */
const KEY_HEIGHT = 14;

/** How each band's circle is drawn: colour and dash, so that the dash alone tells them apart. */
export const BAND_STYLES = [
  { id: "2m", words: "2 m", colour: C.accent, dash: "7 3" },
  { id: "70cm", words: "70 cm", colour: C.know, dash: "2 2" },
  { id: "other", words: "Other bands", colour: C.warn, dash: "7 2 1.5 2" },
] as const;

export const bandStyle = (band: RepeaterBand) => BAND_STYLES.find((style) => style.id === band) ?? BAND_STYLES[2];

const bandOf = (repeater: { band: RepeaterBand; outputHz: number }) =>
  repeater.band === "other" ? bandOfHz(repeater.outputHz) : repeater.band;

const text = (x: number, y: number, words: string, size: number, options: { bold?: boolean; fill?: string; anchor?: string } = {}) =>
  `<text x="${round(x)}" y="${round(y)}" font-family="${PRINT_FONT}" font-size="${size}"${options.bold ? ' font-weight="bold"' : ""} fill="${options.fill ?? C.ink}" text-anchor="${options.anchor ?? "start"}">${escapeSvg(words)}</text>`;

/** Words on a white patch, so that they read over the map. Atkinson Hyperlegible averages a little over half its size a letter. */
const labelled = (x: number, y: number, words: string, size: number, bold = false) => {
  const width = words.length * size * 0.56 + 3;
  return `<rect x="${round(x - 1.5)}" y="${round(y - size + 0.5)}" width="${round(width)}" height="${round(size + 2)}" fill="#ffffff" fill-opacity="0.85"/>${text(x, y, words, size, { bold })}`;
};

export interface RepeaterFigureInput {
  group: RepeaterGroup;
  /** Every place in the book: those inside this map's frame are marked too. */
  locations: readonly RepeaterLocation[];
  ranges: Readonly<Record<string, BookRepeaterRange>>;
  map: BookRepeaterMap | null;
  /** Why there is no map under it, when none was drawn. */
  missing: string | null;
  measure: number;
}

/** The figure, with its title and caption. */
export function repeaterFigure(input: RepeaterFigureInput): Content {
  const { svg, caption } = repeaterMapSvg(input);
  return figure(svg, { title: `Repeaters: ${placeLabel(input.group.location)}`, caption, width: input.measure });
}

export function repeaterMapSvg(input: RepeaterFigureInput): { svg: string; caption: string; height: number } {
  const { group, measure } = input;
  const { size, frame } = repeaterMapFrame(group, measure);
  const block = mapFigureBlock(
    { part: "overview", width: size.width, height: size.height, frame, pieces: input.map?.pieces ?? [], captions: [] },
    measure,
  );
  if (block.kind !== "drawing") throw new Error("A map figure is a drawing.");
  // Centred across the measure, as the picture is.
  const left = (measure - size.width) / 2;
  const height = block.height + KEY_HEIGHT;
  const base = sheetItemsToSvg(block.draw(left, 0, size.width), { x: 0, y: 0, width: measure, height }, input.map?.pictures ?? new Map());
  const world = 512 * 2 ** frame.zoom * PT_PER_MAP_PX;
  const at = (lat: number, lon: number): [number, number] => [
    left + size.width / 2 + (mercatorX(lon) - mercatorX(frame.center.lon)) * world,
    size.height / 2 + (mercatorY(lat) - mercatorY(frame.center.lat)) * world,
  ];
  const out: string[] = [];
  const clip = `rc-${group.location.key}`;
  out.push(
    `<defs><clipPath id="${clip}"><rect x="${round(left)}" y="0" width="${round(size.width)}" height="${round(size.height)}"/></clipPath></defs>`,
  );
  out.push(`<g clip-path="url(#${clip})">`);

  // A grid to scale where there is no map under it: a line every round number of kilometres.
  const scale = scaleForZoom(frame.zoom, frame.center.lat);
  if (!input.map || input.map.pieces.length === 0) {
    const spanMeters = (size.width / paperPoints(1000, scale)) * 1000;
    const stepKm = [1, 2, 5, 10, 20, 50, 100].find((step) => spanMeters / (step * 1000) <= 8) ?? 200;
    const step = paperPoints(stepKm * 1000, scale);
    const [cx, cy] = at(group.location.lat, group.location.lon);
    for (let x = cx - Math.ceil((cx - left) / step) * step; x <= left + size.width; x += step)
      out.push(`<line x1="${round(x)}" y1="0" x2="${round(x)}" y2="${round(size.height)}" stroke="${C.rule}" stroke-width="0.4"/>`);
    for (let y = cy - Math.ceil(cy / step) * step; y <= size.height; y += step)
      out.push(
        `<line x1="${round(left)}" y1="${round(y)}" x2="${round(left + size.width)}" y2="${round(y)}" stroke="${C.rule}" stroke-width="0.4"/>`,
      );
    out.push(text(left + size.width - 4, size.height - 4, `Grid lines ${stepKm} km apart`, 6, { fill: C.muted, anchor: "end" }));
  }

  // The ranges first, under everything else.
  const shown = [...group.chosen, ...group.also];
  const rangeOf = (repeater: (typeof shown)[number]["repeater"]) => input.ranges[repeater.id] ?? horizonRange(repeater);
  for (const { repeater } of shown) {
    const style = bandStyle(bandOf(repeater));
    const meters = rangeOf(repeater).meters;
    const points = Array.from({ length: 96 }, (_, index) => {
      const point = destinationPoint({ lat: repeater.lat, lon: repeater.lon }, (index * 360) / 96, meters);
      return at(point.lat, point.lon);
    });
    out.push(
      `<path d="M${points.map(([x, y]) => `${round(x)},${round(y)}`).join(" L")} Z" fill="none" stroke="${style.colour}" stroke-width="1.2" stroke-dasharray="${style.dash}"/>`,
    );
  }

  // The journey's line, and the other places in the frame.
  const location = group.location;
  if (location.to) {
    const [x1, y1] = at(location.lat, location.lon);
    const [x2, y2] = at(location.to.lat, location.to.lon);
    out.push(`<line x1="${round(x1)}" y1="${round(y1)}" x2="${round(x2)}" y2="${round(y2)}" stroke="${C.ink}" stroke-width="1.6"/>`);
    // The end, named, unless one of our places is there already and says it.
    const end = location.to;
    if (!input.locations.some((each) => !each.to && Math.abs(each.lat - end.lat) < 1e-4 && Math.abs(each.lon - end.lon) < 1e-4)) {
      out.push(`<circle cx="${round(x2)}" cy="${round(y2)}" r="3.5" fill="#ffffff" stroke="${C.ink}" stroke-width="1.4"/>`);
      out.push(labelled(x2 + 6, y2 + 3, location.name, 7.5, true));
    }
  }
  const inFrame = ([x, y]: [number, number]) => x >= left && x <= left + size.width && y >= 0 && y <= size.height;
  let homeShown = false;
  let placeShown = false;
  for (const other of input.locations) {
    if (other.to) continue;
    const point = at(other.lat, other.lon);
    if (!inFrame(point)) continue;
    const mine = other.key === location.key || (location.to && other.kind === "home");
    const [x, y] = point;
    out.push(
      `<rect x="${round(x - 4.5)}" y="${round(y - 4.5)}" width="9" height="9" fill="${other.kind === "home" ? C.ink : "#ffffff"}" stroke="${C.ink}" stroke-width="1.2"/>`,
    );
    const words = other.kind === "home" ? placeLabel(other) : other.name;
    const fontSize = mine ? 7.5 : 6.5;
    // Home's name to its left, the others' to their right: a meeting point is often just beside home.
    out.push(labelled(other.kind === "home" ? x - 7 - words.length * fontSize * 0.56 : x + 7, y + 3, words, fontSize, Boolean(mine)));
    if (other.kind === "home") homeShown = true;
    else placeShown = true;
  }

  // Each repeater: a triangle in its band's colour, and its callsign.
  for (const { repeater } of shown) {
    const style = bandStyle(bandOf(repeater));
    const [x, y] = at(repeater.lat, repeater.lon);
    out.push(
      `<path d="M${round(x)},${round(y - 5)} L${round(x + 4.6)},${round(y + 3)} L${round(x - 4.6)},${round(y + 3)} Z" fill="${style.colour}" stroke="${C.ink}" stroke-width="0.7"/>`,
    );
    out.push(labelled(x + 6, y - 2, repeater.callsign, 6.5, true));
  }
  out.push("</g>");

  // The key, under the scale bar: what each band's dash means, and the marks.
  const bands = BAND_STYLES.filter((style) => shown.some(({ repeater }) => bandStyle(bandOf(repeater)).id === style.id));
  const home = input.locations.find((each) => each.kind === "home");
  const rows = [
    ...bands.map((style) => ({
      mark: `<line x1="0" y1="-2.5" x2="16" y2="-2.5" stroke="${style.colour}" stroke-width="1.4" stroke-dasharray="${style.dash}"/>`,
      words: `${style.words}: likely range`,
    })),
    { mark: `<path d="M8,-7 L12,0 L4,0 Z" fill="${C.muted}" stroke="${C.ink}" stroke-width="0.7"/>`, words: "Repeater" },
    ...(homeShown && home ? [{ mark: `<rect x="4" y="-7.5" width="8" height="8" fill="${C.ink}"/>`, words: placeLabel(home) }] : []),
    ...(placeShown
      ? [{ mark: `<rect x="4" y="-7.5" width="8" height="8" fill="#ffffff" stroke="${C.ink}" stroke-width="1"/>`, words: "Our place" }]
      : []),
    ...(location.to
      ? [{ mark: `<line x1="0" y1="-3" x2="16" y2="-3" stroke="${C.ink}" stroke-width="1.6"/>`, words: "The straight line" }]
      : []),
  ];
  let keyX = left;
  const keyY = block.height + KEY_HEIGHT - 6;
  for (const row of rows) {
    out.push(`<g transform="translate(${round(keyX)} ${round(keyY)})">${row.mark}</g>`, text(keyX + 20, keyY, row.words, 6.5));
    keyX += 20 + row.words.length * 3.6 + 12;
  }

  const svg = base.replace(/<\/svg>$/, `${out.join("")}</svg>`);
  return {
    svg,
    caption: captionOf(
      input,
      shown.map((each) => each.repeater),
      rangeOf,
    ),
    height,
  };
}

function captionOf(
  input: RepeaterFigureInput,
  shown: ReadonlyArray<RepeaterGroup["chosen"][number]["repeater"]>,
  rangeOf: (repeater: RepeaterGroup["chosen"][number]["repeater"]) => BookRepeaterRange,
): string {
  const ranges = shown.map((repeater) => ({ repeater, range: rangeOf(repeater) }));
  const terrain = ranges.filter((each) => each.range.basis === "terrain");
  const flat = ranges.filter((each) => each.range.basis === "horizon");
  const km = (meters: number) => `${formatKm(meters)} km`;
  const lines: string[] = [];
  if (terrain.length > 0)
    lines.push(
      `Circles for ${terrain.map((each) => `${each.repeater.callsign} (${km(each.range.meters)})`).join(", ")}: the typical range worked out from the terrain installed, as on the map's estimated range, for a handheld held at head height.`,
    );
  if (flat.length > 0)
    lines.push(
      `Circles for ${flat.map((each) => `${each.repeater.callsign} (${km(each.range.meters)})`).join(", ")}: the smooth-Earth radio horizon between the repeater's aerial (${
        flat.every((each) => !each.range.aerialListed)
          ? `${flat[0]!.range.aerialMeters} m above the ground, assumed: the list gives no height`
          : "its height as listed, or 10 m where the list gives none"
      }) and a handheld at head height, as if the ground were flat.`,
    );
  lines.push(
    "**A rough guide, not a coverage prediction.** Hills and buildings block VHF and UHF, so a repeater out of sight behind a hill may not be heard even inside its circle, and one on high ground may be heard well beyond it.",
  );
  if (input.map?.credits) lines.push(`Map: ${input.map.credits}.`);
  else lines.push(input.missing ?? "No offline map was drawn under it: the places and repeaters are drawn to scale on a plain grid.");
  return lines.join(" ");
}

const formatKm = (meters: number) => {
  const km = meters / 1000;
  return km >= 10 ? String(Math.round(km)) : String(Math.round(km * 2) / 2);
};
