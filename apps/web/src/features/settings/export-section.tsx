import {
  type ExportDestination,
  type ExportEstimate,
  type ExportResult,
  type ExportStatus,
  formatBytes,
  type JobDto,
} from "@outpost/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert, Download, PackageOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import { ErrorState, Notice, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Select, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { useServerEvent } from "@/lib/events";
import { notify } from "@/lib/notify";
import { useStorage } from "@/lib/queries";
import { formatDateTime, formatNumber } from "@/lib/utils";
import { SettingRow, SettingsSection } from "./parts";

const DOWNLOAD = "download";
const EXPORT_JOB = "export-all.run";
export const exportKeys = { estimate: ["export-all", "estimate"], status: ["export-all", "status"] } as const;

/**
 * "Take everything out": one zip of the household's own things in open formats, for
 * reading anywhere else or leaving Outpost. Says how large it will be before it is made.
 */
export function ExportSection() {
  const client = useQueryClient();
  const storage = useStorage();
  const estimate = useQuery({
    queryKey: exportKeys.estimate,
    queryFn: () => api.get<ExportEstimate>("/api/export-all/estimate", undefined, undefined, { timeoutMs: 120_000 }),
  });
  const status = useQuery({ queryKey: exportKeys.status, queryFn: () => api.get<ExportStatus>("/api/export-all") });
  const [where, setWhere] = useState<string>(DOWNLOAD);

  // Each step of an export under way: the progress shown is the job's own.
  useServerEvent("job.updated", ({ data }) => {
    const job = data as JobDto | undefined;
    if (job?.type !== EXPORT_JOB) return;
    client.setQueryData<ExportStatus>(exportKeys.status, { latest: job });
    if (job.state === "succeeded" || job.state === "failed" || job.state === "cancelled")
      void client.invalidateQueries({ queryKey: exportKeys.status });
  });

  const start = useMutation({
    mutationFn: (destination: ExportDestination) => api.post<{ job: JobDto }>("/api/export-all", { destination }),
    onSuccess: ({ job }) => client.setQueryData<ExportStatus>(exportKeys.status, { latest: job }),
    onError: (error) => notify.error(errorMessage(error)),
  });
  const removeFile = useMutation({
    mutationFn: (id: string) => api.delete(`/api/export-all/${id}/download`),
    onSuccess: () => client.invalidateQueries({ queryKey: exportKeys.status }),
    onError: (error) => notify.error(errorMessage(error)),
  });

  const locations = (storage.data?.locations ?? []).filter((location) => location.status === "available");
  const latest = status.data?.latest ?? null;
  const running = latest !== null && ["queued", "running", "paused"].includes(latest.state);
  const data = estimate.data;
  const nothing = data?.sections.every((section) => section.count === 0) ?? false;
  const leftOut = data?.sections.flatMap((section) => section.leftOut) ?? [];

  return (
    <SettingsSection
      id="export"
      title="Take everything out"
      description="Your own things in one zip, in formats other programs open: notes as Markdown, contacts as vCard, places as GPX and GeoJSON, lists as CSV, plans as JSON, and documents as the files you added. A backup is for putting Outpost back; this is for reading them anywhere else."
    >
      {estimate.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-5 w-64" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : estimate.isError || !data ? (
        <ErrorState error={estimate.error} onRetry={() => estimate.refetch()} />
      ) : nothing ? (
        <p className="text-small text-ink-muted">
          There is nothing of yours to take out yet. Notes, contacts, places, supplies and documents you add will be in it.
        </p>
      ) : (
        <>
          <div>
            <p className="text-small text-ink">
              About <span className="tabular font-medium">{formatBytes(data.totalBytes)}</span> before it is compressed.
            </p>
            <Rows className="mt-3">
              {data.sections
                .filter((section) => section.count > 0)
                .map((section) => (
                  <li key={section.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                    <span className="text-small text-ink">
                      {section.label}{" "}
                      <span className="text-ink-muted">as {section.format.charAt(0).toLowerCase() + section.format.slice(1)}</span>
                    </span>
                    <span className="tabular text-small text-ink-muted">
                      {formatNumber(section.count)} · {formatBytes(section.bytes)}
                    </span>
                  </li>
                ))}
            </Rows>
          </div>
          {leftOut.length > 0 ? (
            <Notice tone="warning" icon={<CircleAlert aria-hidden />} title="Some things cannot be included now">
              {leftOut.join(" ")}
            </Notice>
          ) : null}

          <SettingRow
            htmlFor="export-where"
            label="Where to put it"
            hint={
              where === DOWNLOAD
                ? "Made on the server, then saved to this device when you press Download. Only the newest export is kept there for downloading."
                : "Written to a folder named outpost-exports on that location. Anyone who can open that folder can read what is in it."
            }
            control={
              <Select
                id="export-where"
                value={where}
                onChange={setWhere}
                className="w-64 max-w-full"
                options={[
                  { value: DOWNLOAD, label: "Download to this device" },
                  ...locations.map((location) => ({ value: location.id, label: location.name })),
                ]}
              />
            }
          />
          <div>
            <Button
              variant="primary"
              disabled={running}
              loading={start.isPending}
              onClick={() => start.mutate(where === DOWNLOAD ? { kind: "download" } : { kind: "location", locationId: where })}
            >
              <PackageOpen /> Export everything
            </Button>
          </div>
        </>
      )}

      {status.isError ? (
        <ErrorState error={status.error} onRetry={() => status.refetch()} />
      ) : latest ? (
        <LatestExport job={latest} onRemove={() => removeFile.mutate(latest.id)} removing={removeFile.isPending} />
      ) : null}
    </SettingsSection>
  );
}

