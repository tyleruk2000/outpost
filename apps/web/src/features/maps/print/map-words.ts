/**
 * What a printed map shows, in words, put into its PDF beside the picture.
 *
 * The map on the page is a picture: a search of the file finds nothing in it. So the
 * file also carries a few sentences saying where the map is, how large, at what scale,
 * when it was drawn and which names are written on it. They are real text in the page
 * (`hidden` in sheet.ts: in the file, drawn in no ink), laid over the map they
 * describe, so that the library's reading of the PDF finds them, a search for a
 * village on the map finds the map, and a reader that speaks the page has something to
 * say for the picture.
 *
 * The names are the ones the map's own data gave for what was drawn (print-map.ts),
 * with the person's saved places and routes on the page. A name in a script the PDF's
 * typeface cannot write is left out and counted: the words never hold a "?" where a
 * name should be.
 */
import { type Bbox, formatMgrs, toMaidenhead } from "@outpost/shared";
import { formatBboxSize } from "../lib/geo";
import { encodeWinAnsi, wrapText } from "./helvetica";
import type { Rect } from "./paper";
import { pdfFileName } from "./pdf";
import { formatScale } from "./scale";
import { MUTED, type Sheet, type SheetItem } from "./sheet";

export interface MapWordsInput {
  /** The title the person gave the page, if any. */
  title: string;
  bbox: Bbox;
  /** The 1:n along the middle of the sheet. */
  scale: number;
  /** Already written out: "16 November 2026". */
  date: string;
  /** "A4, portrait" */
  paper: string;
  /** Names written on the map as it was drawn. */
  names: readonly string[];
  /** The person's saved places and routes that are on the page. */
  places: readonly string[];
  routes: readonly string[];
}

/** The most names listed. A sheet of a city at 1:10,000 has several hundred; past this the list says how many more there were. */
export const MOST_NAMES = 250;

const position = (lat: number, lon: number) =>
  `${Math.abs(lat).toFixed(4)}°${lat < 0 ? "S" : "N"} ${Math.abs(lon).toFixed(4)}°${lon < 0 ? "W" : "E"}`;

/** The names the typeface can write, each once whatever its capitals, in the order given; and how many it could not. */
function writable(names: readonly string[]): { kept: string[]; lost: number } {
  const seen = new Set<string>();
  const kept: string[] = [];
  let lost = 0;
  for (const raw of names) {
    const name = raw.replace(/\s+/g, " ").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    seen.add(name.toLowerCase());
    if (encodeWinAnsi(name)) kept.push(name);
    else lost += 1;
  }
  return { kept, lost };
}

/** The sentences, in the order they are read. */
export function mapWords(input: MapWordsInput): string[] {
  const [west, south, east, north] = input.bbox;
  const centre = { lat: (south + north) / 2, lon: (west + east) / 2 };
  const locator = toMaidenhead(centre.lat, centre.lon, 6);
  const mgrs = formatMgrs(centre.lat, centre.lon, 4);
  const references = [locator ? `Maidenhead locator ${locator}` : null, mgrs ? `MGRS ${mgrs}` : null].filter(Boolean).join(", ");
  const title = input.title.trim();
  const sentences = [
    `What this map shows: ${title && encodeWinAnsi(title) ? `${title}. ` : ""}An area of ${formatBboxSize(input.bbox)} centred on ${position(centre.lat, centre.lon)}${
      references ? ` (${references})` : ""
    }, from ${position(south, west)} at its south-west corner to ${position(north, east)} at its north-east. Scale ${formatScale(input.scale)} on ${input.paper}. Drawn by Outpost on ${input.date} from the maps installed then.`,
  ];
  const list = (lead: string, names: readonly string[], most: number) => {
    const { kept, lost } = writable(names);
    if (kept.length === 0 && lost === 0) return;
    const shown = kept.slice(0, most);
    const more = kept.length - shown.length;
    sentences.push(
      `${lead}: ${shown.length > 0 ? shown.join(", ") : "none that this file's typeface can write"}${more > 0 ? `, and ${more} more` : ""}.${
        lost > 0 ? ` ${lost} more ${lost === 1 ? "is" : "are"} in a script this file's typeface cannot write.` : ""
      }`,
    );
  };
  list("Your saved places on it", input.places, MOST_NAMES);
  list("Your routes on it", input.routes, MOST_NAMES);
  // The person's own places are drawn as names on the map too; they are not listed twice.
  const own = new Set([...input.places, ...input.routes].map((name) => name.trim().toLowerCase()));
  list(
    "Names written on it",
    input.names.filter((name) => !own.has(name.trim().toLowerCase())),
    MOST_NAMES,
  );
  return sentences;
}

const SIZE = 5;
const LEADING = 6;

/**
 * The sheet with the sentences added as text that is in the file and drawn in no ink,
 * over the map they describe. Lines that would run past the foot of the map are left
 * off, so nothing is ever placed outside the picture.
 */
export function withMapWords(sheet: Sheet, map: Rect, sentences: readonly string[]): Sheet {
  const items: SheetItem[] = [];
  let y = map.y + 10;
  for (const sentence of sentences) {
    // Everything here was checked on the way in; this is so that a character nobody thought of can never turn a hidden line into a picture.
    const plain = [...sentence].filter((character) => encodeWinAnsi(character)).join("");
    for (const line of wrapText(plain, SIZE, map.width - 16)) {
      if (y > map.y + map.height - 6) break;
      items.push({ kind: "text", x: map.x + 8, y, text: line, size: SIZE, color: MUTED, hidden: true });
      y += LEADING;
    }
    y += 2;
  }
  return { ...sheet, items: [...sheet.items, ...items] };
}

const shortDate = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

/** What the library calls the map: "Map, Helvellyn from Glenridding, 1:25,000, 16 Nov 2026", or by its centre when it has no title. */
export function mapLibraryTitle(title: string, bbox: Bbox, scale: number, made: Date): string {
  const [west, south, east, north] = bbox;
  const where = title.trim() || position((south + north) / 2, (west + east) / 2);
  return `Map, ${where}, ${formatScale(scale)}, ${shortDate.format(made)}`;
}

/** The name the saved file goes by: the library's title for it, so that it says where, at what scale and when. */
export function mapFileName(title: string, bbox: Bbox, scale: number, made: Date): string {
  return pdfFileName(mapLibraryTitle(title, bbox, scale, made));
}

/** The address of the map screen showing about the same ground, for the way back from the library. */
export function mapViewPath(bbox: Bbox, zoom: number): string {
  const [west, south, east, north] = bbox;
  // The page is larger than a screen, so the screen shows the same ground from a little further out.
  return `/maps?lat=${((south + north) / 2).toFixed(4)}&lon=${((west + east) / 2).toFixed(4)}&z=${Math.max(1, zoom - 1).toFixed(1)}`;
}
