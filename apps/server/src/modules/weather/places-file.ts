/**
 * Weather places as a file: GeoJSON points, WGS 84 longitude and latitude, each named,
 * with the Met Office region where one was chosen. "Take everything out" writes it;
 * Weather and hazards reads it, or any GeoJSON file of named points, back in.
 */
import { MET_OFFICE_REGION_IDS, type MetOfficeRegionId, WEATHER_LIMITS, type WeatherPlace } from "@outpost/shared";
import { badRequest } from "../../core/errors.ts";

export const PLACES_FILE_MAX_BYTES = 1024 * 1024;

export function placesGeoJson(places: WeatherPlace[]): string {
  const features = places.map((place) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: [place.lon, place.lat] },
    properties: { name: place.name, region: place.region, home: place.isHome },
  }));
  return `${JSON.stringify({ type: "FeatureCollection", features }, null, 2)}\n`;
}

export interface PlaceCandidate {
  name: string;
  lat: number;
  lon: number;
  region: MetOfficeRegionId | null;
}

const isRegion = (value: unknown): value is MetOfficeRegionId =>
  typeof value === "string" && (MET_OFFICE_REGION_IDS as readonly string[]).includes(value);

/** The named points of a GeoJSON file, in order. Anything that is not a point is passed over and counted. */
export function readPlacesFile(text: string): { places: PlaceCandidate[]; notPoints: number } {
  let value: unknown;
  try {
    value = JSON.parse(text.replace(/^\uFEFF/, ""));
  } catch {
    throw badRequest("That file is not GeoJSON. Choose the weather-places.geojson file from an export, or another GeoJSON file of points.");
  }
  const record = (value ?? {}) as { type?: unknown; features?: unknown; crs?: unknown };
  const features =
    record.type === "FeatureCollection" && Array.isArray(record.features) ? record.features : record.type === "Feature" ? [record] : null;
  if (!features) throw badRequest("That file is JSON but not GeoJSON: it has no features in it.");
  if (record.crs && !/4326|CRS84/i.test(JSON.stringify(record.crs)))
    throw badRequest("That file gives its positions in another coordinate system. Save it as WGS 84 longitude and latitude and try again.");
  const places: PlaceCandidate[] = [];
  let notPoints = 0;
  for (const feature of features as Array<{ geometry?: { type?: unknown; coordinates?: unknown }; properties?: Record<string, unknown> }>) {
    const coordinates = feature?.geometry?.type === "Point" ? feature.geometry.coordinates : null;
    const [lon, lat] = Array.isArray(coordinates) ? (coordinates as unknown[]) : [];
    if (
      typeof lon !== "number" ||
      typeof lat !== "number" ||
      !Number.isFinite(lon) ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      notPoints += 1;
      continue;
    }
    const properties = feature.properties ?? {};
    const named = [properties.name, properties.title, properties.Name].find((each) => typeof each === "string" && each.trim());
    places.push({
      name: ((named as string | undefined)?.trim() || "A position").slice(0, WEATHER_LIMITS.name),
      lat,
      lon,
      region: isRegion(properties.region) ? properties.region : null,
    });
  }
  return { places, notPoints };
}
