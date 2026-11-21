/** Server calls for bringing in a Calibre library. Query keys start with "calibre" so live events refresh them. */
import type {
  BookDetailsResponse,
  CalibreImportDto,
  CalibreImportListResponse,
  CalibreImportResponse,
  CalibreOptions,
  JobDto,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useServerConnection, useServerEvent } from "@/lib/events";
import { usePageVisible } from "@/lib/page-visible";

export const calibreKeys = {
  list: ["calibre", "list"] as const,
  detail: (id: string) => ["calibre", "detail", id] as const,
};

const BUSY = new Set(["reading", "importing"]);
export const isBusy = (dto: Pick<CalibreImportDto, "state"> | undefined): boolean => dto !== undefined && BUSY.has(dto.state);

export const useCalibreImports = () =>
  useQuery({
    queryKey: calibreKeys.list,
    queryFn: () => api.get<CalibreImportListResponse>("/api/calibre"),
    select: (data) => data.imports.filter((entry) => entry.state !== "discarded"),
  });

/** One import, kept current: state from `calibre.changed`, progress from the job's own events. */
export function useCalibreImport(id: string | undefined) {
  const client = useQueryClient();
  const shown = usePageVisible();
  const connected = useServerConnection();
  const query = useQuery({
    queryKey: calibreKeys.detail(id ?? ""),
    queryFn: () => api.get<CalibreImportResponse>(`/api/calibre/${id}`).then((data) => data.import),
    enabled: Boolean(id),
    refetchInterval: (current) => (shown && !connected && isBusy(current.state.data) ? 3000 : false),
  });
  useServerEvent("job.updated", ({ data }) => {
    const job = data as JobDto | undefined;
    if (!id || job?.subject !== `calibre:${id}`) return;
    client.setQueryData<CalibreImportDto>(calibreKeys.detail(id), (current) =>
      current && isBusy(current) ? { ...current, job: { id: job.id, state: job.state, progress: job.progress } } : current,
    );
  });
  return query;
}

export function useStartCalibre() {
  return useMutation({
    mutationFn: (body: { locationId: string; relPath: string }) =>
      api.post<CalibreImportResponse>("/api/calibre", body).then((data) => data.import),
  });
}

export function useCalibreActions(id: string) {
  const client = useQueryClient();
  const settle = (data: CalibreImportResponse) => {
    client.setQueryData(calibreKeys.detail(id), data.import);
    void client.invalidateQueries({ queryKey: calibreKeys.list });
  };
  return {
    commit: useMutation({
      mutationFn: (body: CalibreOptions) => api.post<CalibreImportResponse>(`/api/calibre/${id}/commit`, body),
      onSuccess: settle,
    }),
    stop: useMutation({ mutationFn: () => api.post<CalibreImportResponse>(`/api/calibre/${id}/cancel`), onSuccess: settle }),
    discard: useMutation({ mutationFn: () => api.delete<CalibreImportResponse>(`/api/calibre/${id}`), onSuccess: settle }),
  };
}

/** Authors, series and cover of a document brought in from Calibre; null for any other document. */
export const useBookDetails = (documentId: string) =>
  useQuery({
    queryKey: ["documents", documentId, "book"],
    queryFn: () => api.get<BookDetailsResponse>(`/api/documents/${documentId}/book`).then((data) => data.details),
  });
