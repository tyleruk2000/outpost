/** Shared data hooks for things several screens read: session, system, storage, jobs, settings. */
import type { JobDto, SessionInfo, Settings, StorageLocationsResponse, SystemInfo } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "./api";

export const useSession = () =>
  useQuery({ queryKey: ["session"], queryFn: () => api.get<SessionInfo>("/api/auth/session"), staleTime: 60_000 });

export const useSystem = () =>
  useQuery({ queryKey: ["system"], queryFn: () => api.get<SystemInfo>("/api/system"), refetchInterval: 15_000 });

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

/** True when the signed-in person may change storage, downloads and settings. */
export function useIsAdmin(): boolean {
  const { data } = useSession();
  return !data?.authRequired || data.user?.role === "admin";
}
