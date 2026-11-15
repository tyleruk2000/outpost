import { ACTIVE_DOWNLOAD_STATES, type CollectionsResponse, type DownloadDto, formatBytes } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Fragment, type ReactNode, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useActiveJobs, useIsAdmin } from "@/lib/queries";
import { plural, timeAgo } from "@/lib/utils";
import { DownloadControls, DownloadProgress } from "./download-progress";
import { describeDownload, removalDeletesPartialFile } from "./download-text";
import { JobRow } from "./job-row";
import { useDownloads, useRemoveDownload } from "./use-downloads";

/** How many waiting jobs are listed before the rest are summed up in a line. */
const JOBS_SHOWN = 8;

const Slash = () => (
  <span aria-hidden className="mx-2 text-border-strong">
    /
  </span>
);

function MetaLine({ parts, className }: { parts: ReactNode[]; className?: string }) {
  const present = parts.filter(Boolean);
  return (
    <p className={className ?? "mt-0.5 text-small text-ink-muted"}>
      {present.map((part, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: a fixed, ordered list of facts about one download
        <Fragment key={index}>
          {index > 0 ? <Slash /> : null}
          {part}
        </Fragment>
      ))}
    </p>
  );
}

/** Removes a download. Asks first only when part of a file will be deleted with it. */
function RemoveButton({ download, label }: { download: DownloadDto; label: string }) {
  const [confirming, setConfirming] = useState(false);
  const remove = useRemoveDownload(download.id);
  const deletes = removalDeletesPartialFile(download);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        loading={remove.isPending && !confirming}
        onClick={() => (deletes ? setConfirming(true) : remove.mutate())}
        aria-label={`${label}: ${download.title}`}
      >
        {label}
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Remove the download of “${download.title}”?`}
        description={`The ${formatBytes(download.receivedBytes)} already downloaded to “${download.locationName}” will be deleted. To get this collection later, the download starts from the beginning.`}
        confirmLabel="Remove and delete the partial file"
        onConfirm={() => remove.mutate(undefined, { onSuccess: () => setConfirming(false) })}
        loading={remove.isPending}
      />
    </>
  );
}

function ActiveRow({ download, canManage }: { download: DownloadDto; canManage: boolean }) {
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-title text-lead text-ink">{download.title}</h3>
          <p className="mt-0.5 text-small text-ink-muted">To {download.locationName}</p>
        </div>
        {canManage ? <DownloadControls download={download} className="max-md:-ml-2.5 md:-mr-2.5" /> : null}
      </div>
      <DownloadProgress download={download} className="mt-3" />
    </li>
  );
}

function FailedRow({ download, canManage }: { download: DownloadDto; canManage: boolean }) {
  const view = describeDownload(download);
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-title text-lead text-ink">{download.title}</h3>
          <MetaLine parts={[`To ${download.locationName}`, download.finishedAt ? `Stopped ${timeAgo(download.finishedAt)}` : null]} />
        </div>
        {canManage ? (
          <div className="flex items-center gap-1 md:-mr-2.5">
            <DownloadControls download={download} />
            <RemoveButton download={download} label="Remove" />
          </div>
        ) : null}
      </div>
      <p className="mt-2.5 flex max-w-[70ch] items-start gap-2 text-small text-danger">
        <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
        <span>
          {view.status}
          {view.detail ? <span className="mt-0.5 block text-ink-muted">{view.detail}</span> : null}
        </span>
      </p>
    </li>
  );
}

function HistoryRow({ download, canManage, installed }: { download: DownloadDto; canManage: boolean; installed: boolean }) {
  const view = describeDownload(download);
  const completed = download.state === "completed";
  const when = download.finishedAt ?? download.updatedAt;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3.5">
      <div className="min-w-0">
        <h3 className="font-title text-body text-ink">
          {completed && installed ? (
            <Link
              to={`/library/collections/${download.collectionId}`}
              className="decoration-primary decoration-1 underline-offset-[0.22em] hover:underline"
            >
              {download.title}
            </Link>
          ) : (
            download.title
          )}
        </h3>
        <MetaLine
          parts={[
            <span key="status" className="tabular">
              {view.status}
            </span>,
            completed ? `${installed ? "Installed on" : "Downloaded to"} ${download.locationName}` : download.locationName,
            completed && !installed ? "Since removed from the library" : null,
            timeAgo(when),
          ]}
        />
        {view.detail ? <p className="text-small text-ink-muted">{view.detail}</p> : null}
      </div>
      {canManage ? (
        <div className="flex items-center gap-1 max-md:-ml-2.5 md:-mr-2.5">
          {completed ? null : <DownloadControls download={download} />}
          <RemoveButton download={download} label={completed ? "Remove from history" : "Remove"} />
        </div>
      ) : null}
    </li>
  );
}

const stateOrder: Record<string, number> = { running: 0, verifying: 1, queued: 2, paused: 3 };

export default function DownloadsPage() {
  const downloads = useDownloads();
  const jobs = useActiveJobs();
  const canManage = useIsAdmin();
  // Shared with other screens that list every collection; used here to know which finished downloads are still installed.
  const collections = useQuery({ queryKey: ["collections", "all"], queryFn: () => api.get<CollectionsResponse>("/api/collections") });

  const all = downloads.data ?? [];
  const active = all
    .filter((item) => ACTIVE_DOWNLOAD_STATES.includes(item.state))
    .sort((a, b) => (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || a.createdAt - b.createdAt);
  const failed = all.filter((item) => item.state === "failed");
  const history = all
    .filter((item) => item.state === "completed" || item.state === "cancelled")
    .sort((a, b) => (b.finishedAt ?? b.updatedAt) - (a.finishedAt ?? a.updatedAt));
  const otherWork = (jobs.data ?? [])
    .filter((job) => job.type !== "download.run")
    .sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || a.createdAt - b.createdAt);
  // Until the library has loaded, a finished download is taken to be installed still.
  const installedIds = collections.data ? new Set(collections.data.collections.map((item) => item.id)) : undefined;
  const nothing = all.length === 0 && otherWork.length === 0;

  return (
    <Page>
      <PageHeader
        title="Downloads"
        description="What is being fetched, what needs a hand, and what has finished. Downloads carry on in the background and continue from where they stopped."
        actions={
          nothing ? null : (
            <Button asChild>
              <Link to="/explore">Find more in Explore</Link>
            </Button>
          )
        }
      />

      {downloads.isPending ? (
        <div className="grid gap-6" aria-busy>
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-12" />
        </div>
      ) : downloads.isError ? (
        <ErrorState error={downloads.error} onRetry={() => downloads.refetch()} />
      ) : nothing ? (
        <EmptyState
          title="Nothing has been downloaded yet"
          seed={7}
          action={
            <>
              <Button asChild variant="primary">
                <Link to="/explore">Explore collections</Link>
              </Button>
              <Button asChild>
                <Link to="/maps">Download maps</Link>
              </Button>
            </>
          }
        >
          Collections and maps you choose are fetched here, with their real size and progress. Once installed they work without a
          connection.
        </EmptyState>
      ) : (
        <>
          <Section title="In progress">
            {active.length === 0 ? (
              <p className="text-small text-ink-muted">Nothing is downloading right now.</p>
            ) : (
              <Rows>
                {active.map((download) => (
                  <ActiveRow key={download.id} download={download} canManage={canManage} />
                ))}
              </Rows>
            )}
          </Section>

          {failed.length > 0 ? (
            <Section title="Needs attention" description="These stopped and will not continue by themselves.">
              <Rows>
                {failed.map((download) => (
                  <FailedRow key={download.id} download={download} canManage={canManage} />
                ))}
              </Rows>
            </Section>
          ) : null}

          {otherWork.length > 0 ? (
            <Section title="Other work in the background">
              <Rows>
                {otherWork.slice(0, JOBS_SHOWN).map((job) => (
                  <JobRow key={job.id} job={job} canCancel={canManage} />
                ))}
              </Rows>
              {otherWork.length > JOBS_SHOWN ? (
                <p className="mt-2.5 text-small text-ink-muted">And {plural(otherWork.length - JOBS_SHOWN, "more job")} waiting.</p>
              ) : null}
            </Section>
          ) : null}

          {history.length > 0 ? (
            <Section title="History">
              <Rows>
                {history.map((download) => (
                  <HistoryRow
                    key={download.id}
                    download={download}
                    canManage={canManage}
                    installed={Boolean(download.collectionId) && (installedIds === undefined || installedIds.has(download.collectionId!))}
                  />
                ))}
              </Rows>
            </Section>
          ) : null}
        </>
      )}
    </Page>
  );
}
