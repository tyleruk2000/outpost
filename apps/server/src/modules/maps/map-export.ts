/**
 * Routes and places written as KML 2.2 and as GeoJSON (RFC 7946), beside the GPX that
 * `gpx.ts` writes. What is exported is the same in all three: each route's lines, its
 * outlines and its waypoints, and the saved places when asked.
 *
 * KML puts each route in a `Folder` of its own, named after it and in its colour, and the
 * saved places in one more, so that Outpost reads the file back as the same routes (one
 * route per folder, `kml-reader.ts`). An outline, kept as closed lines, is written as the
 * polygon it was, its rings gathered by `outlineAreas`: in GPX it stays a closed line,
 * since GPX has no areas.
 */
import { MARKER_COLOR_HEX, type MarkerColor, outlineAreas } from "@outpost/shared";
import type { Position } from "geojson";
import { decimal, escapeXml, type GpxDocument, type GpxWaypoint } from "./gpx.ts";

export interface ExportRoute {
  name: string;
  description: string;
  color: MarkerColor;
  lines: GpxDocument["lines"];
  waypoints: GpxWaypoint[];
}

export interface ExportBundle {
  name: string;
  /** A sentence for the whole file: whose data it holds, when any of it is another party's. */
  description?: string;
  routes: ExportRoute[];
  /** The saved places, when they were asked for. */
  places: GpxWaypoint[];
}

export type ExportFormat = "kml" | "geojson";

// ── Shared ──

/** A line's segments, and whether it is an outline. */
function segmentsOf(line: GpxDocument["lines"][number]): Position[][] {
  return line.geometry.type === "LineString" ? [line.geometry.coordinates] : line.geometry.coordinates;
}

/** The text a line or place carries: its own description, then where it came from. */
const describe = (...parts: Array<string | undefined>) => parts.filter(Boolean).join("\n\n");

// ── KML ──

const kmlText = (tag: string, value: string | undefined, indent: string) =>
  value ? `${indent}<${tag}>${escapeXml(value)}</${tag}>\n` : "";

/** "lon,lat[,ele]" tuples, as KML wants them. */
function kmlCoordinates(positions: Position[]): string {
  return positions
    .map(([lon, lat, ele]) => {
      const pair = `${decimal(lon!, 7)},${decimal(lat!, 7)}`;
      return typeof ele === "number" && Number.isFinite(ele) ? `${pair},${decimal(ele, 2)}` : pair;
    })
    .join(" ");
}

/** A colour as KML writes it: alpha, blue, green, red. */
function kmlColor(hex: string, alpha: string): string {
  const [r, g, b] = [hex.slice(1, 3), hex.slice(3, 5), hex.slice(5, 7)];
  return `${alpha}${b}${g}${r}`.toLowerCase();
}

function kmlPoint(place: GpxWaypoint, indent: string): string {
  const position: Position = place.elevation === undefined ? [place.lon, place.lat] : [place.lon, place.lat, place.elevation];
  return `${indent}<Placemark>\n${kmlText("name", place.name, `${indent}  `)}${kmlText("description", place.description, `${indent}  `)}${indent}  <Point><coordinates>${kmlCoordinates([position])}</coordinates></Point>\n${indent}</Placemark>\n`;
}

function kmlPolygon(area: Position[][]): string {
  const [outer, ...holes] = area;
  const inner = holes.map(
    (hole) => `<innerBoundaryIs><LinearRing><coordinates>${kmlCoordinates(hole)}</coordinates></LinearRing></innerBoundaryIs>`,
  );
  return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${kmlCoordinates(outer!)}</coordinates></LinearRing></outerBoundaryIs>${inner.join("")}</Polygon>`;
}

function kmlLine(line: GpxDocument["lines"][number], style: string, indent: string): string {
  const segments = segmentsOf(line);
  let geometry: string[];
  if (line.properties._outline) {
    geometry = outlineAreas(segments).map(kmlPolygon);
    // Rings too short to be areas stay lines.
    if (geometry.length === 0)
      geometry = segments.map((segment) => `<LineString><coordinates>${kmlCoordinates(segment)}</coordinates></LineString>`);
  } else {
    geometry = segments.map(
      (segment) => `<LineString><tessellate>1</tessellate><coordinates>${kmlCoordinates(segment)}</coordinates></LineString>`,
    );
  }
  const shape = geometry.length === 1 ? geometry[0] : `<MultiGeometry>${geometry.join("")}</MultiGeometry>`;
  return `${indent}<Placemark>\n${kmlText("name", line.properties.name, `${indent}  `)}${kmlText("description", describe(line.properties.desc, line.properties.src), `${indent}  `)}${indent}  <styleUrl>#${style}</styleUrl>\n${indent}  ${shape}\n${indent}</Placemark>\n`;
}

