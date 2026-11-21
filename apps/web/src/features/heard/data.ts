/**
 * Heard on the radio: the server's answers, and what changes them. Every key starts with
 * "heard", which `heard.changed` refreshes; nothing here polls. A list is asked for only
 * while a screen that shows it is open.
 */
import type {
  HeardClearInput,
  HeardClearResponse,
  HeardPinInput,
  HeardReceiverInput,
  HeardReceiversResponse,
  HeardReportsResponse,
  HeardSourceId,
  HeardStation,
  HeardStationResponse,
  HeardStationsResponse,
  PiDecoderInput,
  RangeTestInput,
  RangeTestsResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";

export const heardKeys = {
  all: ["heard"] as const,
  receivers: ["heard", "receivers"] as const,
  stations: (source?: HeardSourceId) => ["heard", "stations", source ?? "all"] as const,
  station: (id: string | null) => ["heard", "station", id] as const,
  reports: (query: ReportsQuery) => ["heard", "reports", query] as const,
  rangeTests: ["heard", "range-tests"] as const,
};

export interface ReportsQuery {
  receiverId?: string;
  stationId?: string;
  from?: number;
  to?: number;
}

export const useReceivers = (enabled = true) =>
  useQuery({
    queryKey: heardKeys.receivers,
    queryFn: () => api.get<HeardReceiversResponse>("/api/heard/receivers"),
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

export const useStations = (source: HeardSourceId | undefined, enabled = true) =>
  useQuery({
    queryKey: heardKeys.stations(source),
    queryFn: () => api.get<HeardStationsResponse>(`/api/heard/stations${source ? `?source=${source}` : ""}`),
    select: (data) => data.stations,
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

export const useStation = (id: string | null) =>
  useQuery({
    queryKey: heardKeys.station(id),
    queryFn: () => api.get<HeardStationResponse>(`/api/heard/stations/${encodeURIComponent(id ?? "")}`),
    staleTime: Number.POSITIVE_INFINITY,
    enabled: id !== null,
  });

export const useReports = (query: ReportsQuery, enabled = true) =>
  useQuery({
    queryKey: heardKeys.reports(query),
    queryFn: () => {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) if (value !== undefined && value !== "") params.set(key, String(value));
      return api.get<HeardReportsResponse>(`/api/heard/reports?${params}`);
    },
    staleTime: Number.POSITIVE_INFINITY,
    enabled,
  });

export const useRangeTests = (enabled = true) =>
  useQuery({
    queryKey: heardKeys.rangeTests,
    queryFn: () => api.get<RangeTestsResponse>("/api/heard/range-tests"),
    select: (data) => data.tests,
    enabled,
  });

function useHeardMutation<I, O>(run: (input: I) => Promise<O>, after?: (output: O) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (output) => {
      after?.(output);
      void client.invalidateQueries({ queryKey: heardKeys.all });
    },
    onError: (error) => notify.error(errorMessage(error)),
  });
}

export function useSaveReceiver() {
  const client = useQueryClient();
  return useHeardMutation(
    ({ id, input }: { id?: string; input: HeardReceiverInput }) =>
      id
        ? api.put<HeardReceiversResponse>(`/api/heard/receivers/${encodeURIComponent(id)}`, input)
        : api.post<HeardReceiversResponse>("/api/heard/receivers", input),
    (data) => client.setQueryData(heardKeys.receivers, data),
  );
}

export function useRemoveReceiver() {
  const client = useQueryClient();
  return useHeardMutation(
    (id: string) => api.delete<HeardReceiversResponse>(`/api/heard/receivers/${encodeURIComponent(id)}`),
    (data) => client.setQueryData(heardKeys.receivers, data),
  );
}

export const usePin = () =>
  useHeardMutation(({ id, ...input }: HeardPinInput & { id: string }) =>
    api.put<{ station: HeardStation }>(`/api/heard/stations/${encodeURIComponent(id)}/pin`, input),
  );

export const useRemoveStation = () =>
  useHeardMutation((id: string) => api.delete<HeardClearResponse>(`/api/heard/stations/${encodeURIComponent(id)}`));

export const useClear = () => useHeardMutation((input: HeardClearInput) => api.post<HeardClearResponse>("/api/heard/clear", input));

export const useSaveRangeTest = () =>
  useHeardMutation((input: RangeTestInput) => api.post<RangeTestsResponse>("/api/heard/range-tests", input));

export const useRemoveRangeTest = () =>
  useHeardMutation((id: string) => api.delete<RangeTestsResponse>(`/api/heard/range-tests/${encodeURIComponent(id)}`));

export function usePiDecoder() {
  const client = useQueryClient();
  return useHeardMutation(
    (input: PiDecoderInput) => api.post<HeardReceiversResponse>("/api/heard/pi", input),
    (data) => client.setQueryData(heardKeys.receivers, data),
  );
}
