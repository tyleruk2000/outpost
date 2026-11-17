/** What the power screens ask the server for. */
import {
  type ApiErrorBody,
  newPowerPlan,
  type OwnDevice,
  type OwnDeviceInput,
  type PowerPlan,
  type PowerPlanInput,
  type RadioProfile,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api, errorMessage } from "@/lib/api";

export const powerKeys = {
  all: ["power", "plans"] as const,
  one: (id: string) => ["power", "plans", id] as const,
  devices: ["power", "devices"] as const,
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
    /** A name for a new, empty plan, or a whole plan (one made from the quick calculator's devices). */
    mutationFn: (plan: string | PowerPlanInput) =>
      api.post<{ plan: PowerPlan }>("/api/power/plans", typeof plan === "string" ? newPowerPlan(plan) : plan).then((data) => data.plan),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.all, exact: true }),
  });
}

/** Browsers refuse a keepalive request with a larger body than this. */
const KEEPALIVE_LIMIT = 60_000;

/**
 * The save made as the page is hidden or closed. `keepalive` lets it finish after the
 * page has gone, which `api.put` cannot ask for. A plan too large for keepalive is sent
 * the ordinary way.
 */
async function saveWhileLeaving(id: string, input: PowerPlanInput): Promise<PowerPlan> {
  const json = JSON.stringify(input);
  let response: Response;
  try {
    response = await fetch(`/api/power/plans/${id}`, {
      method: "PUT",
      headers: { Accept: "application/json", "Content-Type": "application/json", "X-Outpost-Request": "1" },
      body: json,
      credentials: "same-origin",
      keepalive: json.length <= KEEPALIVE_LIMIT,
    });
  } catch {
    throw new ApiError(0, "unreachable", "The Outpost server is not responding. It may be restarting.");
  }
  if (!response.ok) {
    const error = ((await response.json().catch(() => null)) as ApiErrorBody | null)?.error;
    throw new ApiError(response.status, error?.code ?? "http", error?.message ?? `The server answered with an error (${response.status}).`);
  }
  return ((await response.json()) as { plan: PowerPlan }).plan;
}

export function useSavePowerPlan(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ input, leaving }: { input: PowerPlanInput; leaving: boolean }) =>
      leaving ? saveWhileLeaving(id, input) : api.put<{ plan: PowerPlan }>(`/api/power/plans/${id}`, input).then((data) => data.plan),
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

/** A person's own devices, kept on the server. */
export const useOwnDevices = () =>
  useQuery({
    queryKey: powerKeys.devices,
    queryFn: () => api.get<{ devices: OwnDevice[] }>("/api/power/devices"),
    select: (data) => data.devices,
  });

export function useSaveOwnDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: OwnDeviceInput }) =>
      (id
        ? api.put<{ device: OwnDevice }>(`/api/power/devices/${id}`, input)
        : api.post<{ device: OwnDevice }>("/api/power/devices", input)
      ).then((data) => data.device),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.devices }),
  });
}

export function useRemoveOwnDevice() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/power/devices/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.devices }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}