export function buildKml(bundle: ExportBundle): string {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2">\n<Document>\n';
  xml += kmlText("name", bundle.name, "  ") + kmlText("description", bundle.description, "  ");
  const colors = [...new Set(bundle.routes.map((route) => route.color))];
  for (const color of colors) {
    const hex = MARKER_COLOR_HEX[color];
    xml += `  <Style id="route-${color}"><LineStyle><color>${kmlColor(hex, "ff")}</color><width>3</width></LineStyle><PolyStyle><color>${kmlColor(hex, "40")}</color></PolyStyle></Style>\n`;
  }
  for (const route of bundle.routes) {
    xml += `  <Folder>\n${kmlText("name", route.name, "    ")}${kmlText("description", route.description, "    ")}`;
    for (const line of route.lines) xml += kmlLine(line, `route-${route.color}`, "    ");
    for (const waypoint of route.waypoints) xml += kmlPoint(waypoint, "    ");
    xml += "  </Folder>\n";
  }
  if (bundle.places.length > 0) {
    xml += "  <Folder>\n    <name>Saved places</name>\n";
    for (const place of bundle.places) xml += kmlPoint(place, "    ");
    xml += "  </Folder>\n";
  }
  return `${xml}</Document>\n</kml>\n`;
}

// ── GeoJSON ──

/** Positions as RFC 7946 asks: longitude, latitude, then height, no more than seven places. */
const round = (positions: Position[]) =>
  positions.map((position) => position.map((value, index) => Number(value.toFixed(index < 2 ? 7 : 2))));

const pointFeature = (place: GpxWaypoint, properties: Record<string, unknown>) => ({
  type: "Feature",
  geometry: {
    type: "Point",
    coordinates: round([place.elevation === undefined ? [place.lon, place.lat] : [place.lon, place.lat, place.elevation]])[0],
  },
  properties: { ...properties, name: place.name, description: place.description ?? "", ...(place.sym ? { sym: place.sym } : {}) },
});

export function buildGeoJson(bundle: ExportBundle): string {
  const features: unknown[] = [];
  for (const route of bundle.routes) {
    const about = { route: route.name, color: MARKER_COLOR_HEX[route.color] };
    for (const line of route.lines) {
      const segments = segmentsOf(line);
      const properties = {
        ...about,
        name: line.properties.name ?? route.name,
        description: describe(line.properties.desc, line.properties.src),
      };
      const areas = line.properties._outline ? outlineAreas(segments) : [];
      if (areas.length > 0) {
        features.push({
          type: "Feature",
          geometry:
            areas.length === 1
              ? { type: "Polygon", coordinates: areas[0]!.map(round) }
              : { type: "MultiPolygon", coordinates: areas.map((area) => area.map(round)) },
          properties: { kind: "area", ...properties },
        });
        continue;
      }
      features.push({
        type: "Feature",
        geometry:
          segments.length === 1
            ? { type: "LineString", coordinates: round(segments[0]!) }
            : { type: "MultiLineString", coordinates: segments.map(round) },
        properties: { kind: "route", ...properties },
      });
    }
    for (const waypoint of route.waypoints) features.push(pointFeature(waypoint, { kind: "waypoint", ...about }));
  }
  for (const place of bundle.places) features.push(pointFeature(place, { kind: "place" }));
  return `${JSON.stringify({ type: "FeatureCollection", name: bundle.name, ...(bundle.description ? { description: bundle.description } : {}), features })}\n`;
}

export const EXPORT_TYPES: Record<ExportFormat, { extension: string; contentType: string; build: (bundle: ExportBundle) => string }> = {
  kml: { extension: "kml", contentType: "application/vnd.google-earth.kml+xml; charset=utf-8", build: buildKml },
  geojson: { extension: "geojson", contentType: "application/geo+json; charset=utf-8", build: buildGeoJson },
};
