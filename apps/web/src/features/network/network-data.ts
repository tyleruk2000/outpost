import type { JobDto, NetworkDevice, NetworkDevicePatch, NetworkStatus } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { notify } from "@/lib/notify";

export const NETWORK_KEY = ["network"] as const;
const FINAL = new Set(["succeeded", "failed", "cancelled"]);

export const useNetwork = () => useQuery({ queryKey: NETWORK_KEY, queryFn: () => api.get<NetworkStatus>("/api/network") });

/**
 * The scan or fetch under way, kept up to date by the server's job events between
 * loads of the screen's data, and that data loaded again when one ends.
 */
export function useNetworkJobs(status: NetworkStatus | undefined): { scan: JobDto | null; makers: JobDto | null } {
  const client = useQueryClient();
  const [live, setLive] = useState<Record<string, JobDto>>({});
  useServerEvent("job.updated", ({ data }) => {
    const job = data as JobDto | undefined;
    if (!job?.type.startsWith("network.")) return;
    setLive((current) => ({ ...current, [job.type]: job }));
    if (FINAL.has(job.state)) void client.invalidateQueries({ queryKey: NETWORK_KEY });
  });
  const pick = (type: string, fromStatus: JobDto | null | undefined) => {
    const event = live[type];
    let job = fromStatus ?? null;
    // The newer of the two: an event about this job, or about one started since the data was loaded.
    if (event && (!job || (event.id === job.id ? event.updatedAt >= job.updatedAt : event.createdAt > job.createdAt))) job = event;
    return job && !FINAL.has(job.state) ? job : null;
  };
  return { scan: pick("network.scan", status?.job), makers: pick("network.makers", status?.makersJob) };
}

function useNetworkMutation<T, V = void>(run: (vars: V) => Promise<T>, failure: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => void client.invalidateQueries({ queryKey: NETWORK_KEY }),
    onError: (error) => notify.error(failure, { description: errorMessage(error) }),
  });
}

export const useStartScan = () => useNetworkMutation(() => api.post<{ job: JobDto }>("/api/network/scan"), "The scan could not be started");
export const useStopJob = () =>
  useNetworkMutation((id: string) => api.post<{ job: JobDto }>(`/api/jobs/${id}/cancel`), "It could not be stopped");
export const useFetchMakers = () =>
  useNetworkMutation(() => api.post<{ job: JobDto }>("/api/network/makers"), "The registry could not be fetched");
export const useRemoveMakers = () =>
  useNetworkMutation(() => api.delete<{ ok: true }>("/api/network/makers"), "The registry could not be removed");
export const useUpdateDevice = () =>
  useNetworkMutation(
    ({ id, patch }: { id: string; patch: NetworkDevicePatch }) => api.patch<{ device: NetworkDevice }>(`/api/network/devices/${id}`, patch),
    "The name and note could not be kept",
  );
export const useForgetDevice = () =>
  useNetworkMutation((id: string) => api.delete<{ ok: true }>(`/api/network/devices/${id}`), "The device could not be forgotten");
export const useForgetAll = () =>
  useNetworkMutation(() => api.delete<{ removed: number }>("/api/network/devices"), "The devices could not be forgotten");
