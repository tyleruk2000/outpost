/**
 * Readiness: the requests of the check-in, log, checks and drill screens. Keys start with
 * "readiness" (refreshed by `readiness.changed`), except the roll call's, which starts
 * with "board" because check-ins are the board's (refreshed by `board.changed`).
 */
import type {
  DrillRun,
  DrillRunInput,
  EventLogEditInput,
  EventLogInput,
  EventLogLine,
  EventLogResponse,
  EventLogToNotesResponse,
  OfflineDrillResponse,
  RollCallAskInput,
  RollCallAskResponse,
  RollCallResponse,
  RoutineCheck,
  RoutineCheckInput,
  RoutineChecksResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const readinessKeys = {
  all: ["readiness"] as const,
  log: (from: number | null, others: boolean) => ["readiness", "log", from, others] as const,
  checks: ["readiness", "checks"] as const,
  drill: ["readiness", "drill"] as const,
};

export const rollCallKey = (since: number | null) => ["board", "roll-call", since] as const;

export const useRollCall = (since: number | null) =>
  useQuery({
    queryKey: rollCallKey(since),
    queryFn: () => api.get<RollCallResponse>("/api/board/roll-call", since ? { since } : undefined),
  });

export function useAskRollCall() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: RollCallAskInput) => api.post<RollCallAskResponse>("/api/board/roll-calls", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["board"] }),
  });
}

export const useEventLog = (from: number | null, others: boolean) =>
  useQuery({
    queryKey: readinessKeys.log(from, others),
    queryFn: () => api.get<EventLogResponse>("/api/event-log", { ...(from ? { from } : {}), ...(others ? { others: "1" } : {}) }),
  });

function useInvalidate() {
  const client = useQueryClient();
  return () => void client.invalidateQueries({ queryKey: readinessKeys.all });
}

export function useAddLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: EventLogInput) => api.post<{ line: EventLogLine }>("/api/event-log", input).then((data) => data.line),
    onSuccess: invalidate,
  });
}

export function useEditLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, ...input }: EventLogEditInput & { id: string }) =>
      api.patch<{ line: EventLogLine }>(`/api/event-log/${encodeURIComponent(id)}`, input).then((data) => data.line),
    onSettled: invalidate,
  });
}

export function useRemoveLine() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/event-log/${encodeURIComponent(id)}`),
    onSuccess: invalidate,
  });
}

export function useLogToNotes() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { from?: number; others: boolean }) => api.post<EventLogToNotesResponse>("/api/event-log/to-notes", input),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["notes"] }),
  });
}

export const useRoutineChecks = () =>
  useQuery({ queryKey: readinessKeys.checks, queryFn: () => api.get<RoutineChecksResponse>("/api/routine-checks") });

export function useSaveCheck() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: RoutineCheckInput }) =>
      (id
        ? api.put<{ check: RoutineCheck }>(`/api/routine-checks/${encodeURIComponent(id)}`, input)
        : api.post<{ check: RoutineCheck }>("/api/routine-checks", input)
      ).then((data) => data.check),
    onSuccess: invalidate,
  });
}

export function useAddSuggested() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: () => api.post<{ added: RoutineCheck[] }>("/api/routine-checks/suggested").then((data) => data.added),
    onSuccess: invalidate,
  });
}

export function useCheckDone() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, by, at }: { id: string; by: string; at?: number | null }) =>
      api.post<{ check: RoutineCheck }>(`/api/routine-checks/${encodeURIComponent(id)}/done`, { by, ...(at !== undefined ? { at } : {}) }),
    onSuccess: invalidate,
  });
}

export function useRemoveCheck() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/routine-checks/${encodeURIComponent(id)}`),
    onSuccess: invalidate,
  });
}

export const useOfflineDrill = () =>
  useQuery({ queryKey: readinessKeys.drill, queryFn: () => api.get<OfflineDrillResponse>("/api/offline-drill") });

export function useRecordDrill() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: DrillRunInput) => api.post<{ run: DrillRun }>("/api/offline-drill/runs", input).then((data) => data.run),
    onSuccess: invalidate,
  });
}
