import { formatBytes, type JobDto } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";

/** Jobs whose progress counts bytes; the rest count items, which only mean something as a share. */
const countsBytes = new Set(["collection.verify", "portable.build"]);
/** Reading one document is short and stopping it leaves that document without its text. */
const notCancellable = new Set(["document.extract"]);

/** "412 MB of 1.90 GB" or "42%", only when the job knows its total. */
export function jobProgressText(job: Pick<JobDto, "type" | "progress">): string | null {
  const { current, total } = job.progress;
  if (!total || total <= 0) return null;
  if (countsBytes.has(job.type)) return `${formatBytes(Math.min(current, total))} of ${formatBytes(total)}`;
  return `${Math.round(Math.min(1, current / total) * 100)}%`;
}

export function jobStateText(job: Pick<JobDto, "state" | "progress">): string {
  if (job.state === "queued") return job.progress.message ?? "Waiting for its turn";
  if (job.state === "paused") return "Paused";
  return job.progress.message ?? "Working";
}

/** One piece of background work that is not a download: its name, what it is doing now, and how far along. */
export function JobRow({ job, canCancel }: { job: JobDto; canCancel: boolean }) {
  const client = useQueryClient();
  const cancel = useMutation({
    mutationFn: () => api.post(`/api/jobs/${job.id}/cancel`),
    onSuccess: () => client.invalidateQueries({ queryKey: ["jobs"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const running = job.state === "running";
  const figures = jobProgressText(job);
  const fraction = job.progress.total ? Math.min(1, job.progress.current / job.progress.total) : undefined;

  return (
    <li className="py-3.5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="text-body font-medium text-ink">{job.title}</h3>
          <p className="mt-0.5 flex flex-wrap gap-x-4 text-small text-ink-muted">
            <span>{jobStateText(job)}</span>
            {figures ? <span className="tabular">{figures}</span> : null}
          </p>
        </div>
        {canCancel && !notCancellable.has(job.type) ? (
          <Button variant="ghost" size="sm" loading={cancel.isPending} onClick={() => cancel.mutate()} aria-label={`Cancel: ${job.title}`}>
            {cancel.isPending ? null : <X />} Cancel
          </Button>
        ) : null}
      </div>
      {running ? <Progress value={fraction} tone="lamp" label={job.title} className="mt-2.5" /> : null}
    </li>
  );
}
