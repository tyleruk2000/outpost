/** The downloads list, kept live, and the things a person can do to one download. */
import {
  DOWNLOAD_HISTORY_PAGE,
  type DownloadDto,
  type DownloadHistoryResponse,
  type DownloadResponse,
  type DownloadsResponse,
} from "@outpost/shared";
import { type QueryClient, useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useRef } from "react";
import { api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";

export const downloadsKey = ["downloads", "list"] as const;

function patchDownload(client: QueryClient, download: DownloadDto): void {
  client.setQueryData<DownloadsResponse>(downloadsKey, (current) => {
    if (!current) return current;
    const index = current.downloads.findIndex((item) => item.id === download.id);
    if (index === -1) return { ...current, downloads: [download, ...current.downloads] };
    const downloads = current.downloads.slice();
    downloads[index] = download;
    return { ...current, downloads };
  });
}

/**
 * What to do with a download that changed. Progress arrives about twice a second, and a
 * page nobody can see has no bar to move: while hidden nothing is drawn, and once shown
 * the list is asked for again, so that it is right however much was missed.
 */
export function useDownloadUpdates(): (download: DownloadDto) => void {
  const client = useQueryClient();
  const shown = usePageVisible();
  const missed = useRef(false);
  useEffect(() => {
    if (!shown || !missed.current) return;
    missed.current = false;
    void client.invalidateQueries({ queryKey: downloadsKey });
  }, [shown, client]);
  return useCallback(
    (download: DownloadDto) => {
      if (document.visibilityState === "hidden") missed.current = true;
      else patchDownload(client, download);
    },
    [client],
  );
}

/**
 * Every download not finished and the newest page of history, newest first. Progress
 * events carry the whole download, so the cached list is patched as they arrive and the
 * bar moves without waiting for a refetch.
 */
export function useDownloads() {
  const update = useDownloadUpdates();
  useServerEvent("download.updated", ({ data }) => {
    const download = data as DownloadDto | undefined;
    if (download?.id) update(download);
  });
  return useQuery({
    queryKey: downloadsKey,
    queryFn: () => api.get<DownloadsResponse>("/api/downloads"),
    select: (data) => data.downloads,
  });
}

/**
 * History older than the page that comes with the list, a page at a time, from when it is
 * first asked for. A download finishing in between moves the pages along by one, so a row
 * may come twice: the screen keeps one of each.
 */
export function useOlderHistory(asked: boolean) {
  return useInfiniteQuery({
    queryKey: ["downloads", "history"],
    queryFn: ({ pageParam }) =>
      api.get<DownloadHistoryResponse>("/api/downloads/history", { offset: pageParam, limit: DOWNLOAD_HISTORY_PAGE }),
    initialPageParam: DOWNLOAD_HISTORY_PAGE,
    getNextPageParam: (last) => {
      const next = last.offset + last.downloads.length;
      return last.downloads.length > 0 && next < last.total ? next : undefined;
    },
    enabled: asked,
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
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useRemoveDownload(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ ok: true }>(`/api/downloads/${id}`),
    onSuccess: () => {
      // Removal is not announced as a download update, so the lists are refreshed here.
      client.setQueryData<DownloadsResponse>(downloadsKey, (current) =>
        current ? { ...current, downloads: current.downloads.filter((item) => item.id !== id) } : current,
      );
      void client.invalidateQueries({ queryKey: ["downloads"] });
      void client.invalidateQueries({ queryKey: ["catalog"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}
