/**
 * A planned route as GPX 1.1, made on this device for a walking or driving app, a
 * handheld GPS or another map: the line as a track, the start, via points and end as
 * waypoints, and every line of the directions as a route point named with its
 * instruction. The credit goes in the file's metadata, and the warnings (a ferry, a far
 * snap) in the track's description, so they travel with it.
 */
import type { RoadRouteResult, SavedRouteResult, StreetDirections, StreetsRouteResult } from "@outpost/shared";
import { escapeXml, gpxFileName, gpxTime } from "../recording/gpx";

type LonLat = [number, number];

interface GpxPoint {
  at: LonLat;
  name: string;
  desc?: string;
  type?: string;
}

const coord = ([lon, lat]: LonLat) => `lat="${lat.toFixed(6)}" lon="${lon.toFixed(6)}"`;

function pointXml(tag: "wpt" | "rtept", point: GpxPoint, indent: string): string {
  // GPX's order inside a point: name, then desc, then type.
  const inner = [
    `<name>${escapeXml(point.name)}</name>`,
    point.desc ? `<desc>${escapeXml(point.desc)}</desc>` : "",
    point.type ? `<type>${escapeXml(point.type)}</type>` : "",
  ].join("");
  return `${indent}<${tag} ${coord(point.at)}>${inner}</${tag}>\n`;
}

/** The credit, as one line: a road route keeps it in `credit.line`, a route on streets as a sentence. */
const creditOf = (route: SavedRouteResult) => (typeof route.credit === "string" ? route.credit : route.credit.line);

/** The start, via points and end, with their names. */
function endsOf(route: SavedRouteResult): GpxPoint[] {
  const named = (index: number, last: number, name: string | null | undefined) => {
    const role = index === 0 ? "Start" : index === last ? "End" : `Via ${index}`;
    return name?.trim() ? `${role}: ${name.trim()}` : role;
  };
  if (!("mode" in route) || route.road) {
    const snapped = "mode" in route ? route.road!.snapped : route.snapped;
    const asked = "mode" in route ? route.request.points : null;
    const last = snapped.length - 1;
    return snapped.map((point, index) => {
      // A door-to-door drive's ends are the doors asked for; its road route's are where it met the main roads.
      const door = asked && (index === 0 || index === last) ? asked[index === 0 ? 0 : asked.length - 1] : null;
      const at: LonLat = door && "lat" in door ? [door.lon, door.lat] : [point.input.lon, point.input.lat];
      return { at, name: named(index, last, point.input.name), type: index === 0 ? "start" : index === last ? "end" : "via" };
    });
  }
  const points = route.request.points;
  const line = route.geometry.coordinates.flat();
  const last = points.length - 1;
  return points.flatMap((point, index): GpxPoint[] => {
    const at: LonLat | undefined =
      "lat" in point ? [point.lon, point.lat] : index === 0 ? line[0] : index === last ? line.at(-1) : undefined;
    return at ? [{ at, name: named(index, last, point.name), type: index === 0 ? "start" : index === last ? "end" : "via" }] : [];
  });
}

const streetPoints = (directions: StreetDirections | null): GpxPoint[] =>
  (directions?.lines ?? []).map((line) => ({
    at: line.at,
    name: line.text,
    ...(line.distanceText ? { desc: `${line.text}, then ${line.distanceText}` } : {}),
    type: line.kind,
  }));

const roadPoints = (route: RoadRouteResult): GpxPoint[] =>
  route.legs.map((leg) => ({ at: leg.start, name: leg.title, desc: leg.detail, type: leg.kind }));

/** Every line of the directions, in order, where it happens. */
function turnsOf(route: SavedRouteResult): GpxPoint[] {
  if (!("mode" in route)) return roadPoints(route);
  const streets = route as StreetsRouteResult;
  if (streets.road) return [...streetPoints(streets.start), ...roadPoints(streets.road), ...streetPoints(streets.end)];
  return streetPoints(streets.streets);
}

export interface BuiltRouteGpx {
  gpx: string;
  waypoints: number;
  routePoints: number;
  trackPoints: number;
}

export function buildRouteGpx(route: SavedRouteResult, name: string): BuiltRouteGpx {
  const title = escapeXml(name.trim() || "Route");
  const lines = route.geometry.coordinates.filter((line) => line.length >= 2);
  const all = lines.flat();
  const lats = all.map(([, lat]) => lat);
  const lons = all.map(([lon]) => lon);
  const bounds =
    all.length > 0
      ? `    <bounds minlat="${Math.min(...lats).toFixed(6)}" minlon="${Math.min(...lons).toFixed(6)}" maxlat="${Math.max(...lats).toFixed(6)}" maxlon="${Math.max(...lons).toFixed(6)}"/>\n`
      : "";
  const ends = endsOf(route);
  const turns = turnsOf(route);
  const warnings = route.warnings.join(" ");

  const parts: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<gpx version="1.1" creator="Outpost" xmlns="http://www.topografix.com/GPX/1/1">\n',
    "  <metadata>\n",
    `    <name>${title}</name>\n`,
    `    <desc>${escapeXml(`Planned in advance, not live. ${creditOf(route)}`)}</desc>\n`,
    `    <time>${gpxTime(route.plannedAt)}</time>\n`,
    bounds,
    "  </metadata>\n",
    ...ends.map((point) => pointXml("wpt", point, "  ")),
  ];
  if (turns.length > 0) {
    parts.push(`  <rte>\n    <name>${title}</name>\n`);
    for (const point of turns) parts.push(pointXml("rtept", point, "    "));
    parts.push("  </rte>\n");
  }
  if (lines.length > 0) {
    parts.push(`  <trk>\n    <name>${title}</name>\n${warnings ? `    <desc>${escapeXml(warnings)}</desc>\n` : ""}`);
    for (const line of lines) {
      parts.push("    <trkseg>\n");
      for (const at of line) parts.push(`      <trkpt ${coord(at)}/>\n`);
      parts.push("    </trkseg>\n");
    }
    parts.push("  </trk>\n");
  }
  parts.push("</gpx>\n");
  return { gpx: parts.join(""), waypoints: ends.length, routePoints: turns.length, trackPoints: all.length };
}

export const routeGpxFileName = (name: string) => gpxFileName(name.trim() || "Route");
