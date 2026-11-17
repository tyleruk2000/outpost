/** Turning OpenStreetMap objects, however they were read, into reference features. */
import type { Bbox } from "@outpost/shared";
import type { FeatureSink, GeoJsonGeometry, NewFeature } from "../types.ts";
import { classifyFood } from "./food-tags.ts";
import { classifyOsm, keptTags, type OsmLayer, osmName } from "./osm-tags.ts";

export interface OsmObject {
  type: "node" | "way" | "relation";
  id: number;
  tags: Record<string, string>;
  /** The point to list it at: the node, or the centre of the way or relation. */
  lat: number;
  lon: number;
  /** For a way: its points, as [lon, lat]. */
  points?: Array<[number, number]>;
  /** For a relation: the lines of its outer ways, as [lon, lat]. */
  lines?: Array<Array<[number, number]>>;
  bbox?: Bbox | null;
}

const OSM_LICENSE = "ODbL 1.0";
const OSM_PUBLISHER = "OpenStreetMap contributors";

/** A feature from an object, or null if it is in none of the wanted layers. */
export function osmFeature(
  object: OsmObject,
  options: { layers: Set<OsmLayer>; country: string | null; publishedAt: string | null },
): NewFeature | null {
  let found: { layer: OsmLayer; kind: string } | null = classifyOsm(object.tags);
  if (found && !options.layers.has(found.layer)) found = null;
  // Food and supplies is looked for only when it was asked for, and after the other layers.
  if (!found && options.layers.has("food")) {
    const food = classifyFood(object.tags);
    if (food) found = { layer: "food", kind: food.kind };
  }
  if (!found) return null;
  const { name, altNames } = osmName(object.tags);
  let geometry: GeoJsonGeometry | null = null;
  let accuracy = "As mapped in OpenStreetMap: a point";
  let bbox: Bbox | null = object.bbox ?? null;
  if (object.type === "way" && object.points && object.points.length >= 2) {
    const closed =
      object.points.length >= 4 && object.points[0]![0] === object.points.at(-1)![0] && object.points[0]![1] === object.points.at(-1)![1];
    geometry = closed ? { type: "Polygon", coordinates: [object.points] } : { type: "LineString", coordinates: object.points };
    accuracy = closed
      ? "As mapped in OpenStreetMap: the outline, with the mark at its centre"
      : "As mapped in OpenStreetMap: a line, with the mark on it";
    const xs = object.points.map((point) => point[0]);
    const ys = object.points.map((point) => point[1]);
    bbox = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  } else if (object.type === "relation") {
    if (object.lines && object.lines.length > 0) {
      geometry = { type: "MultiLineString", coordinates: object.lines };
      accuracy = "As mapped in OpenStreetMap: the outer edges of an area made of several parts, with the mark at its centre";
    } else {
      accuracy = "As mapped in OpenStreetMap: the centre of an area made of several parts (its outline is not kept)";
    }
  }
  return {
    sourceId: `${object.type}/${object.id}`,
    layer: found.layer,
    kind: found.kind,
    name,
    altNames,
    country: options.country,
    lat: object.lat,
    lon: object.lon,
    bbox,
    geometry,
    props: keptTags(object.tags),
    provenance: "public-infrastructure",
    accuracy,
    accuracyMeters: null,
    publisher: OSM_PUBLISHER,
    license: OSM_LICENSE,
    sourceUrl: `https://www.openstreetmap.org/${object.type}/${object.id}`,
    publishedAt: options.publishedAt,
  };
}

export async function addOsm(sink: FeatureSink, object: OsmObject, options: Parameters<typeof osmFeature>[1]): Promise<boolean> {
  const feature = osmFeature(object, options);
  if (!feature) return false;
  await sink.add(feature);
  return true;
}
