import type { NuclearScenario, NuclearScenarioInput, NuclearSet, NuclearSetInput } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const nuclearKeys = { scenarios: ["nuclear", "scenarios"] as const, sets: ["nuclear", "sets"] as const };

export const useScenarios = () =>
  useQuery({
    queryKey: nuclearKeys.scenarios,
    queryFn: () => api.get<{ scenarios: NuclearScenario[] }>("/api/nuclear/scenarios"),
    select: (data) => data.scenarios,
  });

export function useSaveScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: NuclearScenarioInput }) =>
      id ? api.patch<NuclearScenario>(`/api/nuclear/scenarios/${id}`, input) : api.post<NuclearScenario>("/api/nuclear/scenarios", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["nuclear"] }),
  });
}

export function useDeleteScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/nuclear/scenarios/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["nuclear"] }),
  });
}

export const useSets = () =>
  useQuery({
    queryKey: nuclearKeys.sets,
    queryFn: () => api.get<{ sets: NuclearSet[] }>("/api/nuclear/sets"),
    select: (data) => data.sets,
  });

export function useSaveSet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: NuclearSetInput }) =>
      id ? api.patch<NuclearSet>(`/api/nuclear/sets/${id}`, input) : api.post<NuclearSet>("/api/nuclear/sets", input),
    onSuccess: () => client.invalidateQueries({ queryKey: ["nuclear"] }),
  });
}

export function useDeleteSet() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/nuclear/sets/${id}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["nuclear"] }),
  });
}
