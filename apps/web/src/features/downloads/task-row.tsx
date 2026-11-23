import { type JobDto, taskKind } from "@outpost/shared";
import { CircleAlert, Pause, Play, RotateCw, X } from "lucide-react";
import { memo, useState } from "react";
import { Link } from "react-router";
import { Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/misc";
import { cn, timeAgo } from "@/lib/utils";
import {
  fractionDone,
  progressText,
  ratePer,
  rateWords,
  secondsLeft,
  taskNowWords,
  taskStateWords,
  timeLeftWords,
  unitOf,
} from "./task-text";
import { useTaskAction } from "./use-tasks";

/** A task's rate now, from the server's smoothed figure: per minute, or bytes per second. */
export function liveRate(job: Pick<JobDto, "type" | "state" | "progress">): number | null {
  const perSecond = job.progress.ratePerSecond;
  if (job.state !== "running" || perSecond === null || perSecond === undefined) return null;
  return perSecond * ratePer(unitOf(job));
}

/** "1,204 of 5,310 passages", "312 passages a minute", "about 13 minutes left": what is known, in that order. */
export function taskFigures(job: JobDto): string[] {
  const rate = liveRate(job);
  const left = secondsLeft(job, rate);
  return [
    progressText(job),
    rate !== null && rate > 0 ? rateWords(rate, unitOf(job)) : null,
    left !== null ? timeLeftWords(left) : null,
  ].filter((part): part is string => Boolean(part));
}

/** The cancel button asks first: a task stopped part of the way does not pick up again. */
function CancelTask({ job, onCancelled }: { job: JobDto; onCancelled?: () => void }) {
  const [asking, setAsking] = useState(false);
  const action = useTaskAction(job.id);
  const kind = taskKind(job.type);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAsking(true)} aria-label={`Cancel ${job.title}`}>
        <X /> Cancel
      </Button>
      <ConfirmDialog
        open={asking}
        onOpenChange={setAsking}
        title={`Cancel “${job.title}”?`}
        description={
          kind.pause === "resumes"
            ? "It stops now. What it has finished so far is kept; to finish the rest, start it again from where it began. To stop for now and carry on later, pause it instead."
            : "It stops now and does not carry on by itself. To have it done, start it again from where it began."
        }
        confirmLabel="Cancel the task"
        cancelLabel="Keep it going"
        loading={action.isPending}
        onConfirm={() =>
          action.mutate("cancel", {
            onSuccess: () => {
              setAsking(false);
              onCancelled?.();
            },
          })
        }
      />
    </>
  );
}

/** Pause, resume, retry or cancel: whichever the task's state and kind allow. */
export function TaskControls({ job, className }: { job: JobDto; className?: string }) {
  const action = useTaskAction(job.id);
  const busy = action.isPending ? action.variables : undefined;
  const kind = taskKind(job.type);
  const { state } = job;
  const active = state === "queued" || state === "running" || state === "paused";
  const canPause = Boolean(kind.pause) && (state === "running" || state === "queued");
  const canRetry = state === "failed" && kind.retry === true;
  const canCancel = active && kind.cancel !== false;
  if (!canPause && state !== "paused" && !canRetry && !canCancel) return null;

  return (
    <div className={cn("flex shrink-0 flex-wrap items-center gap-1", className)}>
      {canPause ? (
        <Button
          variant="ghost"
          size="sm"
          loading={busy === "pause"}
          onClick={() => action.mutate("pause")}
          aria-label={`Pause ${job.title}`}
        >
          {busy === "pause" ? null : <Pause />} Pause
        </Button>
      ) : null}
      {state === "paused" ? (
        <Button
          variant="ghost"
          size="sm"
          loading={busy === "resume"}
          onClick={() => action.mutate("resume")}
          aria-label={`Resume ${job.title}`}
        >
          {busy === "resume" ? null : <Play />} Resume
        </Button>
      ) : null}
      {canRetry ? (
        <Button
          variant="secondary"
          size="sm"
          loading={busy === "resume"}
          onClick={() => action.mutate("resume")}
          aria-label={`Retry ${job.title}`}
        >
          {busy === "resume" ? null : <RotateCw />} Retry
        </Button>
      ) : null}
      {canCancel ? <CancelTask job={job} /> : null}
    </div>
  );
}

/** One task in the list: its name, what kind of work it is, where it stands, and the way to its page. */
export const TaskRow = memo(function TaskRow({ job }: { job: JobDto }) {
  const kind = taskKind(job.type);
  const state = taskStateWords(job);
  const running = job.state === "running";
  const ended = job.state === "succeeded" || job.state === "failed" || job.state === "cancelled";
  const figures = taskFigures(job);
  const fraction = fractionDone(job);
  const when = ended ? (job.finishedAt ?? job.updatedAt) : null;

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-body font-medium text-ink">{job.title}</h3>
          <p className="mt-0.5 text-small text-ink-muted">
            <Joined
              parts={[
                <span key="kind">{kind.name}</span>,
                <span key="state" className={cn(state.tone === "danger" && "text-danger")}>
                  {state.label}
                </span>,
                when ? <span key="when">{timeAgo(when)}</span> : null,
              ].filter(Boolean)}
            />
          </p>
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1 max-md:-ml-2.5 md:-mr-2.5">
          <TaskControls job={job} />
          <Button asChild variant="ghost" size="sm">
            <Link to={`/downloads/tasks/${job.id}`} aria-label={`Details of ${job.title}`}>
              Details
            </Link>
          </Button>
        </div>
      </div>
      {running || job.state === "queued" || job.state === "paused" ? (
        <div className="mt-2.5">
          {running ? (
            <Progress value={fraction} tone="lamp" label={`Progress of ${job.title}`} className="mb-2" />
          ) : fraction !== undefined && fraction > 0 ? (
            <Progress value={fraction} tone="muted" label={`Progress of ${job.title}`} className="mb-2" />
          ) : null}
          <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-small" aria-live="off">
            <span className="min-w-0 text-ink">{taskNowWords(job)}</span>
            {figures.length > 0 ? (
              <span className="tabular text-ink-muted">
                <Joined parts={figures.map((part) => <span key={part}>{part}</span>)} />
              </span>
            ) : null}
          </p>
        </div>
      ) : job.state === "failed" ? (
        <p className="mt-2 flex max-w-[70ch] items-start gap-2 text-small text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>{job.error ?? "It stopped with an error."}</span>
        </p>
      ) : null}
    </li>
  );
});