function LatestExport({ job, onRemove, removing }: { job: JobDto; onRemove: () => void; removing: boolean }) {
  if (job.state === "queued" || job.state === "running" || job.state === "paused") {
    const { current, total, message } = job.progress;
    return (
      <div aria-live="polite">
        <Progress tone="lamp" label="Export" value={total ? current / total : null} />
        <p className="mt-1.5 text-small text-ink-muted">{job.state === "paused" ? "Paused" : (message ?? "Waiting for its turn")}</p>
      </div>
    );
  }
  if (job.state === "failed") {
    return (
      <Notice tone="danger" icon={<CircleAlert aria-hidden />} title="The last export failed">
        {job.error ?? "It stopped before it was finished."}
      </Notice>
    );
  }
  if (job.state !== "succeeded" || !job.result) return null;
  const result = job.result as unknown as ExportResult;
  const made = formatDateTime(job.finishedAt ?? job.updatedAt);
  return (
    <div aria-live="polite">
      <h3 className="text-small font-medium text-ink">Last export</h3>
      <p className="mt-1 text-small text-ink-muted">
        <span className="tabular">{made}</span>, <span className="tabular">{formatBytes(result.sizeBytes)}</span>.{" "}
        {result.destination === "location" ? (
          <>
            Written to{" "}
            <span className="font-mono text-[0.8125rem] text-ink [overflow-wrap:anywhere]">{`${result.folder}/${result.name}`}</span> on{" "}
            {result.locationName}.
          </>
        ) : result.downloadable ? null : (
          "Its file is no longer kept on the server."
        )}
      </p>
      {result.leftOut.length > 0 ? <p className="mt-1 text-small text-ink-muted">Left out: {result.leftOut.join(" ")}</p> : null}
      {result.destination === "download" && result.downloadable ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button asChild variant="secondary">
            <a href={`/api/export-all/${job.id}/download`} download={result.name}>
              <Download /> Download
            </a>
          </Button>
          <Button variant="ghost" loading={removing} onClick={onRemove}>
            <Trash2 /> Remove from the server
          </Button>
        </div>
      ) : null}
    </div>
  );
}
