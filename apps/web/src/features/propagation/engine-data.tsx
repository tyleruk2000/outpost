/**
 * VOACAP's coefficients, which Outpost does not ship: one calm line where a prediction
 * would be asked for, saying what is missing, how big it is and why it is not shipped,
 * with a Download button. Once they are here the screens are as they always were; the
 * server says so with "propagation.changed", which refreshes the engine's status.
 *
 * Used by the planner, coverage maps, radio plans and the log's comparison, and by the
 * Engine and data tab, which can also remove them.
 */
import type { EngineDataStatus, EngineStatus } from "@outpost/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { cn } from "@/lib/utils";
import { keys } from "./data";

const kB = (bytes: number) => `${Math.round(bytes / 1000)} kB`;

export function useDownloadEngineData() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<{ download: unknown | null; status: EngineDataStatus }>("/api/radio/propagation/engine-data/download", {}),
    onSuccess: (answer) => {
      toast.success(answer.download ? "Fetching VOACAP's data. Progress is under Downloads." : "VOACAP's data is back in place.");
      void client.invalidateQueries({ queryKey: ["propagation"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
}

/** What is missing, why it is not shipped, and the button that fetches it. */
export function EngineDataLine({ data, className }: { data: EngineDataStatus; className?: string }) {
  const download = useDownloadEngineData();
  return (
    <div className={cn("max-w-[75ch] rounded-panel border border-border px-4 py-3", className)} data-testid="engine-data-line">
      <p className="text-body text-ink">{data.line}</p>
      <p className="mt-1 text-small text-ink-muted">{data.why}</p>
      {data.downloading ? (
        <p className="mt-2 text-small text-ink-muted" aria-live="polite">
          Downloading. Progress is under Downloads; the planner is ready as soon as it finishes.
        </p>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <Button variant="primary" loading={download.isPending} onClick={() => download.mutate()}>
            Download ({kB(data.bytes)})
          </Button>
          <p className="text-small text-ink-muted">
            {data.files} files, {data.bytes.toLocaleString("en-GB")} bytes, fetched once, when you press this. Nothing else is fetched, and
            everything works offline afterwards.
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * The line to show when the engine cannot run: the Download line when it is only the data
 * that is missing, and otherwise what is wrong, as a warning.
 */
export function EngineNotReady({
  engine,
  title,
  children,
  className,
}: {
  engine: EngineStatus | undefined;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  if (!engine || engine.ready) return null;
  if (engine.data && !engine.data.installed) return <EngineDataLine data={engine.data} className={className} />;
  return (
    <Notice tone="danger" title={title} className={className}>
      {engine.problem} {children}
    </Notice>
  );
}

/** Removing them, from the Engine and data tab. */
export function RemoveEngineData({ data }: { data: EngineDataStatus }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const remove = useMutation({
    mutationFn: () => api.delete<EngineDataStatus>("/api/radio/propagation/engine-data"),
    onSuccess: () => {
      setOpen(false);
      toast.success("VOACAP's data was removed.");
      void client.invalidateQueries({ queryKey: keys.engines });
      void client.invalidateQueries({ queryKey: ["propagation"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Remove
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Remove VOACAP's data?"
        description={`${data.removalWarning} Downloading them again is ${kB(data.bytes)}.`}
        confirmLabel="Remove the data"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
