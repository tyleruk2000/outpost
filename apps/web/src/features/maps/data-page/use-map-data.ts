/**
 * The Map data screen's data: everything kept for the map in one answer, kept up to date by
 * the server's events, and the one press that adds a country's map data. Keys start with
 * "maps" so that `maps.changed` and `collections.changed` refresh them by themselves.
 */
import type {
  MapDataAddRequest,
  MapDataAddResponse,
  MapDataCheckRequest,
  MapDataCheckResponse,
  MapDataResponse,
  MapDataUpdateRequest,
  MapDataUpdateResponse,
  ReferenceEstimate,
  ReferenceRegionDto,
  ReferenceRegionsResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef } from "react";
import { api } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { estimateRegion, type RegionEstimate } from "../data";

export const mapDataKeys = { all: ["maps", "data"] as const };

/** Everything kept for the map. Refreshed when a download or a task changes state, and when roads, places or storage change. */
export function useMapData() {
  const client = useQueryClient();
  const states = useRef(new Map<string, string>());
  const refresh = () => void client.invalidateQueries({ queryKey: mapDataKeys.all });
  // Progress arrives twice a second; the list is asked again only when something starts, stops or finishes.
  const onState = ({ id, data }: { id?: string; data?: unknown }) => {
    const state = (data as { state?: string } | undefined)?.state;
    if (!id || !state || states.current.get(id) === state) return;
    const known = states.current.has(id);
    states.current.set(id, state);
    if (known) refresh();
  };
  useServerEvent("download.updated", onState);
  useServerEvent("job.updated", onState);
  useServerEvent("download.removed", refresh);
  useServerEvent("roads.changed", refresh);
  useServerEvent("layers.changed", refresh);
  useServerEvent("storage.changed", refresh);
  return useQuery({ queryKey: mapDataKeys.all, queryFn: () => api.get<MapDataResponse>("/api/maps/data") });
}

export function useAddMapData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (request: MapDataAddRequest) => api.post<MapDataAddResponse>("/api/maps/data/add", request),
    onSuccess: () => {
      for (const key of [["maps"], ["downloads"], ["jobs"], ["roads"], ["layers"], ["settings"]])
        void client.invalidateQueries({ queryKey: key });
    },
  });
}

/** Asks the source, on a press, how large and how new its newest copy is. Nothing is downloaded. */
export function useCheckUpdate() {
  return useMutation({
    mutationFn: (collectionId: string) =>
      api.post<MapDataCheckResponse>("/api/maps/data/check", { collectionId } satisfies MapDataCheckRequest),
  });
}

/** Downloads the same area or list again; the one kept stays until the new one is in place and checked. */
export function useUpdateMapData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (collectionId: string) =>
      api.post<MapDataUpdateResponse>("/api/maps/data/update", { collectionId } satisfies MapDataUpdateRequest),
    onSuccess: () => {
      for (const key of [["maps"], ["downloads"], ["jobs"]]) void client.invalidateQueries({ queryKey: key });
    },
  });
}

/** What "Check sizes" asks for: the map's area, and the country file's region. */
export interface SizeRequest {
  map: { bbox: [number, number, number, number]; maxZoom: number; terrain: boolean } | null;
  /** The country file's region, or the country to find it for once Geofabrik's list is read. */
  file: { regionId: string | null; country: string | null; kept: boolean } | null;
}

export interface Sizes {
  map: RegionEstimate | null;
  /** The country file: its size and Geofabrik's host, or held already. */
  file: { regionId: string; bytes: number | null; host: string | null; kept: boolean } | null;
  /** Every host that was asked, in the order asked. */
  hosts: string[];
}

const hostOf = (url: string) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** The region Geofabrik has for a whole country. */
export const countryRegion = (regions: ReferenceRegionDto[], country: string | null) =>
  country ? (regions.find((region) => region.depth === 0 && region.country === country) ?? null) : null;

/**
 * One press, every size: the map's (asked of the map source and the terrain source) and the country
 * file's (asked of Geofabrik, after reading its list of regions where it is not held yet). A kept
 * country file is not asked about: nothing is downloaded for it.
 */
export function useCheckSizes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (request: SizeRequest): Promise<Sizes> => {
      const hosts: string[] = [];
      let file: Sizes["file"] = null;
      if (request.file) {
        let regionId = request.file.regionId;
        if (!regionId) {
          const list = await api.post<ReferenceRegionsResponse>("/api/reference/regions", {});
          hosts.push(hostOf(list.source));
          void client.invalidateQueries({ queryKey: ["layers", "regions"] });
          void client.invalidateQueries({ queryKey: mapDataKeys.all });
          regionId = countryRegion(list.regions, request.file.country)?.id ?? null;
          if (!regionId) throw new Error("Geofabrik has no file for this country on its own. Choose one of its parts instead.");
        }
        if (request.file.kept) file = { regionId, bytes: null, host: null, kept: true };
        else {
          const estimate = await api.post<ReferenceEstimate>("/api/reference/estimate", {
            provider: "osm-extract",
            scope: { regions: [regionId] },
          });
          const item = estimate.items[0];
          if (!item) throw new Error(estimate.notes[0] ?? "Geofabrik did not give a size for this region.");
          if (item.host) hosts.push(item.host);
          file = { regionId, bytes: item.bytes || null, host: item.host || null, kept: !item.host };
        }
      }
      let map: RegionEstimate | null = null;
      if (request.map) {
        map = await estimateRegion({ bbox: request.map.bbox, maxZoom: request.map.maxZoom, includeTerrain: request.map.terrain });
        hosts.push(hostOf(map.map.sourceUrl));
        if (map.terrain) hosts.push(hostOf(map.terrain.sourceUrl));
      }
      return { map, file, hosts: [...new Set(hosts)] };
    },
  });
}
