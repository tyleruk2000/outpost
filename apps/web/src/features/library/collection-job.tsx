/** Following the background job that checks or moves one collection, and showing where it stands. */
import { formatBytes, type JobDto } from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useActiveJobs } from "@/lib/queries";
import { isFinished, jobOutcome, MOVE_JOB } from "./collection-meta";

export interface CollectionActivity {
  /** The check or move being followed: under way, or finished and not yet dismissed. */
  job: JobDto | undefined;
  /** True while a check or move is queued or running. */
  busy: boolean;
  follow: (job: JobDto) => void;
  dismiss: () => void;
  cancel: () => void;
  cancelling: boolean;
}

/**
 * A check or move may have been started here, in another tab, or before a reload. The
 * job is found by its subject, then followed by id so its result can still be shown
 * after it leaves the list of active jobs.
 */
export function useCollectionActivity(collectionId: string): CollectionActivity {
  const client = useQueryClient();
  const active = useActiveJobs();
  const [jobId, setJobId] = useState<string>();
  const [dismissed, setDismissed] = useState<string>();

  const running = active.data?.find((job) => job.subject === `collection:${collectionId}`);
  useEffect(() => {
    if (running && running.id !== jobId) setJobId(running.id);
  }, [running, jobId]);

  const detail = useQuery({
    queryKey: ["jobs", "detail", jobId],
    queryFn: () => api.get<{ job: JobDto }>(`/api/jobs/${jobId}`),
    enabled: Boolean(jobId),
    select: (data) => data.job,
    // Job events refresh this too; the timer covers a dropped event connection.
    refetchInterval: (query) => (query.state.data && isFinished(query.state.data.job) ? false : 1500),
  });

  const job = jobId && jobId !== dismissed ? detail.data : undefined;
  const finished = job ? isFinished(job) : false;
  // The collection's status, location and checksum change when the job ends.
  useEffect(() => {
    if (finished) void client.invalidateQueries({ queryKey: ["collections"] });
  }, [finished, client]);

  const cancel = useMutation({
    mutationFn: () => api.post(`/api/jobs/${jobId}/cancel`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });

  return {
    job,
    busy: Boolean(job && !finished),
    follow: (started) => {
      client.setQueryData(["jobs", "detail", started.id], { job: started });
      setJobId(started.id);
    },
    dismiss: () => setDismissed(jobId),
    cancel: () => cancel.mutate(),
    cancelling: cancel.isPending,
  };
}

const outcomeIcons = { success: <CircleCheck />, info: <Info />, warning: <TriangleAlert />, danger: <CircleAlert /> };

/** Progress of a check or move while it runs, then how it turned out. */
export function CollectionJobStatus({
  activity,
  canCancel,
  dismissible = true,
  className,
}: {
  activity: CollectionActivity;
  canCancel: boolean;
  /** Whether a finished job's outcome can be put away. Off inside a dialog, which has its own way out. */
  dismissible?: boolean;
  className?: string;
}) {
  const { job } = activity;
  if (!job) return null;

  if (isFinished(job)) {
    const outcome = jobOutcome(job);
    return (
      <Notice
        tone={outcome.tone}
        icon={outcomeIcons[outcome.tone]}
        title={outcome.title}
        className={className}
        action={
          dismissible ? (
            <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={activity.dismiss} className="-my-1 -mr-1.5">
              <X />
            </Button>
          ) : undefined
        }
      >
        {outcome.body}
      </Notice>
    );
  }

  const move = job.type === MOVE_JOB;
  const { current, total, message } = job.progress;
  const fraction = total ? Math.min(1, current / total) : undefined;
  const waiting = job.state === "queued";
  const heading = waiting
    ? move
      ? "Waiting to move"
      : "Waiting to check the files"
    : (message ?? (move ? "Moving" : "Checking the files"));
  // A move counts every byte twice (copying, then reading the copy back), so a share says more than a byte count.
  const figures = !total
    ? null
    : move
      ? `${Math.round((fraction ?? 0) * 100)}%`
      : `${formatBytes(Math.min(current, total))} of ${formatBytes(total)}`;

  return (
    <div className={className} role="status">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4">
        <p className="text-small font-medium text-ink">{heading}</p>
        {figures ? <p className="tabular text-small text-ink-muted">{figures}</p> : null}
      </div>
      <Progress value={waiting ? 0 : fraction} tone={waiting ? "muted" : "lamp"} label={job.title} />
      <div className="mt-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <p className="max-w-[56ch] text-small text-ink-muted">
          {move
            ? "The original stays in place and readable until the copy has been checked. Only then is it removed."
            : "The file is read from start to end and compared with its recorded checksum."}
        </p>
        {canCancel ? (
          <Button variant="ghost" size="sm" onClick={activity.cancel} loading={activity.cancelling} className="-mr-2.5">
            {move ? "Cancel move" : "Cancel check"}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
