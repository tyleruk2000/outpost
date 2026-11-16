/** What the communication plans screens ask the server for. */
import type { CommunicationPlan, PlanInput, PlanResult, SearchResult } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api, errorMessage } from "@/lib/api";
import { todayUtc } from "../data";

export const planKeys = {
  all: ["propagation", "plans"] as const,
  one: (id: string) => ["propagation", "plans", id] as const,
  matrix: (id: string) => ["propagation", "plans", id, "matrix"] as const,
};

export const usePlans = () =>
  useQuery({
    queryKey: planKeys.all,
    queryFn: () => api.get<{ plans: CommunicationPlan[] }>("/api/radio/communication-plans"),
    select: (data) => data.plans,
  });

export const usePlan = (id: string) =>
  useQuery({
    queryKey: planKeys.one(id),
    queryFn: () => api.get<{ plan: CommunicationPlan }>(`/api/radio/communication-plans/${id}`).then((data) => data.plan),
  });

/** The matrix as last worked out for the plan as it stands; null when there is none. */
export const useKeptMatrix = (id: string, enabled: boolean) =>
  useQuery({
    queryKey: planKeys.matrix(id),
    enabled,
    queryFn: async () => {
      try {
        return (await api.get<{ matrix: PlanResult }>(`/api/radio/communication-plans/${id}/matrix`)).matrix;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

export function useWorkOut(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ matrix: PlanResult }>(`/api/radio/communication-plans/${id}/matrix`).then((data) => data.matrix),
    onSuccess: (matrix) => {
      client.setQueryData(planKeys.matrix(id), matrix);
      void client.invalidateQueries({ queryKey: planKeys.one(id) });
    },
  });
}

/** What a plan is, without what the server adds to it. */
export function inputOf(plan: CommunicationPlan): PlanInput {
  const { id: _id, linked: _linked, workedOut: _workedOut, createdAt: _createdAt, updatedAt: _updatedAt, ...input } = plan;
  return input;
}

/** Saves a change to a plan. The plan on screen is the one the server sent back. */
export function useSavePlan(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PlanInput) =>
      api.patch<{ plan: CommunicationPlan }>(`/api/radio/communication-plans/${id}`, input).then((data) => data.plan),
    onSuccess: (plan) => {
      client.setQueryData(planKeys.one(id), plan);
      // What the plan asks may have changed; the kept matrix is asked for again.
      void client.invalidateQueries({ queryKey: planKeys.matrix(id) });
      void client.invalidateQueries({ queryKey: planKeys.all, exact: true });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

export function useCreatePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api.post<{ plan: CommunicationPlan }>("/api/radio/communication-plans", newPlan(name)).then((data) => data.plan),
    onSuccess: () => void client.invalidateQueries({ queryKey: planKeys.all, exact: true }),
  });
}

export function useRemovePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/radio/communication-plans/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: planKeys.all, exact: true }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** A plan as it starts: today's month, the daylight hours, the three bands most short and regional paths use. */
export const newPlan = (name: string): PlanInput => ({
  name,
  notes: "",
  stations: [],
  date: todayUtc(),
  fromUtc: 8,
  toUtc: 20,
  bands: ["80m", "40m", "20m"],
  mode: "ssb",
  requiredSnrDb: null,
  referenceBandwidthHz: null,
  solar: { source: "table" },
  links: [],
});

/** Notes and documents whose title or text matches, for linking one to a plan. */
export const useLinkSearch = (text: string) =>
  useQuery({
    queryKey: ["search", "plan-link", text],
    enabled: text.trim().length >= 2,
    // By keyword, among notes and documents only, and without waiting for the reference collections.
    queryFn: () =>
      api.get<{ results: SearchResult[] }>("/api/search", {
        q: text.trim(),
        kinds: "note,document",
        mode: "keyword",
        reference: "later",
        limit: 8,
      }),
    select: (data) => data.results.filter((result) => result.kind === "note" || result.kind === "document"),
  });
