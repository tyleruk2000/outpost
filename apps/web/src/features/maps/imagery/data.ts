/** Data for satellite imagery. Keys start with "maps" so the maps screen's live events refresh them. */
import type { Bbox, DownloadDto, ImageryEstimate, ImageryOverview, SceneSearchResponse } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const imageryKeys = { overview: ["maps", "imagery"] as const };

export const useImagery = () => useQuery({ queryKey: imageryKeys.overview, queryFn: () => api.get<ImageryOverview>("/api/maps/imagery") });

export const searchScenes = (bbox: Bbox) => api.post<SceneSearchResponse>("/api/maps/imagery/scenes", { bbox });

export const estimateArea = (request: { bbox: Bbox; sceneKey: string; locationId?: string }) =>
  api.post<ImageryEstimate>("/api/maps/imagery/estimate", request);

function useStarted<T>(mutationFn: (request: T) => Promise<{ download: DownloadDto }>) {
  const client = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["maps"] });
      void client.invalidateQueries({ queryKey: ["downloads"] });
    },
  });
}

export const useStartArea = () =>
  useStarted((request: { bbox: Bbox; sceneKey: string; name: string; locationId?: string; acceptLarge?: boolean }) =>
    api.post<{ download: DownloadDto }>("/api/maps/imagery/areas", request),
  );

export const useStartWorld = () =>
  useStarted((request: { entryId: string; locationId?: string }) =>
    api.post<{ download: DownloadDto }>("/api/maps/imagery/world", request),
  );
