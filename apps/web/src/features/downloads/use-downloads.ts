/** The downloads list, kept live, and the things a person can do to one download. */
import type { DownloadDto, DownloadResponse, DownloadsResponse } from "@outpost/shared";
import { type QueryClient, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";

export const downloadsKey = ["downloads", "list"] as const;

function patchDownload(client: QueryClient, download: DownloadDto): void {
  client.setQueryData<DownloadsResponse>(downloadsKey, (current) => {
    if (!current) return current;
    const index = current.downloads.findIndex((item) => item.id === download.id);
    if (index === -1) return { downloads: [download, ...current.downloads] };
    const downloads = current.downloads.slice();
    downloads[index] = download;
    return { downloads };
  });
}

/**
 * Every download, newest first. Progress events carry the whole download, so the cached
 * list is patched as they arrive and the bar moves without waiting for a refetch.
 */
export function useDownloads() {
  const client = useQueryClient();
  useServerEvent("download.updated", ({ data }) => {
    const download = data as DownloadDto | undefined;
    if (download?.id) patchDownload(client, download);
  });
  return useQuery({
    queryKey: downloadsKey,
    queryFn: () => api.get<DownloadsResponse>("/api/downloads"),
    select: (data) => data.downloads,
  });
}

export type DownloadAction = "pause" | "resume" | "cancel" | "retry";

export function useDownloadAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: DownloadAction) => api.post<DownloadResponse>(`/api/downloads/${id}/${action}`),
    onSuccess: (data) => {
      patchDownload(client, data.download);
      void client.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useRemoveDownload(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`/api/downloads/${id}`),
    onSuccess: () => {
      // Removal is not announced as a download update, so the lists are refreshed here.
      client.setQueryData<DownloadsResponse>(downloadsKey, (current) =>
        current ? { downloads: current.downloads.filter((item) => item.id !== id) } : current,
      );
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}
