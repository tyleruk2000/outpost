/**
 * Garden: the requests its screen makes. Every key starts with "garden", so all of them
 * are read again when the server says the garden changed (lib/events.tsx).
 */
import type { GardenResponse, GardenSettings, GardenSowing, GardenSowingInput } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const gardenKeys = { all: ["garden"] as const };

export const useGarden = () => useQuery({ queryKey: gardenKeys.all, queryFn: () => api.get<GardenResponse>("/api/garden") });

export function useSaveLastFrost() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (lastFrost: string | null) =>
      api.put<{ settings: GardenSettings }>("/api/garden/settings", { lastFrost }).then((data) => data.settings),
    onSuccess: () => client.invalidateQueries({ queryKey: gardenKeys.all }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useSaveSowing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: GardenSowingInput }) =>
      id
        ? api.put<{ sowing: GardenSowing }>(`/api/garden/sowings/${id}`, input).then((data) => data.sowing)
        : api.post<{ sowing: GardenSowing }>("/api/garden/sowings", input).then((data) => data.sowing),
    onSuccess: () => client.invalidateQueries({ queryKey: gardenKeys.all }),
  });
}

export function useRemoveSowing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/garden/sowings/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: gardenKeys.all }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}
