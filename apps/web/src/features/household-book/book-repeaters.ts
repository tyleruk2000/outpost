/**
 * Repeaters for the household book: the places the book covers (home or where a portable
 * household last was, the meeting points, the plans' places, the people we would go to, and
 * each journey's straight line), the nearest useful repeaters round each from Outpost's own
 * list, each listed once, and the frame of a map for each place.
 *
 * Pure: the repeaters come in from the list on this Outpost (`/api/repeaters`), asked about
 * each place before the book is made; nothing here reaches anything.
 */
import {
  type Bbox,
  type BookAnswers,
  type BookJourney,
  bandOfHz,
  bearingDegrees,
  haversineMeters,
  type MarkerDto,
  maxSightDistanceMeters,
  RANGE_DEFAULT_AERIAL_METERS,
  RANGE_STATIONS,
  type RepeaterBand,
  type RepeaterDto,
  type SightRange,
} from "@outpost/shared";
import type { BinderPlace } from "@/features/household-papers/binder-places";
import { type Frame, shapeBox } from "@/features/maps/print/scale";
import { frameFor, type PictureSize, pictureSize } from "@/features/nuclear/print-frames";

/** A place the book lists repeaters round. A journey is its straight line, from `lat`/`lon` to `to`. */
export interface RepeaterLocation {
  key: string;
  kind: "home" | "meet" | "place" | "journey";
  /** "Home", "Meet near home", "On the way to Gran's". */
  role: string;
  name: string;
  lat: number;
  lon: number;
  to?: { lat: number; lon: number };
}

export interface ChosenRepeater {
  repeater: RepeaterDto & { lat: number; lon: number };
  /** From the place, or from the nearest point of a journey's line. */
  distanceMeters: number;
  bearingDegrees: number;
  /** How far along a journey's line its nearest point is. */
  alongMeters?: number;
}

export interface RepeaterGroup {
  location: RepeaterLocation;
  /** Listed here for the first time, nearest first (along the way, for a journey). */
  chosen: ChosenRepeater[];
  /** Among this place's nearest, but listed under an earlier place. */
  also: Array<ChosenRepeater & { listedUnder: string }>;
}

/** At most this many places, and this many journeys, have repeaters listed round them. */
export const REPEATER_PLACES_MOST = 8;
export const REPEATER_JOURNEYS_MOST = 4;
/** The most repeaters chosen round one place, and along one journey. */
export const REPEATERS_PER_PLACE = 6;
export const REPEATERS_PER_JOURNEY = 8;

/**
 * How far from a place a repeater is looked for, by band: Outpost's own choice of what is
 * worth trying with a handheld or a car set, not a range. VHF and UHF FM repeaters on high
 * sites are commonly worked over a few tens of kilometres; the lower VHF bands carry
 * further, the microwave bands less far.
 */
export function searchRadiusKm(band: RepeaterBand): number {
  if (band === "10m" || band === "6m" || band === "4m") return 80;
  if (band === "2m" || band === "1.25m") return 50;
  if (band === "70cm" || band === "33cm") return 40;
  return 25;
}

/** The widest of the radii above: what the list is asked for round each place. */
export const SEARCH_MOST_KM = 80;

/** The words for the radii, as the book says them. */
export const SEARCH_WORDS =
  "Up to 6 round each place (8 along a journey), the nearest first: 2 m repeaters within 50 km, 70 cm within 40 km, 10 m, 6 m and 4 m within 80 km, 23 cm and above within 25 km. FM repeaters, which any 2 m or 70 cm set can use, are chosen before digital-only ones. Those listed as not operational are left out.";

/** The places, in the book's order: home first, then the meeting points, the plans' places, the people we would go to, then journeys. */
export function repeaterLocations(input: {
  answers: Pick<BookAnswers, "destinations">;
  markers: MarkerDto[];
  /** The places step's places, home (or where a portable household was) first: `bookMapPlaces`. */
  mapped: readonly BinderPlace[];
  /** Home, or where a portable household was (`paperHomePlace`). */
  first: { role: string; name: string; lat: number; lon: number } | null;
  journeys: BookJourney[];
}): RepeaterLocation[] {
  const { mapped } = input;
  const seen = new Set<string>();
  const key = (lat: number, lon: number) => `${lat.toFixed(4)},${lon.toFixed(4)}`;
  const places: RepeaterLocation[] = [];
  const add = (place: Omit<RepeaterLocation, "key">) => {
    const at = key(place.lat, place.lon);
    if (seen.has(at) || places.length >= REPEATER_PLACES_MOST) return;
    seen.add(at);
    places.push({ ...place, key: `p${places.length + 1}` });
  };
  mapped.forEach((place, index) => {
    add({
      kind: index === 0 && input.first ? "home" : place.role.startsWith("Meet") ? "meet" : "place",
      role: place.role,
      name: place.name,
      lat: place.lat,
      lon: place.lon,
    });
  });
  for (const destination of input.answers.destinations) {
    const marker = input.markers.find((each) => each.id === destination.markerId);
    if (marker) add({ kind: "place", role: "We would go to", name: destination.name, lat: marker.lat, lon: marker.lon });
  }
  const home = input.first;
  const journeys: RepeaterLocation[] = home
    ? input.journeys.slice(0, REPEATER_JOURNEYS_MOST).map((journey, index) => ({
        key: `j${index + 1}`,
        kind: "journey",
        role: "On the way",
        name: journey.name,
        lat: home.lat,
        lon: home.lon,
        to: { lat: journey.lat, lon: journey.lon },
      }))
    : [];
  return [...places, ...journeys];
}

