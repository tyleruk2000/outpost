/** The line-of-sight tool's one request: the ground between two points, from installed terrain. */
import type { TerrainProfile } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { LatLon } from "../lib/geo";

const text = (position: LatLon) => `${position.lat.toFixed(6)},${position.lon.toFixed(6)}`;

/**
 * The key starts with "maps", so the profile is read again when terrain is installed or
 * removed. Antenna heights and the frequency are not part of it: changing them works
 * the answer out again in the browser without asking the server for the same ground.
 */
export function useTerrainProfile(from: LatLon | null, to: LatLon | null) {
  const key = from && to ? [text(from), text(to)] : [];
  return useQuery({
    queryKey: ["maps", "terrain-profile", ...key],
    queryFn: ({ signal }) => api.get<TerrainProfile>("/api/maps/terrain-profile", { from: key[0], to: key[1] }, signal),
    enabled: Boolean(from && to),
    staleTime: 5 * 60_000,
  });
}
