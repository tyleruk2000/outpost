/**
 * The plan's forecast for the tasks under way beside the downloads: when each should finish, from its own
 * progress and the rate the server smooths for it, or why there is no time for it yet. Downloads are in the
 * plan above; a task is not timed from the queue's arithmetic, because it shares nothing with it.
 */
import { formatDuration, type JobDto, taskKind } from "@outpost/shared";
import { Link } from "react-router";
import { clockAt } from "./charts/time-axis";
import { liveRate } from "./task-row";
import { progressText, secondsLeft } from "./task-text";

/** When a task should finish, in words, or why that cannot be said. */
export function taskForecast(job: JobDto, now: number): string {
  if (job.state === "paused") return "Paused";
  if (job.state === "queued") return job.error ? "Trying again soon" : "Waiting for its turn";
  if (!job.progress.total || job.progress.total <= 0) return "No time: it does not say how much there is to do";
  const rate = liveRate(job);
  if (rate === null) return "No time yet: it has only just started";
  if (rate <= 0) return "No time: it is not moving at the moment";
  const left = secondsLeft(job, rate);
  if (left === null) return "No time yet: it has only just started";
  if (left < 45) return "Finishes in less than a minute";
  return `Finishes about ${clockAt(now + left * 1000, now)}, in about ${formatDuration(left)}`;
}

export function PlanTasks({ tasks, now }: { tasks: JobDto[]; now: number }) {
  const shown = tasks.filter((job) => job.state === "running" || job.state === "queued" || job.state === "paused");
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="plan-tasks-title" className="mt-8">
      <h3 id="plan-tasks-title" className="text-body font-semibold text-ink">
        Tasks alongside
      </h3>
      <p className="mt-1 mb-3 max-w-[70ch] text-small text-ink-muted">
        Work Outpost is doing on the server while it downloads. Each is timed from its own progress, assuming its present rate holds.
      </p>
      <ul className="divide-y divide-border border-y border-border">
        {shown.map((job) => {
          const name = taskKind(job.type).name;
          const done = progressText(job);
          return (
            <li key={job.id} aria-label={name} className="grid gap-x-4 gap-y-0.5 py-2.5 text-small md:grid-cols-[15rem_minmax(0,1fr)]">
              <Link
                to={`/downloads/tasks/${job.id}`}
                className="font-medium text-ink underline decoration-border-strong underline-offset-2 hover:decoration-2"
              >
                {name}
              </Link>
              <span className="flex flex-wrap gap-x-4 gap-y-0.5">
                <span className="text-ink">{taskForecast(job, now)}</span>
                {done ? <span className="tabular text-ink-muted">{done}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
