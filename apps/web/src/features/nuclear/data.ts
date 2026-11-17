import type {
  NuclearScenario,
  NuclearScenarioConflictDetails,
  NuclearScenarioInput,
  NuclearScenarioUpdate,
  NuclearSet,
  NuclearSetInput,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";

export const nuclearKeys = { scenarios: ["nuclear", "scenarios"] as const, sets: ["nuclear", "sets"] as const };

export const useScenarios = () =>
  useQuery({
    queryKey: nuclearKeys.scenarios,
    queryFn: () => api.get<{ scenarios: NuclearScenario[] }>("/api/nuclear/scenarios"),
    select: (data) => data.scenarios,
  });

/** The newer version a change was refused for (409 `conflict`), or null for any other failure. */
export function scenarioConflictOf(error: unknown): NuclearScenarioConflictDetails["current"] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const current = (error.details as Partial<NuclearScenarioConflictDetails> | undefined)?.current;
  return typeof current?.updatedAt === "number" ? current : null;
}

/** A new scenario is posted; a saved one is changed with the `baseUpdatedAt` it was opened at. */
export function useSaveScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: NuclearScenarioInput | NuclearScenarioUpdate }) =>
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
