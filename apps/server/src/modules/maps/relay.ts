/**
 * The relay planner: high ground in sight of two places, where a relay could stand when the two are not in sight of
 * each other (home and a friend's, a base and a valley).
 *
 * It is two estimated ranges and nothing new: the viewshed from A and the viewshed from B, each worked out as a
 * repeater's range is (sight-range.ts), with the relay's aerial as the station at the other end. Line of sight is
 * the same both ways, so ground in A's viewshed has the relay in sight of A, and the same for B. Every sample of A's
 * viewshed in sight is looked up in B's, at the nearest bearing and sample; ground in sight of both is the answer.
 * The places named are the highest of it, each well apart from the others, and then the nearest to both ends.
 */
import {
  encodeBits,
  haversineMeters,
  initialBearingDeg,
  RANGE_SHARE_WITHIN_METERS,
  RELAY_MOST,
  type RelayCandidate,
  type RelayPlan,
  rangeSampleIndex,
  type SightRange,
  typicalRangeMeters,
} from "@outpost/shared";
import { z } from "zod";
import { badRequest } from "../../core/errors.ts";
import { positionsAlong, type SightRanger, type Viewshed } from "./sight-range.ts";
import { position } from "./terrain-profile.ts";

const height = (name: string) =>
  z.coerce
    .number({ error: `Give \`${name}\` as a height in metres.` })
    .min(0, `\`${name}\` is a height above the ground, from 0 to 1000 m.`)
    .max(1000, `\`${name}\` is a height above the ground, from 0 to 1000 m.`)
    .transform((value) => Math.round(value * 10) / 10);

export const relayQuery = z.object({
  a: position("a"),
  b: position("b"),
  aHeight: height("aHeight"),
  bHeight: height("bHeight"),
  relay: height("relay"),
});

/** The two ends must be within twice the reach of a range of each other, or no ground could be in sight of both. */
const MOST_APART_METERS = 200_000;

const isSeen = (shed: Viewshed, bearing: number, index: number) => {
  const bit = bearing * shed.distances.length + index;
  return ((shed.bits[bit >> 3]! >> (bit & 7)) & 1) === 1;
};

/**
 * Whether ground at a place is in a viewshed, to within the viewshed's own spacing: in sight at either of the two
 * bearings either side of it and either of the samples either side of it. A crest seen from both sides is in sight
 * of each only on its own side and at the top, a strip narrower than the samples are apart; read any finer, it would
 * be missed.
 */
function seenFrom(shed: Viewshed, lat: number, lon: number): boolean {
  const { range } = shed;
  const meters = haversineMeters(range.at.lat, range.at.lon, lat, lon);
  if (meters > range.maxMeters) return false;
  const count = range.bearingCount;
  const position = (initialBearingDeg(range.at, { lat, lon }) * count) / 360;
  const after = Math.max(0, Math.min(shed.distances.length - 1, rangeSampleIndex(meters, range.bands)));
  for (const bearing of [Math.floor(position) % count, Math.ceil(position) % count])
    for (const index of [after - 1, after]) if (index >= 0 && isSeen(shed, bearing, index)) return true;
  return false;
}

/** The best of the places in sight of both, by an order, each at least `apart` metres from those already taken. */
function pick(cells: RelayCandidate[], order: (a: RelayCandidate, b: RelayCandidate) => number, apart: number, most: number) {
  const taken: RelayCandidate[] = [];
  for (const cell of [...cells].sort(order)) {
    if (taken.length >= most) break;
    if (taken.some((other) => haversineMeters(other.at.lat, other.at.lon, cell.at.lat, cell.at.lon) < apart)) continue;
    taken.push(cell);
  }
  return taken;
}

export type RelayPlanner = (query: z.infer<typeof relayQuery>) => Promise<RelayPlan>;

export function createRelayPlanner(ranger: SightRanger): RelayPlanner {
  return async ({ a, b, aHeight, bHeight, relay }) => {
    const distanceMeters = Math.round(haversineMeters(a.lat, a.lon, b.lat, b.lon));
    if (distanceMeters > MOST_APART_METERS)
      throw badRequest(`A and B are ${Math.round(distanceMeters / 1000)} km apart: a relay can be found for places up to 200 km apart.`);
    // One after the other: each reads many tiles, and the second is quicker for the first's tiles still decoded.
    const fromA = await ranger.viewshed(a, aHeight, relay);
    const fromB = await ranger.viewshed(b, bHeight, relay);
    const base = { a, b, aMeters: aHeight, bMeters: bHeight, relayMeters: relay, distanceMeters };
    if (fromA.range.coverage === "none" || fromB.range.coverage === "none")
      return { ...base, coverage: "none", both: null, candidates: [] };

    const { distances, heights } = fromA;
    const count = fromA.range.bearingCount;
    const samples = distances.length;
    const { lons, lats } = positionsAlong(a, count, distances, 0, samples);
    const bits = new Uint8Array(fromA.bits.length);
    const cells: RelayCandidate[] = [];
    const bearings: SightRange["bearings"] = [];
    for (let bearing = 0; bearing < count; bearing += 1) {
      let furthest = 0;
      for (let index = 0; index < samples; index += 1) {
        if (!isSeen(fromA, bearing, index)) continue;
        const cell = bearing * samples + index;
        const lat = lats[cell]!;
        const lon = lons[cell]!;
        if (!seenFrom(fromB, lat, lon)) continue;
        bits[cell >> 3]! |= 1 << (cell & 7);
        furthest = distances[index]!;
        cells.push({
          at: { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) },
          groundMeters: Math.round(heights[cell]!),
          fromAMeters: Math.round(distances[index]!),
          fromBMeters: Math.round(haversineMeters(b.lat, b.lon, lat, lon)),
        });
      }
      bearings.push({ ...fromA.range.bearings[bearing]!, furthestMeters: furthest });
    }

    // Places named are well apart: a twentieth of the way between the ends, and never under a kilometre.
    const apart = Math.max(1000, distanceMeters / 20);
    // Heights to the nearest 10 m (finer than the terrain is good for would put a far hill 1 m higher first), the nearer first among those as high.
    const tens = (cell: RelayCandidate) => Math.round(cell.groundMeters / 10);
    const longer = (cell: RelayCandidate) => Math.max(cell.fromAMeters, cell.fromBMeters);
    const highest = pick(cells, (x, y) => tens(y) - tens(x) || longer(x) - longer(y), apart, RELAY_MOST);
    const nearest = pick(cells, (x, y) => longer(x) - longer(y) || y.groundMeters - x.groundMeters, apart, RELAY_MOST);
    const named = [...highest];
    for (const cell of nearest) if (!named.some((other) => other.at.lat === cell.at.lat && other.at.lon === cell.at.lon)) named.push(cell);

    return {
      ...base,
      coverage: fromA.range.coverage === "terrain" && fromB.range.coverage === "terrain" ? "terrain" : "partial",
      both: {
        ...fromA.range,
        seen: encodeBits(bits),
        bearings,
        typicalMeters: typicalRangeMeters(bearings),
        shares: RANGE_SHARE_WITHIN_METERS.map((withinMeters) => ({ withinMeters, share: null })),
        hiddenShare: null,
      },
      candidates: named,
    };
  };
}
