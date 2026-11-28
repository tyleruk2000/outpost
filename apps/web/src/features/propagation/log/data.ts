/** What the contact log asks the server for. */
import type {
  ADIF_READ,
  ComparisonRequest,
  ComparisonResult,
  JobDto,
  Observation,
  ObservationImportResponse,
  ObservationInput,
  ObservationList,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { appLocale } from "@/lib/region";

export const logKeys = { all: ["propagation", "log"] as const, page: (limit: number) => ["propagation", "log", limit] as const };

export const useLog = (limit: number) =>
  useQuery({
    queryKey: logKeys.page(limit),
    queryFn: () => api.get<ObservationList & { adif: typeof ADIF_READ }>("/api/radio/observations", { limit }),
    placeholderData: (previous) => previous,
  });

function useChange<T, R>(run: (input: T) => Promise<R>, quiet = false) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: () => void client.invalidateQueries({ queryKey: logKeys.all }),
    onError: quiet ? undefined : (error) => notify.error(errorMessage(error)),
  });
}

export const useAddObservation = () =>
  useChange((input: ObservationInput) => api.post<{ observation: Observation }>("/api/radio/observations", input), true);
export const useUpdateObservation = () =>
  useChange(
    ({ id, input }: { id: string; input: ObservationInput }) =>
      api.put<{ observation: Observation }>(`/api/radio/observations/${id}`, input),
    true,
  );
export const useRemoveObservation = () => useChange((id: string) => api.delete(`/api/radio/observations/${id}`));
export const useRemoveImport = () => useChange((id: string) => api.delete<{ removed: number }>(`/api/radio/observations/imports/${id}`));
/** A small file is answered with the import; a large one with the job bringing it in. */
export const useImportAdif = () =>
  useChange((file: File) => {
    const form = new FormData();
    form.append("file", file, file.name);
    return api.upload<ObservationImportResponse>("/api/radio/observations/import", form);
  }, true);

/**
 * The job bringing a large file in. The live-events stream refreshes it as the job moves (its key is under
 * "jobs"); the slow poll is only for when that stream is down.
 */
export const useImportJob = (id: string | null) =>
  useQuery({
    queryKey: ["jobs", "propagation-adif-import", id ?? ""],
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${id}`).then((data) => data.job),
    enabled: id !== null,
    refetchInterval: (query) => (["succeeded", "failed", "cancelled"].includes(query.state.data?.state ?? "") ? false : 5_000),
  });

export const stopImport = (id: string) => api.post(`/api/jobs/${id}/cancel`);
export const useCompareLog = () =>
  useMutation({
    mutationFn: (request: ComparisonRequest) =>
      api.post<{ comparison: ComparisonResult }>("/api/radio/observations/compare", request).then((data) => data.comparison),
  });

const STORE = "outpost.propagation.log.ssn.v1";

/** Sunspot numbers a person gave for months the solar table does not reach, kept in this browser. */
export function rememberedSsn(): Record<string, string> {
  try {
    const stored = JSON.parse(localStorage.getItem(STORE) ?? "{}") as unknown;
    return stored && typeof stored === "object" ? (stored as Record<string, string>) : {};
  } catch {
    return {};
  }
}
export function rememberSsn(values: Record<string, string>): void {
  try {
    localStorage.setItem(STORE, JSON.stringify(values));
  } catch {
    // Nothing depends on it.
  }
}

const stamp = new Intl.DateTimeFormat(appLocale(), {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
});
/** "16 Nov 2026, 12:04 UTC". A log is kept in UTC, always on the 24-hour clock. */
export const utcStamp = (at: number): string => `${stamp.format(at)} UTC`;

const monthName = new Intl.DateTimeFormat(appLocale(), { month: "long", year: "numeric", timeZone: "UTC" });
export const monthWords = (month: string): string => monthName.format(new Date(`${month}-15T00:00:00Z`));