/** A point a share of the way along a journey's line (straight in latitude and longitude, near enough over a journey on foot). */
const along = (location: RepeaterLocation, share: number) => ({
  lat: location.lat + ((location.to?.lat ?? location.lat) - location.lat) * share,
  lon: location.lon + ((location.to?.lon ?? location.lon) - location.lon) * share,
});

const lengthOf = (location: RepeaterLocation) =>
  location.to ? haversineMeters(location.lat, location.lon, location.to.lat, location.to.lon) : 0;

/** What to ask the list about: each place, and points along each journey close enough that their circles overlap. Ten at most a journey. */
export function repeaterQueries(locations: readonly RepeaterLocation[]): Array<{ lat: number; lon: number; withinKm: number }> {
  const queries: Array<{ lat: number; lon: number; withinKm: number }> = [];
  for (const location of locations) {
    if (!location.to) {
      queries.push({ lat: location.lat, lon: location.lon, withinKm: SEARCH_MOST_KM });
      continue;
    }
    const steps = Math.min(9, Math.ceil(lengthOf(location) / 60_000));
    for (let step = 0; step <= steps; step += 1)
      queries.push({ ...along(location, steps === 0 ? 0 : step / steps), withinKm: SEARCH_MOST_KM });
  }
  return queries;
}

const isFm = (repeater: RepeaterDto) => repeater.modes.length === 0 || repeater.modes.includes("fm");

/** Where a repeater is from a place, or from the nearest point of a journey's line (read every 500 m). */
function measure(location: RepeaterLocation, repeater: { lat: number; lon: number }): Omit<ChosenRepeater, "repeater"> {
  if (!location.to)
    return {
      distanceMeters: haversineMeters(location.lat, location.lon, repeater.lat, repeater.lon),
      bearingDegrees: bearingDegrees(location.lat, location.lon, repeater.lat, repeater.lon),
    };
  const length = lengthOf(location);
  const steps = Math.max(1, Math.ceil(length / 500));
  let best = { share: 0, meters: Number.POSITIVE_INFINITY };
  for (let step = 0; step <= steps; step += 1) {
    const point = along(location, step / steps);
    const meters = haversineMeters(point.lat, point.lon, repeater.lat, repeater.lon);
    if (meters < best.meters) best = { share: step / steps, meters };
  }
  const nearest = along(location, best.share);
  return {
    distanceMeters: best.meters,
    bearingDegrees: bearingDegrees(nearest.lat, nearest.lon, repeater.lat, repeater.lon),
    alongMeters: best.share * length,
  };
}

/**
 * The repeaters for each place: the nearest useful ones within the band's radius, each
 * listed under the first place that chooses it. FM before digital-only, then nearest; along
 * a journey, spread along the line (the nearest in each stretch of about 20 km in turn), in
 * order along the way.
 */
export function chooseRepeaters(locations: readonly RepeaterLocation[], candidates: readonly RepeaterDto[]): RepeaterGroup[] {
  const pool: Array<RepeaterDto & { lat: number; lon: number }> = [];
  const same = new Set<string>();
  for (const repeater of candidates) {
    if (repeater.lat === null || repeater.lon === null || repeater.status === "off-air") continue;
    const twin = `${repeater.callsign.toUpperCase()}|${repeater.outputHz}`;
    if (same.has(repeater.id) || same.has(twin)) continue;
    same.add(repeater.id).add(twin);
    pool.push(repeater as RepeaterDto & { lat: number; lon: number });
  }
  const listedUnder = new Map<string, string>();
  return locations.map((location) => {
    const near = pool
      .map((repeater) => ({ repeater, ...measure(location, repeater) }))
      .filter((each) => each.distanceMeters <= searchRadiusKm(bandOrOwn(each.repeater)) * 1000)
      .sort((a, b) => Number(isFm(b.repeater)) - Number(isFm(a.repeater)) || a.distanceMeters - b.distanceMeters);
    let picked: ChosenRepeater[];
    if (!location.to) picked = near.slice(0, REPEATERS_PER_PLACE).sort((a, b) => a.distanceMeters - b.distanceMeters);
    else {
      const stretches = Math.max(1, Math.round(lengthOf(location) / 20_000));
      const queues = Array.from({ length: stretches }, () => [] as ChosenRepeater[]);
      for (const each of near)
        queues[Math.min(stretches - 1, Math.floor(((each.alongMeters ?? 0) / Math.max(1, lengthOf(location))) * stretches))]!.push(each);
      picked = [];
      while (picked.length < REPEATERS_PER_JOURNEY && queues.some((queue) => queue.length > 0))
        for (const queue of queues) if (queue.length > 0 && picked.length < REPEATERS_PER_JOURNEY) picked.push(queue.shift()!);
      picked.sort((a, b) => (a.alongMeters ?? 0) - (b.alongMeters ?? 0));
    }
    const label = placeLabel(location);
    const group: RepeaterGroup = { location, chosen: [], also: [] };
    for (const each of picked) {
      const earlier = listedUnder.get(each.repeater.id);
      if (earlier) group.also.push({ ...each, listedUnder: earlier });
      else {
        listedUnder.set(each.repeater.id, label);
        group.chosen.push(each);
      }
    }
    return group;
  });
}

