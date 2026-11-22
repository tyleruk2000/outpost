/**
 * An estimated radio range as files for other map apps: GPX 1.1 and KML 2.2, made on this device from the answer
 * already on screen, so nothing is fetched to make them.
 *
 * The QR code holds only the point and the heights; these hold the shape. What a file can carry is a line, so the
 * shape is the outline round the furthest ground in sight on each bearing (one corner per bearing, closed), with the
 * typical-range circle and the point itself. Ground inside the outline can still be hidden by nearer ground: the
 * shading on Outpost's map says which, and the file's description says so. With no terrain it is the smooth-Earth
 * radio horizon, a plain circle.
 *
 * KML writes longitude before latitude ("lon,lat"); GPX gives each as an attribute.
 */
import { destinationPoint, type SightRange } from "@outpost/shared";
import { formatHeight, formatKm, rangeExtent, typicalOf } from "@/features/repeaters/map/range";
import { escapeXml } from "../recording/gpx";

/** A closed ring of [longitude, latitude], the first corner repeated at the end. */
export type Ring = Array<[number, number]>;

const round = (value: number) => Number(value.toFixed(6));

function corner(range: SightRange, bearingDeg: number, meters: number): [number, number] {
  const at = destinationPoint(range.at, bearingDeg, meters);
  return [round(at.lon), round(at.lat)];
}

function closed(points: Array<[number, number]>): Ring {
  return points.length === 0 ? [] : [...points, points[0]!];
}

const circle = (range: SightRange, meters: number, steps = 180): Ring =>
  closed(Array.from({ length: steps }, (_, index) => corner(range, (index * 360) / steps, meters)));

export interface RangeShapes {
  /** The furthest ground in sight on each bearing, or the smooth-Earth horizon with no terrain. */
  outline: Ring;
  /** The typical range (half the directions reach further), or null with no terrain or none in sight. */
  typical: { meters: number; ring: Ring } | null;
}

/** The shapes the files hold, or null when no ground is in sight and there is nothing to draw. */
export function rangeShapes(range: SightRange): RangeShapes | null {
  if (range.coverage === "none" || range.bearingCount === 0) {
    const meters = rangeExtent(range);
    return meters > 0 ? { outline: circle(range, meters, 96), typical: null } : null;
  }
  if (rangeExtent(range) <= 0) return null;
  const outline = closed(range.bearings.map((bearing) => corner(range, bearing.bearingDeg, bearing.furthestMeters)));
  const typical = typicalOf(range);
  return { outline, typical: typical && typical > 0 ? { meters: typical, ring: circle(range, typical) } : null };
}

export interface RangeFileInput {
  range: SightRange;
  /** "Estimated range", or a saved place's name. */
  name: string;
  aerialMeters: number;
  /** The other station, in words: "handheld, 1.5 m". */
  station: string;
}

/** What the files say they are, in a sentence or two. */
export function rangeFileDescription({ range, aerialMeters, station }: RangeFileInput): string {
  const estimate = `Estimated radio range from Outpost: line of sight only, for an aerial ${formatHeight(aerialMeters)} above the ground and the other station (${station}). An estimate, not a promise.`;
  if (range.coverage === "none" || range.bearingCount === 0)
    return `${estimate} No terrain was held here, so it is the smooth-Earth radio horizon, as if the ground were flat all round.`;
  return `${estimate} The outline joins the furthest ground in sight on each of ${range.bearingCount} bearings; ground inside it can still be hidden by nearer ground.`;
}

const OUTLINE_NAME = (range: SightRange) =>
  range.coverage === "none" || range.bearingCount === 0 ? "Smooth-Earth radio horizon" : "Furthest ground in sight";

/** GPX 1.1: the point as a waypoint, each ring as a track of one closed segment. Null when there is nothing to draw. */
export function rangeGpx(input: RangeFileInput): string | null {
  const shapes = rangeShapes(input.range);
  if (!shapes) return null;
  const name = escapeXml(input.name);
  const description = escapeXml(rangeFileDescription(input));
  const { lat, lon } = input.range.at;
  const track = (title: string, ring: Ring) =>
    [
      `  <trk>\n    <name>${escapeXml(title)}</name>\n    <trkseg>\n`,
      ...ring.map(([x, y]) => `      <trkpt lat="${y.toFixed(6)}" lon="${x.toFixed(6)}"></trkpt>\n`),
      "    </trkseg>\n  </trk>\n",
    ].join("");
  const ground = input.range.groundMeters;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n',
    `  <metadata>\n    <name>${name}</name>\n    <desc>${description}</desc>\n  </metadata>\n`,
    `  <wpt lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}">${ground === null ? "" : `<ele>${ground.toFixed(1)}</ele>`}<name>${name}</name><desc>${description}</desc></wpt>\n`,
    track(OUTLINE_NAME(input.range), shapes.outline),
    shapes.typical ? track(`Typical range, ${formatKm(shapes.typical.meters)}`, shapes.typical.ring) : "",
    "</gpx>\n",
  ].join("");
}

/** KML 2.2: the point, the outline as a polygon, and the typical range as a line. Null when there is nothing to draw. */
export function rangeKml(input: RangeFileInput): string | null {
  const shapes = rangeShapes(input.range);
  if (!shapes) return null;
  const name = escapeXml(input.name);
  const description = escapeXml(rangeFileDescription(input));
  const coordinates = (ring: Ring) => ring.map(([x, y]) => `${x.toFixed(6)},${y.toFixed(6)}`).join(" ");
  const { lat, lon } = input.range.at;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<kml xmlns="http://www.opengis.net/kml/2.2">\n',
    `<Document>\n  <name>${name}</name>\n  <description>${description}</description>\n`,
    // An outline only: a filled shape would hide the map under it in most apps.
    '  <Style id="outline"><LineStyle><width>2</width></LineStyle><PolyStyle><fill>0</fill></PolyStyle></Style>\n',
    `  <Placemark>\n    <name>${name}</name>\n    <Point><coordinates>${lon.toFixed(6)},${lat.toFixed(6)}</coordinates></Point>\n  </Placemark>\n`,
    `  <Placemark>\n    <name>${escapeXml(OUTLINE_NAME(input.range))}</name>\n    <styleUrl>#outline</styleUrl>\n`,
    `    <Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coordinates(shapes.outline)}</coordinates></LinearRing></outerBoundaryIs></Polygon>\n  </Placemark>\n`,
    shapes.typical
      ? `  <Placemark>\n    <name>${escapeXml(`Typical range, ${formatKm(shapes.typical.meters)}`)}</name>\n    <LineString><tessellate>1</tessellate><coordinates>${coordinates(shapes.typical.ring)}</coordinates></LineString>\n  </Placemark>\n`
      : "",
    "</Document>\n</kml>\n",
  ].join("");
}

/** A name fit for a downloaded file: "Estimated range.kml", "Range from Hill top.gpx". */
export function rangeFileName(name: string, extension: "gpx" | "kml"): string {
  const cleaned = name
    .replace(/[^\p{L}\p{N} _.-]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${cleaned || "Estimated range"}.${extension}`;
}

/** Hands the browser a file to save. Made here; nothing is sent anywhere. */
export function downloadText(filename: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
