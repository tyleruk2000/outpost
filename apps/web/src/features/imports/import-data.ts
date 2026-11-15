/** Server calls and cached data for the import screen. Query keys start with "imports" so live events refresh them. */
import {
  IMPORT_EXTENSIONS,
  type ImportDto,
  type ImportListResponse,
  type ImportOptions,
  type ImportResponse,
  type JobDto,
  type NoteLookupResponse,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, uploadWithProgress } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { toCommitBody } from "./preview-model";

export const importKeys = {
  list: ["imports", "list"] as const,
  detail: (id: string) => ["imports", "detail", id] as const,
};

/** States in which a background job is working and progress is worth watching. */
const BUSY = new Set(["uploaded", "analysing", "importing"]);
export const isBusy = (dto: ImportDto | undefined): boolean => dto !== undefined && BUSY.has(dto.state);

export const useRecentImports = () =>
  useQuery({
    queryKey: importKeys.list,
    queryFn: () => api.get<ImportListResponse>("/api/imports"),
    // A discarded import has nothing left to show.
    select: (data) => data.imports.filter((entry) => entry.state !== "discarded"),
  });

/**
 * One import, kept current. State changes arrive as `imports.changed`; progress in
 * between arrives with the job's own events and is written straight into the cache, so
 * the bar moves with the work rather than with a polling interval. The interval is
 * only a safety net for a dropped event stream.
 */
export function useImport(id: string | undefined) {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: importKeys.detail(id ?? ""),
    queryFn: () => api.get<ImportResponse>(`/api/imports/${id}`).then((data) => data.import),
    enabled: Boolean(id),
    refetchInterval: (current) => (isBusy(current.state.data) ? 3000 : false),
  });

  useServerEvent("job.updated", ({ data }) => {
    const job = data as JobDto | undefined;
    if (!id || job?.subject !== `import:${id}`) return;
    client.setQueryData<ImportDto>(importKeys.detail(id), (current) =>
      current && isBusy(current) ? { ...current, job: { id: job.id, state: job.state, progress: job.progress } } : current,
    );
  });

  return query;
}

const accepted = new Set<string>(IMPORT_EXTENSIONS);
export const ACCEPT_ATTRIBUTE = IMPORT_EXTENSIONS.join(",");

/** Splits chosen files into those an import takes and the names of those it does not. */
export function sortFiles(files: readonly File[]): { accepted: File[]; refused: string[] } {
  const result = { accepted: [] as File[], refused: [] as string[] };
  for (const file of files) {
    const dot = file.name.lastIndexOf(".");
    const extension = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
    if (accepted.has(extension)) result.accepted.push(file);
    else result.refused.push(file.name);
  }
  return result;
}

export function uploadImport(files: readonly File[], onProgress: (fraction: number) => void, signal: AbortSignal): Promise<ImportDto> {
  const form = new FormData();
  for (const file of files) form.append("files", file, file.name);
  return uploadWithProgress<ImportResponse>("/api/imports", form, onProgress, signal).then((data) => data.import);
}

/** The three things that can be done to an import. Each answers with the import as it is afterwards. */
export function useImportActions(id: string) {
  const client = useQueryClient();
  const settle = (data: ImportResponse) => {
    client.setQueryData(importKeys.detail(id), data.import);
    void client.invalidateQueries({ queryKey: importKeys.list });
  };
  return {
    commit: useMutation({
      mutationFn: (options: ImportOptions) => api.post<ImportResponse>(`/api/imports/${id}/commit`, toCommitBody(options)),
      onSuccess: settle,
    }),
    stop: useMutation({ mutationFn: () => api.post<ImportResponse>(`/api/imports/${id}/cancel`), onSuccess: settle }),
    discard: useMutation({ mutationFn: () => api.delete<ImportResponse>(`/api/imports/${id}`), onSuccess: settle }),
  };
}

export const lookupPages = (query: string, signal?: AbortSignal) =>
  api.get<NoteLookupResponse>("/api/notes/lookup", { q: query, limit: 8 }, signal).then((data) => data.notes);
