/**
 * The clean-up that is running, or the account of the last one: what was deleted, what
 * was only forgotten, and every file that was left where it is, by name and path.
 */
import { type CleanupResult, type CleanupStatus, formatBytes, type JobDto } from "@outpost/shared";
import { useMutation } from "@tanstack/react-query";
import { Check, CircleAlert, Square, X } from "lucide-react";
import { useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { timeAgo } from "@/lib/utils";
import { resultSentences } from "./manage-text";

/** How long a finished clean-up's account stays on the screen without being asked for. */
const RECENT_MS = 30 * 60 * 1000;

function isResult(value: unknown): value is CleanupResult {
  return typeof value === "object" && value !== null && "removed" in value && "leftBehind" in value;
}

function Running({ job }: { job: JobDto }) {
  const stop = useMutation({
    mutationFn: () => api.post(`/api/jobs/${job.id}/cancel`),
    onError: (error) => notify.error(errorMessage(error)),
  });
  const { current, total, message } = job.progress;
  const fraction = total && total > 0 ? current / total : null;
  return (
    <section aria-label="Clean-up under way" className="mb-6 rounded-panel border border-border bg-surface px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h2 className="text-small font-semibold text-ink">{job.title}</h2>
          <p className="truncate text-small text-ink-muted" aria-live="polite">
            {job.state === "queued" ? "Waiting to start" : (message ?? "Working")}
          </p>
        </div>
        <Button size="sm" onClick={() => stop.mutate()} loading={stop.isPending}>
          {stop.isPending ? null : <Square />} Stop
        </Button>
      </div>
      <Progress value={job.state === "queued" ? 0 : fraction} tone="lamp" label={job.title} className="mt-3" />
      <p className="mt-2 text-small text-ink-muted">
        Stopping leaves what has already been removed as it is, and reports what was and was not reached. You can leave this screen; it
        carries on.
      </p>
    </section>
  );
}

function Finished({ job, onDismiss }: { job: JobDto; onDismiss: () => void }) {
  const result = isResult(job.result) ? job.result : undefined;
  const failed = job.state === "failed";
  const trouble = failed || (result ? result.failed.length + result.failedMore > 0 : false);
  return (
    <Notice
      className="mb-6"
      tone={failed ? "danger" : trouble || job.state === "cancelled" ? "warning" : "success"}
      icon={trouble || job.state === "cancelled" ? <CircleAlert /> : <Check />}
      title={`${job.title}: ${failed ? "failed" : job.state === "cancelled" ? "stopped" : "finished"} ${timeAgo(job.finishedAt)}`}
      action={
        <Button variant="ghost" size="icon-sm" aria-label="Dismiss" onClick={onDismiss}>
          <X />
        </Button>
      }
    >
      {failed ? <p>{job.error ?? "It stopped with an error. Nothing else was removed."}</p> : null}
      {result ? (
        <>
          {resultSentences(result).map((line) => (
            <p key={line}>{line}</p>
          ))}
          {result.leftBehind.length > 0 ? (
            <details className="mt-2">
              <summary className="cursor-pointer font-medium">
                Files that were not deleted, and where they are ({result.leftBehind.length + result.leftBehindMore})
              </summary>
              <ul className="mt-1.5 grid gap-1.5">
                {result.leftBehind.map((file) => (
                  <li key={`${file.path}:${file.title}`}>
                    <span className="font-medium">{file.title}</span>{" "}
                    <span className="tabular text-ink-muted">
                      {formatBytes(file.bytes)}, on “{file.locationName}”
                    </span>
                    <span className="block font-mono text-[0.8125rem] break-all text-ink-muted">{file.path}</span>
                  </li>
                ))}
              </ul>
              {result.leftBehindMore > 0 ? <p className="mt-1.5 text-ink-muted">And {result.leftBehindMore} more.</p> : null}
            </details>
          ) : null}
          {result.failed.length > 0 ? (
            <details className="mt-2" open>
              <summary className="cursor-pointer font-medium">Could not be removed ({result.failed.length + result.failedMore})</summary>
              <ul className="mt-1.5 grid gap-1.5">
                {result.failed.map((entry) => (
                  <li key={`${entry.title}:${entry.reason}`}>
                    <span className="font-medium">{entry.title}</span> <span className="text-ink-muted">{entry.reason}</span>
                  </li>
                ))}
              </ul>
              {result.failedMore > 0 ? <p className="mt-1.5 text-ink-muted">And {result.failedMore} more.</p> : null}
            </details>
          ) : null}
        </>
      ) : !failed ? (
        <p>{job.state === "cancelled" ? "It was stopped before it began. Nothing was removed." : "Done."}</p>
      ) : null}
    </Notice>
  );
}

export function JobAccount({ status }: { status: CleanupStatus }) {
  const [dismissed, setDismissed] = useState<string>();
  if (status.active) return <Running job={status.active} />;
  const last = status.last;
  if (!last || last.id === dismissed || !last.finishedAt || Date.now() - last.finishedAt > RECENT_MS) return null;
  return <Finished job={last} onDismiss={() => setDismissed(last.id)} />;
}
