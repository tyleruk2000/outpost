/** Tasks (background jobs that are not downloads): the finished ones, one task's details, and the actions on one. */
import { DOWNLOAD_JOB_TYPE, type JobDetail, type JobDto, type JobsResponse } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { notify } from "@/lib/notify";
import { usePageVisible } from "@/lib/page-visible";

// Every key starts with "jobs", so a task's change of state, which the live events announce, refreshes them all.
export const finishedTasksKey = ["jobs", "finished"] as const;
export const taskDetailKey = (id: string) => ["jobs", "detail", id] as const;

/** How many finished tasks are listed. */
export const FINISHED_SHOWN = 50;

/** While a task runs and its page is in view, its samples are asked for again this often; its figures move with every event. */
const REFRESH_MS = 5000;

/** The newest tasks that have ended, however they ended. */
export function useFinishedTasks() {
  return useQuery({
    queryKey: finishedTasksKey,
    queryFn: () =>
      api.get<JobsResponse>("/api/jobs", { states: "succeeded,failed,cancelled", notTypes: DOWNLOAD_JOB_TYPE, limit: FINISHED_SHOWN }),
    select: (data) => data.jobs,
  });
}

/**
 * One task with its samples, history and what it waits for. The job itself is patched
 * from each live event, so its bar and figures move between fetches; a change of state
 * fetches the whole again (lib/events.tsx refreshes every key under "jobs").
 */
export function useTaskDetail(id: string) {
  const client = useQueryClient();
  const shown = usePageVisible();
  useServerEvent("job.updated", ({ id: changed, data }) => {
    const job = data as JobDto | undefined;
    if (changed !== id || !job) return;
    client.setQueryData<JobDetail>(taskDetailKey(id), (current) =>
      current && job.updatedAt >= current.job.updatedAt ? { ...current, job } : current,
    );
  });
  return useQuery({
    queryKey: taskDetailKey(id),
    queryFn: () => api.get<JobDetail>(`/api/jobs/${encodeURIComponent(id)}/detail`),
    refetchInterval: (query) => (shown && query.state.data?.job.state === "running" ? REFRESH_MS : false),
  });
}

export type TaskAction = "pause" | "resume" | "cancel";

/** Pause, resume (also retry, for one that failed) or cancel a task. */
export function useTaskAction(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (action: TaskAction) => api.post<{ job: JobDto }>(`/api/jobs/${encodeURIComponent(id)}/${action}`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => notify.error(errorMessage(error)),
  });
}
