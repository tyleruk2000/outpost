/**
 * Streets for routes on the server (`/api/streets`): the optional streets service's state,
 * door-to-door, walking and cycling routes, reachable areas and building the streets.
 * Query keys start with "streets", which the `streets.changed` event refreshes.
 */
import type {
  StreetsReachRequest,
  StreetsReachResult,
  StreetsRouteRequest,
  StreetsRouteResult,
  StreetsStatusResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const streetsKeys = {
  all: ["streets"] as const,
  status: ["streets", "status"] as const,
  estimate: (regions: string) => ["streets", "estimate", regions] as const,
  reach: (key: string) => ["streets", "reach", key] as const,
};

/**
 * Where streets stand. Read once and kept: a build moving on, or streets added or removed,
 * sends `streets.changed`, which asks again.
 */
export const useStreetsStatus = (enabled = true) =>
  useQuery({
    queryKey: streetsKeys.status,
    queryFn: () => api.get<StreetsStatusResponse>("/api/streets/status"),
    staleTime: 30_000,
    enabled,
  });

/** Plans a door-to-door drive, a walk or a ride. One at a time; leaving the panel drops the answer. */
export const usePlanStreetsRoute = () =>
  useMutation({ mutationFn: (request: StreetsRouteRequest) => api.post<StreetsRouteResult>("/api/streets/route", request) });

/** The areas reachable from a point; asked again only when the point, the way or the time changes. */
export function useStreetsReach(request: StreetsReachRequest | null) {
  const key = request
    ? `${request.point && "lat" in request.point ? `${request.point.lat.toFixed(5)},${request.point.lon.toFixed(5)}` : ""}|${request.mode}|${request.minutes.join(",")}|${request.source ?? "auto"}`
    : "";
  return useQuery({
    queryKey: streetsKeys.reach(key),
    queryFn: ({ signal }) => api.post<StreetsReachResult>("/api/streets/reach", request, undefined, signal),
    enabled: request !== null,
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
}

/** Stops a build under way: its task is cancelled, and the streets in use stay as they were. */
export function useStopStreetsBuild() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => api.post(`/api/jobs/${encodeURIComponent(jobId)}/cancel`),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: streetsKeys.all });
      void client.invalidateQueries({ queryKey: ["maps"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useRemoveStreets() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ ok: true }>("/api/streets/tiles"),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: streetsKeys.all });
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}
