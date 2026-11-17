/** Data hooks for the reference layers. Every key starts with "layers" so live events refresh them. */
import type {
  Bbox,
  DownloadDto,
  LayerSearchResponse,
  PopulationGridResponse,
  ReferenceCatalogueResponse,
  ReferenceEstimate,
  ReferenceEstimateRequest,
  ReferenceFeatureDetail,
  ReferenceFilter,
  ReferenceLayersResponse,
  ReferenceOverlayResponse,
  ReferencePackDto,
  ReferenceStartRequest,
} from "@outpost/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const layersKeys = {
  all: ["layers"] as const,
  catalogue: ["layers", "catalogue"] as const,
  summary: ["layers", "summary"] as const,
  packs: ["layers", "packs"] as const,
  overlay: (query: string) => ["layers", "overlay", query] as const,
  population: (query: string) => ["layers", "population", query] as const,
  feature: (id: number) => ["layers", "feature", id] as const,
  search: (query: string) => ["layers", "search", query] as const,
};

const filterParams = (filter: ReferenceFilter) => {
  const params = new URLSearchParams();
  params.set("layers", filter.layers.join(","));
  if (filter.countries?.length) params.set("countries", filter.countries.join(","));
  if (filter.providers?.length) params.set("providers", filter.providers.join(","));
  if (filter.kinds?.length) params.set("kinds", filter.kinds.join(","));
  return params;
};

export const useCatalogue = (enabled = true) =>
  useQuery({
    queryKey: layersKeys.catalogue,
    queryFn: () => api.get<ReferenceCatalogueResponse>("/api/reference/catalogue"),
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

export const useLayersSummary = (enabled = true) =>
  useQuery({ queryKey: layersKeys.summary, queryFn: () => api.get<ReferenceLayersResponse>("/api/reference/layers"), enabled });

export const usePacks = (enabled = true) =>
  useQuery({
    queryKey: layersKeys.packs,
    queryFn: () => api.get<{ packs: ReferencePackDto[] }>("/api/reference/packs"),
    select: (data) => data.packs,
    enabled,
  });

/** What is in a view. `box` is the view rounded outwards (see repeaters' `overlayBox`), so a small nudge asks nothing new. */
export const useOverlay = (box: string | null, zoom: number, filter: ReferenceFilter) => {
  const params = filterParams(filter);
  if (box) params.set("bbox", box);
  params.set("zoom", String(Math.round(zoom)));
  const query = params.toString();
  return useQuery({
    queryKey: layersKeys.overlay(query),
    queryFn: () => api.get<ReferenceOverlayResponse>(`/api/reference/features?${query}`),
    enabled: Boolean(box) && filter.layers.length > 0,
    placeholderData: keepPreviousData,
  });
};

export const usePopulationGrid = (box: string | null, zoom: number, enabled: boolean) => {
  const query = box ? `bbox=${box}&zoom=${Math.round(zoom)}` : "";
  return useQuery({
    queryKey: layersKeys.population(query),
    queryFn: () => api.get<PopulationGridResponse>(`/api/reference/population/grid?${query}`),
    enabled: enabled && Boolean(box),
    placeholderData: keepPreviousData,
  });
};

export const useFeature = (id: number | null) =>
  useQuery({
    queryKey: layersKeys.feature(id ?? 0),
    queryFn: () => api.get<{ feature: ReferenceFeatureDetail }>(`/api/reference/features/${id}`).then((data) => data.feature),
    enabled: id !== null,
    retry: false,
  });

export const useLayerSearch = (text: string, filter: ReferenceFilter) => {
  const params = filterParams(filter);
  params.set("q", text.trim());
  const query = params.toString();
  return useQuery({
    queryKey: layersKeys.search(query),
    queryFn: () => api.get<LayerSearchResponse>(`/api/reference/search?${query}`),
    enabled: text.trim().length >= 2,
    placeholderData: keepPreviousData,
  });
};

export async function featuresAt(lat: number, lon: number, filter: ReferenceFilter) {
  const params = filterParams(filter);
  params.set("lat", lat.toFixed(6));
  params.set("lon", lon.toFixed(6));
  return api.get<{ hits: LayerSearchResponse["hits"] }>(`/api/reference/at?${params}`);
}

export const useEstimate = () =>
  useMutation({ mutationFn: (request: ReferenceEstimateRequest) => api.post<ReferenceEstimate>("/api/reference/estimate", request) });

export function useStartDownloads() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: ReferenceStartRequest) => api.post<{ downloads: DownloadDto[] }>("/api/reference/downloads", request),
    onSuccess: () => client.invalidateQueries({ queryKey: ["downloads"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useRemovePack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      api.delete<{ ok: true }>(`/api/reference/packs/${id}?deleteFiles=${deleteFiles ? "1" : "0"}`),
    onSuccess: () => client.invalidateQueries({ queryKey: layersKeys.all }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export type { Bbox };
