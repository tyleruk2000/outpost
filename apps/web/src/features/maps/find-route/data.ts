/** Data hooks for finding a route. Keys start with "maps" like the rest of the screen's. */
import type {
  FoundRouteRef,
  MarkerColor,
  RouteAddRequest,
  RoutePreview,
  RouteSaveResponse,
  RouteSearchRequest,
  RouteSearchResponse,
  RouteSourcesResponse,
  TrackDto,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef } from "react";
import { api } from "@/lib/api";
import { mapsKeys } from "../data";

/** The declared route sources. Read from Outpost itself: asking for this list contacts nobody. */
export const useRouteSources = () =>
  useQuery({
    queryKey: ["maps", "route-sources"] as const,
    queryFn: () => api.get<RouteSourcesResponse>("/api/maps/route-sources"),
    staleTime: 5 * 60_000,
  });

/**
 * One question to a route source at a time, sent only when `ask` is called. Calling
 * `cancel` (or asking again) drops the question in flight, here and on the server.
 */
function useAsk<Input, Output>(path: string) {
  const controller = useRef<AbortController | null>(null);
  const mutation = useMutation({
    mutationFn: (input: Input) => {
      controller.current?.abort();
      controller.current = new AbortController();
      return api.post<Output>(path, input, undefined, controller.current.signal);
    },
  });
  const { reset } = mutation;
  const cancel = useCallback(() => {
    controller.current?.abort();
    controller.current = null;
    reset();
  }, [reset]);
  return { ...mutation, cancel };
}

export const useRouteSearch = () => useAsk<RouteSearchRequest, RouteSearchResponse>("/api/maps/route-search");
export const useRoutePreview = () => useAsk<{ sourceId?: string; ref: FoundRouteRef }, RoutePreview>("/api/maps/route-search/preview");

function useSavedTrack<Input>(send: (input: Input) => Promise<RouteSaveResponse>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: send,
    onSuccess: ({ track }) => {
      client.setQueryData<{ tracks: TrackDto[] }>(mapsKeys.tracks, (current) =>
        current
          ? {
              tracks: current.tracks.some((item) => item.id === track.id)
                ? current.tracks.map((item) => (item.id === track.id ? track : item))
                : [track, ...current.tracks],
            }
          : current,
      );
      void client.invalidateQueries({ queryKey: mapsKeys.track(track.id) });
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
  });
}

/** Saves the previewed route as a track. The server already holds it: nothing is fetched again. */
export const useAddFoundRoute = () =>
  useSavedTrack((input: RouteAddRequest & { color?: MarkerColor }) => api.post<RouteSaveResponse>("/api/maps/route-search/add", input));

/** Reads heights again for a found route, from terrain installed since it was added. */
export const useFillFoundHeights = () => useSavedTrack((id: string) => api.post<RouteSaveResponse>(`/api/maps/tracks/${id}/heights`));
