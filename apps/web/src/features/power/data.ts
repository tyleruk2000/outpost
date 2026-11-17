/** What the power screens ask the server for. */
import { newPowerPlan, type OwnDevice, type OwnDeviceInput, type PowerPlan, type PowerPlanInput, type RadioProfile } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

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

/** A plan as saved: the whole plan, and the version it was changed from (`updatedAt` when opened or last saved). */
type PowerPlanSave = PowerPlanInput & { baseUpdatedAt?: number };

/**
 * Whether a save was refused because the plan or device was saved over somewhere else since it was opened. Such a
 * refusal says which version is kept; a 409 without it (the database busy) is an ordinary failure.
 */
export const isConflict = (error: unknown): error is ApiError =>
  error instanceof ApiError && error.code === "conflict" && typeof error.details?.updatedAt === "number";

export function useSavePowerPlan(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ body, leaving }: { body: PowerPlanSave; leaving: boolean }) =>
      // The save made as the page is hidden or closed asks to finish after the page has gone.
      api.put<{ plan: PowerPlan }>(`/api/power/plans/${id}`, body, { keepalive: leaving }).then((data) => data.plan),
    onSuccess: (plan) => {
      client.setQueryData(powerKeys.one(id), plan);
      void client.invalidateQueries({ queryKey: powerKeys.all, exact: true });
    },
    // A conflict is shown on the plan itself, with the choice of which to keep.
    onError: (error) => {
      if (!isConflict(error)) notify.error(errorMessage(error));
    },
  });
}

export function useCopyPowerPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<{ plan: PowerPlan }>(`/api/power/plans/${id}/copy`).then((data) => data.plan),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.all, exact: true }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useRemovePowerPlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/power/plans/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: powerKeys.all, exact: true }),
    onError: (error) => notify.error(errorMessage(error)),
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
    mutationFn: ({ id, input, baseUpdatedAt }: { id: string | null; input: OwnDeviceInput; baseUpdatedAt?: number }) =>
      (id
        ? api.put<{ device: OwnDevice }>(`/api/power/devices/${id}`, { ...input, baseUpdatedAt })
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
    onError: (error) => notify.error(errorMessage(error)),
  });
}
