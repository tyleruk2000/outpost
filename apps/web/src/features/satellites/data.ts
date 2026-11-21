/**
 * The elements and transmitters the server keeps, and the one press that fetches them.
 * Refreshed by `satellites.changed`; never polled.
 */
import type { SatelliteElements, SatellitesFetchResponse, SatellitesResponse, SatelliteTransmitter } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const SATELLITES_KEY = ["satellites"] as const;

export const useSatellites = (enabled = true) =>
  useQuery({
    queryKey: SATELLITES_KEY,
    queryFn: () => api.get<SatellitesResponse>("/api/satellites"),
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

export function useFetchElements() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SatellitesFetchResponse>("/api/satellites/fetch", {}),
    onSettled: () => client.invalidateQueries({ queryKey: SATELLITES_KEY }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

/** The transmitters SatNOGS lists as in use for one satellite, downlinks first. */
export function liveTransmitters(transmitters: readonly SatelliteTransmitter[], noradId: number): SatelliteTransmitter[] {
  return transmitters
    .filter(
      (transmitter) =>
        transmitter.noradId === noradId && transmitter.alive && (transmitter.downlinkLowHz !== null || transmitter.uplinkLowHz !== null),
    )
    .sort((a, b) => Number(b.downlinkLowHz !== null) - Number(a.downlinkLowHz !== null) || (a.downlinkLowHz ?? 0) - (b.downlinkLowHz ?? 0));
}

export const inGroup = (satellite: SatelliteElements, group: string) =>
  satellite.groups.includes(group as SatelliteElements["groups"][number]);

/** The ISS first when there, as LogBook73 chose. */
export const ISS = 25544;
