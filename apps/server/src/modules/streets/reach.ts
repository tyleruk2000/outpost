/**
 * Reachable areas: everywhere within 15, 30 or 60 minutes of a point, by car, bicycle or
 * on foot.
 *
 * With streets built, the streets service draws them (Valhalla's isochrones) over every
 * street, with two settings that shape the answer:
 *  - `denoise` 0.5: pieces smaller than half the largest are left out (Valhalla's scale
 *    is 0 to 1; 1 keeps only the largest), so stray specks along a motorway go;
 *  - `generalize`: the outline is simplified to within this many metres (Douglas and
 *    Peucker's method), 100 m for driving, 75 m for cycling, 50 m on foot: enough to keep
 *    a town's streets legible on a map, small enough to send to a phone.
 *
 * Without streets (most installations), a drive's areas come from Outpost's own
 * main-roads network instead (main-roads-reach.ts), labelled "Main roads only". Walking
 * and cycling need streets.
 *
 * Neither counts traffic, junction waits or stops: free-flowing traffic only.
 */
import type { StreetsReachFeature, StreetsReachMode } from "@outpost/shared";
import type { Costing, IsochroneReply, StreetsClient } from "./client.ts";
import type { MainRoadsReach, Ring } from "./main-roads-reach.ts";

export const REACH_SETTINGS: Record<StreetsReachMode, { costing: Costing; denoise: number; generalizeM: number }> = {
  drive: { costing: "auto", denoise: 0.5, generalizeM: 100 },
  cycle: { costing: "bicycle", denoise: 0.5, generalizeM: 75 },
  walk: { costing: "pedestrian", denoise: 0.5, generalizeM: 50 },
};

export const FREE_FLOWING = "Free-flowing traffic, no stops: real journeys take longer.";
export const MAIN_ROADS_NOTE =
  "Main roads only: the way to and from them counts at 30 km/h, and sea crossings are left out. Free-flowing traffic, no stops.";

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
  const settings = REACH_SETTINGS[input.mode];
  const reply = await client.isochrone({
    point: input.point,
    costing: settings.costing,
    minutes: [...new Set(input.minutes)].sort((a, b) => a - b),
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
