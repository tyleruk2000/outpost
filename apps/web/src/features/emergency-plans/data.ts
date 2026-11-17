/** What the emergency plan screens ask the server for. */
import type {
  CommunicationPlan,
  ContactListResponse,
  EmergencyPlan,
  EmergencyPlanConflictDetails,
  EmergencyPlanInput,
  EmergencyPlanResponse,
  EmergencyPlanSummary,
  EmergencyPlanUpdate,
  MarkerDto,
  PowerPlan,
  ShoppingLine,
  SuppliesResponse,
  SupplyOutlookResponse,
} from "@outpost/shared";
import { localDay } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApiError, api, errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";

export const planKeys = {
  all: ["emergency-plans", "list"] as const,
  one: (id: string) => ["emergency-plans", "one", id] as const,
};

export const usePlans = () =>
  useQuery({
    queryKey: planKeys.all,
    queryFn: () => api.get<{ plans: EmergencyPlanSummary[] }>("/api/emergency-plans"),
    select: (data) => data.plans,
  });

export const usePlan = (id: string) =>
  useQuery({
    queryKey: planKeys.one(id),
    queryFn: () => api.get<EmergencyPlanResponse>(`/api/emergency-plans/${id}`),
  });

/** A plan without what the server adds to it. */
export function inputOf(plan: EmergencyPlan): EmergencyPlanInput {
  return {
    name: plan.name,
    kind: plan.kind,
    kindText: plan.kindText,
    templateId: plan.templateId,
    emergencyNumber: plan.emergencyNumber,
    reviewEveryDays: plan.reviewEveryDays,
    body: plan.body,
  };
}

function useAnswer() {
  const client = useQueryClient();
  return (response: EmergencyPlanResponse) => {
    client.setQueryData(planKeys.one(response.plan.id), response);
    void client.invalidateQueries({ queryKey: planKeys.all, exact: true });
  };
}

export function useCreatePlan() {
  const answer = useAnswer();
  return useMutation({
    mutationFn: (input: EmergencyPlanInput) => api.post<EmergencyPlanResponse>("/api/emergency-plans", input),
    onSuccess: answer,
  });
}

/** The newer version a change was refused for (409 `conflict`), or null for any other failure. */
export function conflictOf(error: unknown): EmergencyPlanConflictDetails["current"] | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const current = (error.details as Partial<EmergencyPlanConflictDetails> | undefined)?.current;
  return typeof current?.updatedAt === "number" ? current : null;
}

/**
 * Saves the whole plan. `onSaved` hears of the answer before the cache does, so a
 * screen that keeps its own base never takes its own save for someone else's.
 * A conflict is left to the screen to show; anything else is said in a toast.
 */
export function useSavePlan(id: string, onSaved?: (response: EmergencyPlanResponse) => void) {
  const answer = useAnswer();
  return useMutation({
    mutationFn: (input: EmergencyPlanUpdate) => api.put<EmergencyPlanResponse>(`/api/emergency-plans/${id}`, input),
    onSuccess: (response) => {
      onSaved?.(response);
      answer(response);
    },
    onError: (error) => {
      if (!conflictOf(error)) toast.error(errorMessage(error));
    },
  });
}

/** One of the presses that change a plan's state but not its words: start, reset, reviewed, opened, copy. */
export function usePlanAction(id: string, action: "start" | "reset" | "reviewed" | "opened" | "copy") {
  const answer = useAnswer();
  return useMutation({
    mutationFn: () => api.post<EmergencyPlanResponse>(`/api/emergency-plans/${id}/${action}`),
    onSuccess: answer,
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** Ticks a step, showing the tick at once and putting it back if the server says no. */
export function useTick(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { stepId: string; done: boolean }) => api.post<EmergencyPlanResponse>(`/api/emergency-plans/${id}/ticks`, input),
    onMutate: ({ stepId, done }) => {
      const before = client.getQueryData<EmergencyPlanResponse>(planKeys.one(id));
      if (before) {
        const ticks = { ...before.plan.use.ticks };
        if (done) ticks[stepId] = ticks[stepId] ?? Date.now();
        else delete ticks[stepId];
        client.setQueryData(planKeys.one(id), {
          ...before,
          plan: { ...before.plan, use: { startedAt: before.plan.use.startedAt ?? Date.now(), ticks } },
        });
      }
      return { before };
    },
    onError: (error, _input, context) => {
      if (context?.before) client.setQueryData(planKeys.one(id), context.before);
      toast.error(errorMessage(error));
    },
    onSuccess: (response) => {
      client.setQueryData(planKeys.one(id), response);
      void client.invalidateQueries({ queryKey: planKeys.all, exact: true });
    },
  });
}

export function useRemovePlan() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/emergency-plans/${id}`),
    onSuccess: () => void client.invalidateQueries({ queryKey: planKeys.all, exact: true }),
    onError: (error) => toast.error(errorMessage(error)),
  });
}

// ── What a plan links to, under each owner's own keys so that their changes refresh them ──

export const useContactSearch = (q: string, enabled: boolean) =>
  useQuery({
    queryKey: ["contacts", "list", { q, tag: "", limit: 50 }],
    enabled,
    queryFn: ({ signal }) => api.get<ContactListResponse>("/api/contacts", { q, tag: "", limit: 50 }, signal),
  });

export const useMarkers = (enabled = true) =>
  useQuery({
    queryKey: ["maps", "markers"],
    enabled,
    queryFn: () => api.get<{ markers: MarkerDto[] }>("/api/maps/markers"),
    select: (data) => data.markers,
  });

export const useCommPlans = (enabled = true) =>
  useQuery({
    queryKey: ["propagation", "plans"],
    enabled,
    queryFn: () => api.get<{ plans: CommunicationPlan[] }>("/api/radio/communication-plans"),
    select: (data) => data.plans,
  });

export const usePowerPlans = (enabled = true) =>
  useQuery({
    queryKey: ["power", "plans"],
    enabled,
    queryFn: () => api.get<{ plans: PowerPlan[] }>("/api/power/plans"),
    select: (data) => data.plans,
  });

export const useSupplies = (enabled = true) =>
  useQuery({ queryKey: ["supplies", "stock"], enabled, queryFn: () => api.get<SuppliesResponse>("/api/supplies") });

/** Days of food and water held, for this device's today. */
export const useOutlook = (enabled = true) =>
  useQuery({
    queryKey: ["supplies", "outlook", localDay()],
    enabled,
    queryFn: () => api.get<SupplyOutlookResponse>("/api/supplies/outlook", { today: localDay() }),
  });

/** Puts lines on the supplies shopping list, one request each, and says how many went, also when it stops part way. */
export function useAddToShopping() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (lines: Array<{ name: string; quantity: number | null; unit: string; note: string }>) => {
      const added: ShoppingLine[] = [];
      try {
        for (const line of lines) added.push((await api.post<{ line: ShoppingLine }>("/api/supplies/shopping", line)).line);
      } catch (error) {
        if (added.length === 0) throw error;
        throw new Error(
          `${added.length} of ${plural(lines.length, "line")} went on the shopping list, then it stopped: ${errorMessage(error)}`,
        );
      }
      return added;
    },
    onSettled: () => void client.invalidateQueries({ queryKey: ["supplies"] }),
  });
}
