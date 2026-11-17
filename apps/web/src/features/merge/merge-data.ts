/** Server calls and cached data for bringing a drive's changes back. Query keys start with "merge" so live events refresh them. */
import type {
  DriveInspection,
  JobDto,
  MergeCommitBody,
  MergeCompareResponse,
  MergeDto,
  MergeListResponse,
  MergeResponse,
  MergeStartBody,
  MergeUndoBody,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useServerConnection, useServerEvent } from "@/lib/events";
import { usePageVisible } from "@/lib/page-visible";

export const mergeKeys = {
  list: ["merge", "list"] as const,
  detail: (id: string) => ["merge", "detail", id] as const,
  inspect: (path: string) => ["merge", "inspect", path] as const,
  compare: (id: string, key: string) => ["merge", "compare", id, key] as const,
};

const BUSY = new Set(["analysing", "merging"]);
export const isBusy = (merge: Pick<MergeDto, "state"> | undefined): boolean => merge !== undefined && BUSY.has(merge.state);

export const useMerges = () =>
  useQuery({ queryKey: mergeKeys.list, queryFn: () => api.get<MergeListResponse>("/api/merge"), select: (data) => data.merges });

export const useDriveInspection = (path: string | undefined) =>
  useQuery({
    queryKey: mergeKeys.inspect(path ?? ""),
    queryFn: () => api.get<DriveInspection>("/api/merge/inspect", { path }),
    enabled: Boolean(path),
    staleTime: 0,
    retry: false,
  });

/**
 * One merge, kept current. State changes arrive as `merge.changed`; progress in between
 * comes with the job's own events and is written straight into the cache, so the bar
 * moves with the work. Only while the event stream is down is the merge asked for every few
 * seconds, and not while the page is hidden; when the stream comes back every query is
 * refreshed anyway.
 */
export function useMerge(id: string | undefined) {
  const client = useQueryClient();
  const shown = usePageVisible();
  const connected = useServerConnection();
  const query = useQuery({
    queryKey: mergeKeys.detail(id ?? ""),
    queryFn: () => api.get<MergeResponse>(`/api/merge/${id}`).then((data) => data.merge),
    enabled: Boolean(id),
    refetchInterval: (current) => (shown && !connected && isBusy(current.state.data) ? 3000 : false),
  });
  useServerEvent("job.updated", ({ data }) => {
    const job = data as JobDto | undefined;
    if (!id || job?.subject !== `merge:${id}`) return;
    client.setQueryData<MergeDto>(mergeKeys.detail(id), (current) =>
      current && isBusy(current) ? { ...current, job: { id: job.id, state: job.state, progress: job.progress } } : current,
    );
  });
  return query;
}

export const useCompare = (id: string, key: string, enabled: boolean) =>
  useQuery({
    queryKey: mergeKeys.compare(id, key),
    queryFn: () => api.get<MergeCompareResponse>(`/api/merge/${id}/compare`, { key }),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });

export function useStartMerge() {
  return useMutation({ mutationFn: (body: MergeStartBody) => api.post<MergeResponse>("/api/merge", body).then((data) => data.merge) });
}

/** What can be done to a merge. Each answers with the merge as it is afterwards. */
export function useMergeActions(id: string) {
  const client = useQueryClient();
  const settle = (data: MergeResponse) => {
    client.setQueryData(mergeKeys.detail(id), data.merge);
    void client.invalidateQueries({ queryKey: mergeKeys.list });
  };
  return {
    commit: useMutation({
      mutationFn: (body: MergeCommitBody) => api.post<MergeResponse>(`/api/merge/${id}/commit`, body),
      onSuccess: settle,
    }),
    stop: useMutation({ mutationFn: () => api.post<MergeResponse>(`/api/merge/${id}/cancel`), onSuccess: settle }),
    discard: useMutation({ mutationFn: () => api.delete<MergeResponse>(`/api/merge/${id}`), onSuccess: settle }),
    undo: useMutation({ mutationFn: (body: MergeUndoBody) => api.post<MergeResponse>(`/api/merge/${id}/undo`, body), onSuccess: settle }),
  };
}
