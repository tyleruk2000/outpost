/** Data hooks for the maps screen. Every key starts with "maps" so live events refresh them. */
import type {
  Bbox,
  DownloadDto,
  MapEstimate,
  MapOverview,
  MapRegionsResponse,
  MapSources,
  MarkerColor,
  MarkerDto,
  MarkerIcon,
  PlaceSearchResponse,
  PlacesDataset,
  RoutePoint,
  RouteSaveResponse,
  TrackDto,
  TrackImportResponse,
  TrackWithGeometryDto,
} from "@outpost/shared";
import { keepPreviousData, type UseQueryResult, useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const mapsKeys = {
  sources: ["maps", "sources"] as const,
  overview: ["maps", "overview"] as const,
  regions: ["maps", "regions"] as const,
  markers: ["maps", "markers"] as const,
  tracks: ["maps", "tracks"] as const,
  track: (id: string) => ["maps", "track", id] as const,
  places: (query: string, near: string) => ["maps", "places", query, near] as const,
};

export const useMapSources = () => useQuery({ queryKey: mapsKeys.sources, queryFn: () => api.get<MapSources>("/api/maps/sources") });

export const useMapOverview = () => useQuery({ queryKey: mapsKeys.overview, queryFn: () => api.get<MapOverview>("/api/maps/overview") });

export const useMapRegions = (enabled: boolean) =>
  useQuery({ queryKey: mapsKeys.regions, queryFn: () => api.get<MapRegionsResponse>("/api/maps/regions"), enabled });

export const useMarkers = () =>
  useQuery({
    queryKey: mapsKeys.markers,
    queryFn: () => api.get<{ markers: MarkerDto[] }>("/api/maps/markers"),
    select: (data) => data.markers,
  });

export const useTracks = () =>
  useQuery({
    queryKey: mapsKeys.tracks,
    queryFn: () => api.get<{ tracks: TrackDto[] }>("/api/maps/tracks"),
    select: (data) => data.tracks,
  });

const trackQuery = (id: string) => ({
  queryKey: mapsKeys.track(id),
  queryFn: () => api.get<{ track: TrackWithGeometryDto }>(`/api/maps/tracks/${id}`).then((data) => data.track),
  // Geometry is large and only changes when the track's shape is edited or it is deleted; renames arrive through the list.
  staleTime: 5 * 60_000,
});

export const useTrack = (id: string | undefined) => useQuery({ ...trackQuery(id ?? ""), enabled: Boolean(id) });

// Kept outside the hook: with a stable `combine`, the list keeps its identity between
// renders until a track's data actually changes, so the map is not redrawn on every keystroke.
const loadedTracks = (results: Array<UseQueryResult<TrackWithGeometryDto>>) =>
  results.flatMap((result) => (result.data ? [result.data] : []));

/** The geometry of every track that should be drawn. */
export function useTrackGeometries(ids: string[]): TrackWithGeometryDto[] {
  return useQueries({ queries: ids.map(trackQuery), combine: loadedTracks });
}

export function usePlaceSearch(query: string, near: { lat: number; lon: number } | undefined) {
  const nearText = near ? `${near.lat.toFixed(3)},${near.lon.toFixed(3)}` : "";
  return useQuery({
    queryKey: mapsKeys.places(query, nearText),
    queryFn: ({ signal }) => api.get<PlaceSearchResponse>("/api/maps/places", { q: query, near: nearText || undefined, limit: 8 }, signal),
    enabled: query.length >= 2,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

export interface MarkerInput {
  name: string;
  note: string;
  lat: number;
  lon: number;
  color: MarkerColor;
  icon: MarkerIcon;
  isFavorite: boolean;
}

export function useSaveMarker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: Partial<MarkerInput> & { id?: string }) =>
      id ? api.patch<{ marker: MarkerDto }>(`/api/maps/markers/${id}`, input) : api.post<{ marker: MarkerDto }>("/api/maps/markers", input),
    onSuccess: ({ marker }) => {
      client.setQueryData<{ markers: MarkerDto[] }>(mapsKeys.markers, (current) =>
        current
          ? {
              markers: current.markers.some((item) => item.id === marker.id)
                ? current.markers.map((item) => (item.id === marker.id ? marker : item))
                : [marker, ...current.markers],
            }
          : current,
      );
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useDeleteMarker() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/maps/markers/${id}`),
    onSuccess: (_data, id) => {
      client.setQueryData<{ markers: MarkerDto[] }>(mapsKeys.markers, (current) =>
        current ? { markers: current.markers.filter((item) => item.id !== id) } : current,
      );
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useUpdateTrack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; name?: string; color?: MarkerColor }) =>
      api.patch<{ track: TrackDto }>(`/api/maps/tracks/${id}`, patch),
    onSuccess: ({ track }) => {
      client.setQueryData<{ tracks: TrackDto[] }>(mapsKeys.tracks, (current) =>
        current ? { tracks: current.tracks.map((item) => (item.id === track.id ? track : item)) } : current,
      );
      client.setQueryData<TrackWithGeometryDto>(mapsKeys.track(track.id), (current) => (current ? { ...current, ...track } : current));
      void client.invalidateQueries({ queryKey: mapsKeys.tracks });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export interface SaveRouteInput {
  /** The saved route whose line is replaced; absent to save a new one. */
  id?: string;
  name: string;
  color: MarkerColor;
  points: RoutePoint[];
}

/**
 * Saves a route drawn on the map: a new one, or a new shape for one that exists. The
 * server works out its length and, where terrain is installed, its heights.
 */
export function useSaveRoute() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, color, points }: SaveRouteInput) =>
      id
        ? api.put<RouteSaveResponse>(`/api/maps/tracks/${id}/points`, { points })
        : api.post<RouteSaveResponse>("/api/maps/tracks", { name, color, points }),
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
      // The line itself changed: what is cached for it is wrong, not merely old.
      void client.invalidateQueries({ queryKey: mapsKeys.track(track.id) });
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
  });
}

export function useDeleteTrack() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ ok: true }>(`/api/maps/tracks/${id}`),
    onSuccess: (_data, id) => {
      client.setQueryData<{ tracks: TrackDto[] }>(mapsKeys.tracks, (current) =>
        current ? { tracks: current.tracks.filter((item) => item.id !== id) } : current,
      );
      client.removeQueries({ queryKey: mapsKeys.track(id) });
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function importGpx(file: File, importWaypointsAsMarkers: boolean): Promise<TrackImportResponse> {
  const form = new FormData();
  // Fields go before the file: the server reads the parts in order.
  form.append("importWaypointsAsMarkers", importWaypointsAsMarkers ? "1" : "0");
  form.append("file", file, file.name);
  return api.upload<TrackImportResponse>("/api/maps/tracks/import", form);
}

export interface EstimateRequest {
  bbox: Bbox;
  maxZoom: number;
  includeTerrain: boolean;
}

export interface RegionEstimate {
  map: MapEstimate;
  terrain: MapEstimate | null;
  totalBytes: number;
}

/** The exact size of a region, read from the remote archive. Needs a connection; takes a few seconds. */
export async function estimateRegion(request: EstimateRequest): Promise<RegionEstimate> {
  const map = await api.post<MapEstimate>("/api/maps/estimate", { bbox: request.bbox, maxZoom: request.maxZoom });
  const terrain = request.includeTerrain
    ? await api.post<MapEstimate>("/api/maps/estimate", { bbox: request.bbox, maxZoom: request.maxZoom, tileType: "terrain" })
    : null;
  return { map, terrain, totalBytes: map.sizeBytes + (terrain?.sizeBytes ?? 0) };
}

export interface StartRegionRequest extends EstimateRequest {
  name: string;
  regionId?: string;
  locationId?: string;
}

export function useStartRegion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: StartRegionRequest) => api.post<{ downloads: DownloadDto[] }>("/api/maps/regions", request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["maps"] });
      void client.invalidateQueries({ queryKey: ["downloads"] });
    },
  });
}

export function useRemoveRegion() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, deleteFiles }: { id: string; deleteFiles: boolean }) =>
      api.delete<{ ok: true }>(`/api/collections/${id}`, { deleteFiles }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["maps"] });
      void client.invalidateQueries({ queryKey: ["collections"] });
      void client.invalidateQueries({ queryKey: ["storage"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export type PlacesDatasetRequest = ({ dataset: "cities500" | "cities15000" } | { dataset: "country"; country: string }) & {
  /** The storage location to download to; the default one when absent. */
  locationId?: string;
};

export function useStartPlaces() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: PlacesDatasetRequest) => api.post<{ download: DownloadDto }>("/api/maps/places/datasets", request),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["maps"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useRemovePlaces() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (dataset: PlacesDataset) => api.delete<{ ok: true }>(`/api/maps/places/datasets/${dataset.id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["maps"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}
