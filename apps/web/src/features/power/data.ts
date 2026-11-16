/** What the power screens ask the server for. */
import { newPowerPlan, type PowerPlan, type PowerPlanInput, type RadioProfile } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api, errorMessage } from "@/lib/api";

export const powerKeys = {
  all: ["power", "plans"] as const,
  one: (id: string) => ["power", "plans", id] as const,
};

export const usePowerPlans = () =>
  useQuery({
    queryKey: powerKeys.all,
    queryFn: () => api.get<{ plans: PowerPlan[] }>("/api/power/plans"),
    select: (data) => data.plans,
  });

export const usePowerPlan = (id: string) =>
  useQuery({
    queryKey: powerKeys.one(id),
    queryFn: () => api.get<{ plan: PowerPlan }>(`/api/power/plans/${id}`).then((data) => data.plan),
  });

/** A plan without what the server adds to it. */
export function inputOf(plan: PowerPlan): PowerPlanInput {
  const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = plan;
  return input;
}

export function useCreatePowerPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<{ plan: PowerPlan }>("/api/power/plans", newPowerPlan(name)).then((data) => data.plan),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.all, exact: true }),
  });
}

export function useSavePowerPlan(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PowerPlanInput) => api.put<{ plan: PowerPlan }>(`/api/power/plans/${id}`, input).then((data) => data.plan),
    onSuccess: (plan) => {
      client.setQueryData(powerKeys.one(id), plan);
      void client.invalidateQueries({ queryKey: powerKeys.all, exact: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useCopyPowerPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ plan: PowerPlan }>(`/api/power/plans/${id}/copy`).then((data) => data.plan),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.all, exact: true }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useRemovePowerPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/power/plans/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.all, exact: true }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** The radios saved for the HF planner, to start a load from. Under the planner's own key, so its changes refresh it. */
export const useRadioProfiles = () =>
  useQuery({
    queryKey: ["propagation", "profiles"],
    queryFn: () => api.get<{ radios: RadioProfile[] }>("/api/radio/profiles"),
    select: (data) => data.radios,
  });
