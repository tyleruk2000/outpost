/**
 * Reachable areas: everywhere within a time of a point, by car or bicycle (up to 2 hours)
 * or on foot (up to 8 hours).
 *
 * With streets built, the streets service draws them (Valhalla's isochrones) over every
 * street, with two settings that shape the answer:
 *  - `denoise` 0.5: pieces smaller than half the largest are left out (Valhalla's scale
 *    is 0 to 1; 1 keeps only the largest), so stray specks along a motorway go;
 *  - `generalize`: the outline is simplified to within this many metres (Douglas and
 *    Peucker's method), 100 m for driving, 75 m for cycling, 50 m on foot for the
 *    shorter times: enough to keep a town's streets legible on a map, small enough to send
 *    to a phone. A longer time reaches further and is looked at from further out, so the
 *    tolerance grows with the longest time asked: 200 m for a 2 hour drive, 150 m for a
 *    2 hour ride, 200 m for an 8 hour walk. Valhalla's own grid grows with the time too
 *    (a 300th of the furthest it could go, clamped to 0.001 to 0.005 degrees), so its
 *    work and the answer stay bounded.
 *
 * Without streets (most installations), a drive's areas come from Outpost's own
 * main-roads network instead (main-roads-reach.ts), labelled "Main roads only". Walking
 * and cycling need streets.
 *
 * None counts traffic, junction waits, stops or rests: free-flowing traffic, a steady pace.
 */
import type { StreetsReachFeature, StreetsReachMode } from "@outpost/shared";
import type { Costing, IsochroneReply, StreetsClient } from "./client.ts";
import type { MainRoadsReach, Ring } from "./main-roads-reach.ts";

const BASE: Record<StreetsReachMode, { costing: Costing; generalizeM: number; growsFrom: number }> = {
  // The tolerance stays at its base up to `growsFrom` minutes, then grows in step with the time.
  drive: { costing: "auto", generalizeM: 100, growsFrom: 60 },
  cycle: { costing: "bicycle", generalizeM: 75, growsFrom: 60 },
  walk: { costing: "pedestrian", generalizeM: 50, growsFrom: 120 },
};

/** Valhalla's settings for these times: the longest sets how far the outline is simplified. */
export function reachSettings(mode: StreetsReachMode, minutes: number[]): { costing: Costing; denoise: number; generalizeM: number } {
  const base = BASE[mode];
  const longest = Math.max(...minutes);
  return { costing: base.costing, denoise: 0.5, generalizeM: Math.round(base.generalizeM * Math.max(1, longest / base.growsFrom)) };
}

export const FREE_FLOWING = "Free-flowing traffic, no stops: real journeys take longer.";
export const MAIN_ROADS_NOTE =
  "Main roads only: the way to and from them counts at 30 km/h, and sea crossings are left out. Free-flowing traffic, no stops.";

/**
 * What the times leave out, for the way and the longest time asked. The streets carry no
 * heights (nothing is fetched to add them), so hills are not counted on foot or by bicycle.
 */
export function reachNote(mode: StreetsReachMode, longest: number): string {
  if (mode === "drive") return FREE_FLOWING;
  if (mode === "cycle")
    return longest > 60
      ? "A steady pace on the flat with no stops, and no rests counted: real rides take longer."
      : "A steady pace on the flat with no stops: real rides take longer.";
  return longest > 120
    ? "A steady walking pace on the flat with no stops, and no rests counted: a real walk of hours takes much longer."
    : "A steady walking pace on the flat with no stops: real walks take longer.";
}

const round5 = (value: number) => Math.round(value * 1e5) / 1e5;
const roundRing = (ring: number[][]): Array<[number, number]> => ring.map((p) => [round5(p[0]!), round5(p[1]!)]);

/** Valhalla's contours as features, smallest time first. */
export function featuresFromIsochrone(reply: IsochroneReply): StreetsReachFeature[] {
  return reply.features
    .map((feature): StreetsReachFeature => {
      const minutes = Math.round(feature.properties.contour);
      if (feature.geometry.type === "Polygon")
        return {
          type: "Feature",
          properties: { minutes },
          geometry: { type: "Polygon", coordinates: feature.geometry.coordinates.map(roundRing) },
        };
      return {
        type: "Feature",
        properties: { minutes },
        geometry: { type: "MultiPolygon", coordinates: feature.geometry.coordinates.map((polygon) => polygon.map(roundRing)) },
      };
    })
    .sort((a, b) => a.properties.minutes - b.properties.minutes);
}

export async function streetsReach(
  client: StreetsClient,
  input: { point: { lat: number; lon: number }; mode: StreetsReachMode; minutes: number[]; signal?: AbortSignal },
): Promise<StreetsReachFeature[]> {
  const minutes = [...new Set(input.minutes)].sort((a, b) => a - b);
  const settings = reachSettings(input.mode, minutes);
  const reply = await client.isochrone({
    point: input.point,
    costing: settings.costing,
    minutes,
    denoise: settings.denoise,
    generalizeM: settings.generalizeM,
    ...(input.signal ? { signal: input.signal } : {}),
  });
  return featuresFromIsochrone(reply);
}

/** Outpost's own main-roads areas as features, smallest time first. */
export function featuresFromMainRoads(reach: MainRoadsReach): StreetsReachFeature[] {
  return reach.areas.map(({ minutes, polygons }): StreetsReachFeature => {
    const rings: Ring[] = polygons;
    if (rings.length === 1) return { type: "Feature", properties: { minutes }, geometry: { type: "Polygon", coordinates: [rings[0]!] } };
    return { type: "Feature", properties: { minutes }, geometry: { type: "MultiPolygon", coordinates: rings.map((ring) => [ring]) } };
  });
}
