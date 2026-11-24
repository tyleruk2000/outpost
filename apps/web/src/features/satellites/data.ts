/**
 * The elements and transmitters the server keeps, and the one press that fetches them.
 * Refreshed by `satellites.changed`; never polled.
 */
import type {
  SatelliteElements,
  SatellitesFetchResponse,
  SatellitesResponse,
  SatelliteTransmitter,
  SatelliteWikipedia,
} from "@outpost/shared";
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

/**
 * "Read about it on Wikipedia": looks in a Wikipedia copy on this Outpost first and, when
 * there is none, asks Wikipedia online; `online` asks online after the copy had nothing.
 */
export function useReadWikipedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ noradId, online }: { noradId: number; online?: boolean }) =>
      api.post<{ wikipedia: SatelliteWikipedia }>(`/api/satellites/${noradId}/wikipedia`, online ? { online: true } : {}),
    onSettled: () => client.invalidateQueries({ queryKey: SATELLITES_KEY }),
  });
}

/** Offers again the articles discarded for a satellite. */
export function useForgetDiscarded() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (noradId: number) => api.delete<{ ok: true }>(`/api/satellites/${noradId}/wikipedia/discarded`),
    onSettled: () => client.invalidateQueries({ queryKey: SATELLITES_KEY }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useDiscardWikipedia() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (noradId: number) => api.delete<{ ok: true }>(`/api/satellites/${noradId}/wikipedia`),
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
