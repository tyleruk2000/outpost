/** The queue's plan and one download's details, kept fresh, and the actions on the whole queue. */
import type { DownloadDetail, DownloadPlan, DownloadsResponse } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";
import { useServerConnection } from "@/lib/events";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";
import { plural } from "@/lib/utils";
import type { Reading } from "./charts/scale";
import { downloadsKey } from "./use-downloads";

// Both keys start with "downloads", so they are refreshed whenever a download changes state.
export const planKey = ["downloads", "plan"] as const;
export const detailKey = (id: string) => ["downloads", "detail", id] as const;

/**
 * The server does not push the plan or the details; while something is moving and the
 * page can be seen they are asked for again this often. A hidden page sets no timer at
 * all, and is brought up to date when it is shown (React Query asks again then).
 */
const REFRESH_MS = 2500;

/**
 * What the queue will do. Fetched again every few seconds while anything is transferring
 * (and the page is in view); otherwise it only changes when a download changes state,
 * which the live events announce.
 */
export function usePlan(options: { enabled?: boolean } = {}) {
  const shown = usePageVisible();
  return useQuery({
    queryKey: planKey,
    queryFn: () => api.get<DownloadPlan>("/api/downloads/plan"),
    enabled: options.enabled ?? true,
    refetchInterval: (query) => {
      const counts = query.state.data?.counts;
      return shown && counts && counts.active > 0 ? REFRESH_MS : false;
    },
  });
}

/** Everything known about one download; refreshed while it is transferring or being checked. A queued one changes state by event. */
export function useDownloadDetail(id: string) {
  const shown = usePageVisible();
  return useQuery({
    queryKey: detailKey(id),
    queryFn: () => api.get<DownloadDetail>(`/api/downloads/${encodeURIComponent(id)}`),
    refetchInterval: (query) => {
      const state = query.state.data?.download.state;
      return shown && (state === "running" || state === "verifying") ? REFRESH_MS : false;
    },
  });
}

/** Pause or resume everything in the queue at once. */
export function useQueueAction() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: "pause-all" | "resume-all") => api.post<{ paused?: number; resumed?: number }>(`/api/downloads/${action}`),
    onSuccess: (result, action) => {
      const changed = result.paused ?? result.resumed ?? 0;
      if (changed === 0) toast.message(action === "pause-all" ? "Nothing was running or waiting." : "Nothing was paused.");
      else toast.success(action === "pause-all" ? `Paused ${plural(changed, "download")}.` : `Resumed ${plural(changed, "download")}.`);
      return client.invalidateQueries({ queryKey: ["downloads"] });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

/** The present time, refreshed on an interval while the page is in view, for countdowns and clock times. */
export function useNow(intervalMs: number, enabled = true): number {
  const [now, setNow] = useState(() => Date.now());
  const visible = usePageVisible();
  useEffect(() => {
    if (!enabled || !visible) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs, enabled, visible]);
  return now;
}

/** How much of the recent past the throughput chart keeps, in seconds. */
export const THROUGHPUT_WINDOW_SECONDS = 300;

/**
 * Total download speed, sampled once a second while something is transferring and the
 * page is in view. The readings are the sum of what each running download reports, read
 * from the cached list (which live events keep current), so sampling causes no requests
 * and no re-render of anything but its own chart. When nothing is transferring one last
 * reading of nothing is taken and sampling stops. It starts empty: nothing is known
 * about before the screen opened.
 */
export function useThroughput(transferring: boolean): Reading[] {
  const client = useQueryClient();
  // While the server cannot be heard, the cached speeds are old news; nothing is recorded, and the line shows a gap.
  const connected = useServerConnection();
  const visible = usePageVisible();
  const [readings, setReadings] = useState<Reading[]>([]);
  useEffect(() => {
    if (!connected || !visible) return;
    const sample = () => {
      const list = client.getQueryData<DownloadsResponse>(downloadsKey)?.downloads;
      if (!list) return;
      const value = list.reduce((sum, item) => sum + (item.state === "running" ? (item.bytesPerSecond ?? 0) : 0), 0);
      const at = Date.now();
      setReadings((current) => {
        const from = at - THROUGHPUT_WINDOW_SECONDS * 1000;
        const kept = current.length > 0 && current[0]!.at < from ? current.filter((reading) => reading.at >= from) : current;
        return [...kept, { at, value }];
      });
    };
    sample();
    if (!transferring) return;
    const timer = window.setInterval(sample, 1000);
    return () => window.clearInterval(timer);
  }, [client, connected, visible, transferring]);
  return readings;
}
