import type { DownloadDto } from "@outpost/shared";
import { Pause, Play, RotateCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { describeDownload } from "./download-text";
import { useDownloadAction } from "./use-downloads";

/**
 * Where one download stands: a bar fed by real bytes, then the numbers in words. Amber
 * while bytes are arriving or being checked; grey when it is waiting or paused.
 */
export function DownloadProgress({ download, className }: { download: DownloadDto; className?: string }) {
  const view = describeDownload(download);
  return (
    <div className={className}>
      {view.bar ? (
        <Progress
          value={view.alive || view.fraction !== undefined ? view.fraction : 0}
          tone={view.alive ? "lamp" : "muted"}
          label={`Progress of ${download.title}`}
          className="mb-2"
        />
      ) : null}
      <p className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 text-small" aria-live="off">
        <span className={cn("tabular min-w-0", view.tone === "danger" ? "text-danger" : "text-ink")}>{view.status}</span>
        {view.detail ? <span className="tabular text-ink-muted">{view.detail}</span> : null}
      </p>
    </div>
  );
}

/** Pause, resume, cancel or retry: whichever the download's state allows. */
export function DownloadControls({ download, className }: { download: DownloadDto; className?: string }) {
  const action = useDownloadAction(download.id);
  const busy = action.isPending ? action.variables : undefined;
  const { state } = download;
  const active = state === "queued" || state === "running" || state === "verifying" || state === "paused";

  return (
    <div className={cn("flex shrink-0 items-center gap-1", className)}>
      {state === "running" || state === "queued" ? (
        <Button
          variant="ghost"
          size="sm"
          loading={busy === "pause"}
          onClick={() => action.mutate("pause")}
          aria-label={`Pause ${download.title}`}
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
          aria-label={`Resume ${download.title}`}
        >
          {busy === "resume" ? null : <Play />} Resume
        </Button>
      ) : null}
      {state === "failed" || state === "cancelled" ? (
        <Button
          variant={state === "failed" ? "secondary" : "ghost"}
          size="sm"
          loading={busy === "retry"}
          onClick={() => action.mutate("retry")}
          aria-label={`Retry ${download.title}`}
        >
          {busy === "retry" ? null : <RotateCw />} Retry
        </Button>
      ) : null}
      {active ? (
        <Button
          variant="ghost"
          size="sm"
          loading={busy === "cancel"}
          onClick={() => action.mutate("cancel")}
          aria-label={`Cancel ${download.title}`}
        >
          {busy === "cancel" ? null : <X />} Cancel
        </Button>
      ) : null}
    </div>
  );
}
