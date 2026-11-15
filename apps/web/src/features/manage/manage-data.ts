/** Data hooks of the manage screen. Query keys start with "manage" so live events refresh them. */
import type {
  CleanupPlan,
  CleanupStatus,
  ClearLeftoversResponse,
  DerivedStep,
  JobDto,
  LeftoversResponse,
  ManagedItemsResponse,
  ManageJobResponse,
  ManageMoveResponse,
  UsageResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useServerEvent } from "@/lib/events";

export const MANAGE_PATH = "/storage/manage";
export type ManageView = "space" | "installed" | "leftovers" | "clean-up";
export const manageLink = (view: ManageView = "space") => (view === "space" ? MANAGE_PATH : `${MANAGE_PATH}?view=${view}`);

/** While the server is still counting, ask again now and then in case the event was missed. */
const whileMeasuring = (query: { state: { data?: { measuring: boolean; measuredAt: number | null } } }) =>
  query.state.data && (query.state.data.measuring || query.state.data.measuredAt === null) ? 3000 : false;

export const useUsage = () =>
  useQuery({ queryKey: ["manage", "usage"], queryFn: () => api.get<UsageResponse>("/api/manage/usage"), refetchInterval: whileMeasuring });

export const useItems = () =>
  useQuery({
    queryKey: ["manage", "items"],
    queryFn: () => api.get<ManagedItemsResponse>("/api/manage/items"),
    select: (data) => data.items,
  });

export const useLeftovers = () =>
  useQuery({
    queryKey: ["manage", "leftovers"],
    queryFn: () => api.get<LeftoversResponse>("/api/manage/leftovers"),
    refetchInterval: whileMeasuring,
  });

/** Where things stand: whether erasing is offered here, what derived data there is, and the clean-up job. */
export function useCleanup() {
  const client = useQueryClient();
  // Progress arrives as events; patch the job in place rather than ask again twice a second.
  useServerEvent("job.updated", (payload) => {
    const job = payload.data as JobDto | undefined;
    if (job?.subject !== "manage") return;
    const finished = ["succeeded", "failed", "cancelled"].includes(job.state);
    client.setQueryData<CleanupStatus>(["manage", "cleanup"], (current) =>
      current ? { ...current, active: finished ? null : job, last: finished ? job : current.last } : current,
    );
    if (finished) void client.invalidateQueries({ queryKey: ["manage"] });
  });
  return useQuery({ queryKey: ["manage", "cleanup"], queryFn: () => api.get<CleanupStatus>("/api/manage/cleanup") });
}

export type PlanRequest =
  | { scope: "items"; keys: string[]; files: "delete" | "keep"; disconnected: "forget" | "leave" }
  | { scope: "downloaded"; disconnected: "forget" | "leave" }
  | { scope: "everything" };

/** What a removal would do. Asked for while its confirmation is open, and again when a choice changes. */
export const usePlan = (request: PlanRequest | undefined) =>
  useQuery({
    queryKey: ["manage", "plan", request],
    queryFn: () => api.post<CleanupPlan>("/api/manage/plan", request),
    enabled: request !== undefined,
    staleTime: 0,
    gcTime: 0,
  });

function useStarted() {
  const client = useQueryClient();
  return ({ job }: ManageJobResponse) => {
    client.setQueryData<CleanupStatus>(["manage", "cleanup"], (current) => (current ? { ...current, active: job } : current));
    void client.invalidateQueries({ queryKey: ["jobs"] });
  };
}

export function useRemoveItems() {
  const onSuccess = useStarted();
  return useMutation({
    mutationFn: (body: { keys: string[]; files: "delete" | "keep"; disconnected: "forget" | "leave" }) =>
      api.post<ManageJobResponse>("/api/manage/remove", body),
    onSuccess,
  });
}

export function useMoveItems() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: { keys: string[]; locationId: string }) => api.post<ManageMoveResponse>("/api/manage/move", body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["jobs"] });
      void client.invalidateQueries({ queryKey: ["manage", "items"] });
    },
  });
}

export function useRemoveDownloaded() {
  const onSuccess = useStarted();
  return useMutation({
    mutationFn: (body: { disconnected: "forget" | "leave" }) => api.post<ManageJobResponse>("/api/manage/cleanup/downloaded", body),
    onSuccess,
  });
}

export function useRebuild() {
  const onSuccess = useStarted();
  return useMutation({
    mutationFn: (steps: DerivedStep[]) => api.post<ManageJobResponse>("/api/manage/cleanup/derived", { steps }),
    onSuccess,
  });
}

export function useEraseEverything() {
  const onSuccess = useStarted();
  return useMutation({
    mutationFn: (confirm: string) => api.post<ManageJobResponse>("/api/manage/cleanup/everything", { confirm }),
    onSuccess,
  });
}

export function useClearLeftovers() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.post<ClearLeftoversResponse>("/api/manage/leftovers/clear", { ids }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["manage"] }),
  });
}

export function useMeasure() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<UsageResponse>("/api/manage/measure"),
    onSuccess: (usage) => {
      client.setQueryData(["manage", "usage"], usage);
      void client.invalidateQueries({ queryKey: ["manage", "leftovers"] });
      void client.invalidateQueries({ queryKey: ["storage"] });
    },
  });
}
