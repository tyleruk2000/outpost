/** What the map's search box lists: a typed position, the person's own places and routes, and place names. */
import {
  formatDecimal,
  formatOsGridRef,
  haversineMeters,
  type MarkerDto,
  type ParsedCoordinate,
  type PlaceDto,
  type TrackDto,
} from "@outpost/shared";
import { bboxCenter, formatHeight, type LatLon } from "./geo";
import { trackSummary } from "./tracks";

export type SearchResult = {
  key: string;
  title: string;
  /** What it is and where: "Mountain · 1,085 m · Wales, United Kingdom". */
  detail: string;
  position: LatLon | null;
  /** Metres from the middle of the map; null when the result has no single position. */
  distance: number | null;
} & (
  | { kind: "coordinate"; coordinate: ParsedCoordinate }
  | { kind: "marker"; marker: MarkerDto }
  | { kind: "track"; track: TrackDto }
  | { kind: "place"; place: PlaceDto }
);

/** Lower case and without accents, so "eryri" finds "Eryri" and "zurich" finds "Zürich". */
export function fold(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

// GeoNames gives first-level divisions as codes. Within the United Kingdom they are the
// four nations, which is how people there say where a hill is.
const UK_NATIONS: Record<string, string> = { ENG: "England", SCT: "Scotland", WLS: "Wales", NIR: "Northern Ireland" };

let regionNames: Intl.DisplayNames | undefined;

export function countryName(code: string | null): string | null {
  if (!code) return null;
  try {
    regionNames ??= new Intl.DisplayNames(["en-GB"], { type: "region" });
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function placeRegion(place: Pick<PlaceDto, "country" | "admin1">): string | null {
  const country = countryName(place.country);
  const nation = place.country === "GB" && place.admin1 ? UK_NATIONS[place.admin1] : undefined;
  return nation && country ? `${nation}, ${country}` : country;
}

export function placeDetail(place: PlaceDto): string {
  return [place.kindLabel, place.elevation !== null && place.elevation > 0 ? formatHeight(place.elevation) : null, placeRegion(place)]
    .filter(Boolean)
    .join(" · ");
}

const COORDINATE_KINDS: Record<ParsedCoordinate["format"], string> = {
  decimal: "Coordinates",
  ddm: "Coordinates",
  dms: "Coordinates",
  geo: "Coordinates",
  osgb: "Grid reference",
};

export function coordinateDetail(coordinate: ParsedCoordinate): string {
  if (coordinate.format !== "osgb") {
    const grid = formatOsGridRef(coordinate.lat, coordinate.lon, 8);
    return grid ? `Coordinates · grid reference ${grid}` : COORDINATE_KINDS[coordinate.format];
  }
  const square = coordinate.precisionMeters;
  const size =
    square === undefined ? "" : square >= 1000 ? `, the middle of a ${square / 1000} km square` : `, the middle of a ${square} m square`;
  return `Grid reference${size} · ${formatDecimal(coordinate.lat, coordinate.lon, 5)}`;
}

export interface SearchInput {
  query: string;
  coordinate: ParsedCoordinate | null;
  places: PlaceDto[];
  markers: MarkerDto[];
  tracks: TrackDto[];
  center: LatLon | null;
  /** How many of the person's own places and routes to list. */
  ownLimit?: number;
}

/**
 * The list under the search box. A typed position comes first, then the person's own
 * places and routes whose names contain the text, then place names in the order the
 * server ranked them.
 */
export function buildSearchResults(input: SearchInput): SearchResult[] {
  const { center } = input;
  const needle = fold(input.query);
  const distanceTo = (position: LatLon | null) =>
    center && position ? haversineMeters(center.lat, center.lon, position.lat, position.lon) : null;
  const results: SearchResult[] = [];
  if (needle.length === 0) return results;

  if (input.coordinate) {
    const position = { lat: input.coordinate.lat, lon: input.coordinate.lon };
    results.push({
      kind: "coordinate",
      key: "coordinate",
      title: input.coordinate.format === "osgb" ? input.query.trim().toUpperCase() : formatDecimal(position.lat, position.lon, 5),
      detail: coordinateDetail(input.coordinate),
      position,
      distance: distanceTo(position),
      coordinate: input.coordinate,
    });
  }

  const limit = input.ownLimit ?? 4;
  for (const marker of input.markers.filter((item) => fold(item.name).includes(needle)).slice(0, limit)) {
    const position = { lat: marker.lat, lon: marker.lon };
    results.push({
      kind: "marker",
      key: `marker-${marker.id}`,
      title: marker.name,
      detail: marker.isFavorite ? "Saved place · favourite" : "Saved place",
      position,
      distance: distanceTo(position),
      marker,
    });
  }
  for (const track of input.tracks.filter((item) => fold(item.name).includes(needle)).slice(0, limit)) {
    const position = track.bounds ? bboxCenter(track.bounds) : null;
    results.push({
      kind: "track",
      key: `track-${track.id}`,
      title: track.name,
      detail: `Route · ${trackSummary(track)}`,
      position,
      distance: distanceTo(position),
      track,
    });
  }
  for (const place of input.places) {
    const position = { lat: place.lat, lon: place.lon };
    results.push({
      kind: "place",
      key: `place-${place.id}`,
      title: place.name,
      detail: placeDetail(place),
      position,
      distance: distanceTo(position),
      place,
    });
  }
  return results;
}
