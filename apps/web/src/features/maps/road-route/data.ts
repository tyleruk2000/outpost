/**
 * Road routes on the server (`/api/roads`): the networks installed, the crossings in them,
 * planning a route and the routes saved. Query keys start with "roads", which the
 * `roads.changed` event refreshes.
 */
import type {
  Bbox,
  RoadCountriesResponse,
  RoadCrossingsResponse,
  RoadNetworkInstallRequest,
  RoadNetworkInstallResponse,
  RoadNetworksResponse,
  RoadRouteRequest,
  RoadRouteResult,
  SavedRoadRouteDto,
  SavedRoadRoutesResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const roadsKeys = {
  all: ["roads"] as const,
  networks: ["roads", "networks"] as const,
  crossings: ["roads", "crossings"] as const,
  routes: ["roads", "routes"] as const,
  route: (id: string) => ["roads", "routes", id] as const,
  countries: (boxes: string) => ["roads", "countries", boxes] as const,
};

export const useRoadNetworks = () =>
  useQuery({ queryKey: roadsKeys.networks, queryFn: () => api.get<RoadNetworksResponse>("/api/roads/networks") });

export const useRoadCrossings = (enabled = true) =>
  useQuery({
    queryKey: roadsKeys.crossings,
    queryFn: () => api.get<RoadCrossingsResponse>("/api/roads/crossings"),
    select: (data) => data.crossings,
    enabled,
  });

/** The countries the installed map regions cover, worked out on this Outpost: offered first when a network is added. */
export function useRoadCountries(boxes: Bbox[]) {
  const key = boxes.map((box) => box.map((edge) => edge.toFixed(2)).join(",")).join(";");
  return useQuery({
    queryKey: roadsKeys.countries(key),
    queryFn: () => api.post<RoadCountriesResponse>("/api/roads/countries", { boxes }),
    select: (data) => data.countries,
    enabled: boxes.length > 0,
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Plans a route. One at a time; leaving the panel drops the answer. */
export const usePlanRoadRoute = () =>
  useMutation({ mutationFn: (request: RoadRouteRequest) => api.post<RoadRouteResult>("/api/roads/route", request) });

export const useSavedRoadRoutes = () =>
  useQuery({ queryKey: roadsKeys.routes, queryFn: () => api.get<SavedRoadRoutesResponse>("/api/roads/routes"), select: (d) => d.routes });

export const useSavedRoadRoute = (id: string | null) =>
  useQuery({
    queryKey: roadsKeys.route(id ?? ""),
    queryFn: () => api.get<SavedRoadRouteDto>(`/api/roads/routes/${encodeURIComponent(id ?? "")}`),
    enabled: Boolean(id),
  });

export function useSaveRoadRoute() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; route: RoadRouteResult }) => api.post<SavedRoadRouteDto>("/api/roads/routes", input),
    onSuccess: () => client.invalidateQueries({ queryKey: roadsKeys.routes }),
  });
}

export function useRenameRoadRoute() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      api.patch<SavedRoadRouteDto>(`/api/roads/routes/${encodeURIComponent(id)}`, { name }),
    onSuccess: () => client.invalidateQueries({ queryKey: roadsKeys.routes }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useDeleteRoadRoute() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/roads/routes/${encodeURIComponent(id)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: roadsKeys.routes }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useInstallRoadNetwork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: RoadNetworkInstallRequest) => api.post<RoadNetworkInstallResponse>("/api/roads/networks", request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: roadsKeys.all });
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useUpdateRoadNetwork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<RoadNetworkInstallResponse>(`/api/roads/networks/${encodeURIComponent(id)}/update`, {}),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: roadsKeys.all });
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["jobs"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useRemoveRoadNetwork() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/roads/networks/${encodeURIComponent(id)}`),
    onSuccess: () => client.invalidateQueries({ queryKey: roadsKeys.all }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}