const bandOrOwn = (repeater: RepeaterDto): RepeaterBand => (repeater.band === "other" ? bandOfHz(repeater.outputHz) : repeater.band);

/** "Home", "Meet near home: Village hall", "On the way to Gran's". */
export function placeLabel(location: RepeaterLocation): string {
  if (location.kind === "journey") return `On the way to ${location.name}`;
  if (location.kind === "home") return location.role === "Home" ? "Home" : location.name;
  return `${location.role}: ${location.name}`;
}

// ── Range ───────────────────────────────────────────────────────────────────

/** A repeater's likely range for the map: from the terrain installed (`/api/maps/sight-range`), or the smooth-Earth radio horizon. */
export interface BookRepeaterRange {
  /** The typical range (terrain), or the radio horizon. */
  meters: number;
  basis: "terrain" | "horizon";
  aerialMeters: number;
  /** Whether the list gave the aerial's height; otherwise `RANGE_DEFAULT_AERIAL_METERS` was assumed. */
  aerialListed: boolean;
  /** The ground in sight of the aerial for a handheld, bearing by bearing, as the map's estimated range shades it. With terrain only. */
  sight?: SightRange;
}

/** The handheld the range is worked out for: 1.5 m, held at head height. */
export const HANDHELD_METERS = RANGE_STATIONS[0].meters;

/** The range with nothing worked out from terrain: the smooth-Earth radio horizon between the repeater's aerial and a handheld. */
export function horizonRange(repeater: Pick<RepeaterDto, "antennaMeters">): BookRepeaterRange {
  const aerialMeters = repeater.antennaMeters ?? RANGE_DEFAULT_AERIAL_METERS;
  return {
    meters: Math.round(maxSightDistanceMeters(aerialMeters, HANDHELD_METERS)),
    basis: "horizon",
    aerialMeters,
    aerialListed: repeater.antennaMeters !== null,
  };
}

// ── Maps ────────────────────────────────────────────────────────────────────

/** The most maps of repeaters a book draws. */
export const REPEATER_MAPS_MOST = 8;
/** Every map is the full width of the text and this high, in points: more ground east and west than north and south. */
export const REPEATER_MAP_HEIGHT = 300;
/** The least ground a map shows across: about 10 km. */
const LEAST_SPAN_METERS = 10_000;

/** The places that get a map: a journey, or a place with repeaters of its own. */
export const mappedGroups = (groups: readonly RepeaterGroup[]) =>
  groups.filter((group) => group.chosen.length > 0 || (group.location.to && group.also.length > 0)).slice(0, REPEATER_MAPS_MOST);

/**
 * The ground a place's map shows: the place (or the line), and every repeater chosen round it, with a margin, widened
 * (or deepened) about its middle to the shape of the picture, `aspect` being its width over its height.
 */
export function repeaterMapBbox(group: RepeaterGroup, aspect?: number): Bbox {
  const points = [
    { lat: group.location.lat, lon: group.location.lon },
    ...(group.location.to ? [group.location.to] : []),
    ...[...group.chosen, ...group.also].map((each) => each.repeater),
  ];
  const lats = points.map((point) => point.lat);
  const lons = points.map((point) => point.lon);
  const [south, north, west, east] = [Math.min(...lats), Math.max(...lats), Math.min(...lons), Math.max(...lons)];
  const midLat = (south + north) / 2;
  const cos = Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  const least = LEAST_SPAN_METERS / 111_320;
  const padLat = Math.max((north - south) * 0.12, least / 2 - (north - south) / 2, 0.02);
  const padLon = Math.max((east - west) * 0.12, least / cos / 2 - (east - west) / 2, 0.02 / cos);
  const box: Bbox = [west - padLon, Math.max(-85, south - padLat), east + padLon, Math.min(85, north + padLat)];
  return aspect ? shapeBox(box, aspect, "around") : box;
}

/** The map of a place: its picture's size on the page and the view it is drawn at. The screen draws the offline map at this frame. */
export function repeaterMapFrame(group: RepeaterGroup, measure: number): { bbox: Bbox; size: PictureSize; frame: Frame } {
  // A few points in from each side, so that the scale bar's 0 under the left edge is not cut.
  const width = measure - 8;
  const bbox = repeaterMapBbox(group, width / REPEATER_MAP_HEIGHT);
  const size = pictureSize(bbox, width, REPEATER_MAP_HEIGHT);
  return { bbox, size, frame: frameFor(bbox, size.pixels) };
}
