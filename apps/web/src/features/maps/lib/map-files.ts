/** Which files the map imports, and words for what one would make. */
import type { MapFilePreview } from "@outpost/shared";
import { formatNumber, plural } from "@/lib/utils";

/** The file chooser's filter: the four formats, by name and by the types browsers give them. */
export const MAP_FILE_ACCEPT =
  ".gpx,.kml,.kmz,.geojson,.json,application/gpx+xml,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/geo+json";

/** Whether a file is one the map imports, by its name. */
export const isMapFile = (file: File) => /\.(gpx|kml|kmz|geojson|json)$/i.test(file.name);

export const isGpxFile = (file: File) => /\.gpx$/i.test(file.name);

/**
 * What importing a file would make, as the parts of one line: "A new route of 2 lines
 * and 1 outline, 140 points", "3 new places". A GPX file's waypoints stay on the route
 * unless the person asks for them as places.
 */
export function previewParts(preview: MapFilePreview, gpxWaypointsAsPlaces: boolean): string[] {
  const parts: string[] = [];
  const shapes = [
    preview.lines > 0 ? plural(preview.lines, "line") : null,
    preview.outlines > 0 ? plural(preview.outlines, "outline") : null,
  ]
    .filter((part) => part !== null)
    .join(" and ");
  if (shapes && (preview.routes ?? 1) > 1) {
    parts.push(`${formatNumber(preview.routes!)} new routes, one for each folder, of ${shapes}, ${plural(preview.linePoints, "point")}`);
  } else if (shapes) parts.push(`A new route of ${shapes}, ${plural(preview.linePoints, "point")}`);
  if (preview.points > 0) {
    if (preview.format === "gpx" && !gpxWaypointsAsPlaces) {
      parts.push(`${plural(preview.points, "waypoint")} kept on the route`);
    } else {
      parts.push(`${formatNumber(preview.points)} new ${preview.points === 1 ? "place" : "places"}`);
    }
  }
  return parts;
}
