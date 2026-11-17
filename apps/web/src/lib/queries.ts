/** Shared data hooks for things several screens read: system, storage, jobs, settings. */
import type { JobDto, Settings, StorageLocationsResponse, SystemInfo } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "./api";

// Not polled: memory and load are figures read in passing, taken when a screen opens, and the
// queue counts in it are fetched again when a job starts or ends (lib/events.tsx).
export const useSystem = () => useQuery({ queryKey: ["system"], queryFn: () => api.get<SystemInfo>("/api/system") });

export const useStorage = () =>
  useQuery({ queryKey: ["storage", "locations"], queryFn: () => api.get<StorageLocationsResponse>("/api/storage/locations") });

export const useActiveJobs = () =>
  useQuery({
    queryKey: ["jobs", "active"],
    queryFn: () => api.get<{ jobs: JobDto[] }>("/api/jobs", { active: true }),
    select: (data) => data.jobs,
  });

export const useSettings = () =>
  useQuery({ queryKey: ["settings"], queryFn: () => api.get<{ settings: Settings }>("/api/settings"), select: (data) => data.settings });

export function useUpdateSettings() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.patch<{ settings: Settings }>("/api/settings", patch),
    onSuccess: (data) => client.setQueryData(["settings"], data),
    onError: (error) => toast.error(errorMessage(error)),
  });
}
