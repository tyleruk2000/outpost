import { ACTIVE_DOWNLOAD_STATES, type CollectionsResponse, type DownloadDto, type DownloadsResponse } from "@outpost/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CircleAlert } from "lucide-react";
import { Fragment, memo, type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { api } from "@/lib/api";
import { useActiveJobs } from "@/lib/queries";
import { formatNumber, plural, timeAgo } from "@/lib/utils";
import { manageLink } from "../manage/manage-data";
import { clockAt } from "./charts/time-axis";
import { DownloadControls, DownloadProgress, RemoveDownloadButton } from "./download-progress";
import { describeDownload } from "./download-text";
import { JobRow } from "./job-row";
import { PlanControls } from "./plan-controls";
import { PlanSection } from "./plan-section";
import { queuePosition, queuePositions, stalledWords } from "./plan-text";
import { downloadsKey, useDownloads, useOlderHistory } from "./use-downloads";
import { usePlan } from "./use-plan";

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
          <span>{part}</span>
        </Fragment>
      ))}
    </p>
  );
}

/** The way from a row to the whole story of that download. */
function DetailsLink({ download }: { download: DownloadDto }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={`/downloads/${download.id}`} aria-label={`Details of ${download.title}`}>
        Details
      </Link>
    </Button>
  );
}

const ActiveRow = memo(function ActiveRow({
  download,
  standing,
  forecast,
}: {
  download: DownloadDto;
  /** "Next", "2nd in line": where a waiting download stands. */
  standing: string | null;
  /** "Finishes about 19:05", from the plan. */
  forecast: string | null;
}) {
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-title text-lead text-ink">{download.title}</h3>
          <MetaLine
            parts={[
              `To ${download.locationName}`,
              standing,
              forecast ? (
                <span key="forecast" className="tabular">
                  {forecast}
                </span>
              ) : null,
            ]}
          />
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-1 max-md:-ml-2.5 md:-mr-2.5">
          <DownloadControls download={download} />
          <DetailsLink download={download} />
        </div>
      </div>
      <DownloadProgress download={download} className="mt-3" />
    </li>
  );
});

function FailedRow({ download }: { download: DownloadDto }) {
  const view = describeDownload(download);
  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="font-title text-lead text-ink">{download.title}</h3>
          <MetaLine parts={[`To ${download.locationName}`, download.finishedAt ? `Stopped ${timeAgo(download.finishedAt)}` : null]} />
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1 max-md:-ml-2.5 md:-mr-2.5">
          <DownloadControls download={download} />
          <RemoveDownloadButton download={download} label="Remove" />
          <DetailsLink download={download} />
        </div>
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

function HistoryRow({ download, installed }: { download: DownloadDto; installed: boolean }) {
  const view = describeDownload(download);
  const completed = download.state === "completed";
  const when = download.finishedAt ?? download.updatedAt;
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3.5">
      <div className="min-w-0">
        <h3 className="font-title text-body text-ink">
          {completed && installed ? (
            <Link
              to={download.documentId ? `/library/documents/${download.documentId}` : `/library/collections/${download.collectionId}`}
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
      <div className="flex max-w-full flex-wrap items-center gap-1 max-md:-ml-2.5 md:-mr-2.5">
        {completed ? null : <DownloadControls download={download} />}
        <RemoveDownloadButton download={download} label={completed ? "Remove from history" : "Remove"} />
        <DetailsLink download={download} />
      </div>
    </li>
  );
}

const stateOrder: Record<string, number> = { running: 0, verifying: 1, queued: 2, paused: 3 };

export default function DownloadsPage() {
  const downloads = useDownloads();
  const jobs = useActiveJobs();
  // Shared with other screens that list every collection; used here to know which finished downloads are still installed.
  const collections = useQuery({ queryKey: ["collections", "all"], queryFn: () => api.get<CollectionsResponse>("/api/collections") });

  const all = downloads.data ?? [];
  const active = all
    .filter((item) => ACTIVE_DOWNLOAD_STATES.includes(item.state))
    .sort((a, b) => (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || a.createdAt - b.createdAt);
  const failed = all.filter((item) => item.state === "failed");
  // History comes a page at a time: the newest with the list, older ones when asked for.
  const [olderAsked, setOlderAsked] = useState(false);
  const older = useOlderHistory(olderAsked);
  // Read beside the list it came with, which is drawn again whenever it changes.
  const historyTotal = useQueryClient().getQueryData<DownloadsResponse>(downloadsKey)?.historyTotal ?? 0;
  const history = [
    ...new Map(
      [...all, ...(older.data?.pages.flatMap((page) => page.downloads) ?? [])]
        .filter((item) => item.state === "completed" || item.state === "cancelled")
        .map((item) => [item.id, item]),
    ).values(),
  ].sort((a, b) => (b.finishedAt ?? b.updatedAt) - (a.finishedAt ?? a.updatedAt));
  const moreHistory = history.length < historyTotal && (!olderAsked || older.hasNextPage || older.isFetching);
  const otherWork = (jobs.data ?? [])
    .filter((job) => job.type !== "download.run")
    .sort((a, b) => Number(b.state === "running") - Number(a.state === "running") || a.createdAt - b.createdAt);
  // Until the library has loaded, a finished download is taken to be installed still.
  const installedIds = collections.data ? new Set(collections.data.collections.map((item) => item.id)) : undefined;
  const nothing = all.length === 0 && otherWork.length === 0;
  const installed = collections.data?.collections.length ?? 0;

  // The plan: asked for once there are downloads at all, refreshed while any is on its way.
  const plan = usePlan({ enabled: all.length > 0 });
  const queued = plan.data ? plan.data.counts.active + plan.data.counts.waiting + plan.data.counts.paused : 0;
  const positions = plan.data ? queuePositions(plan.data.queue) : undefined;
  const forecasts = new Map(plan.data?.queue.map((item) => [item.id, item]));
  // Downloads that stopped and will try again by themselves. Rebuilt only when that set changes, so the plan is not redrawn with every progress event.
  const stalledKey = active
    .map((item) => [item.id, stalledWords(item)] as const)
    .filter(([, reason]) => reason)
    .map(([key, reason]) => `${key}\t${reason}`)
    .join("\n");
  const stalled = useMemo(
    () => new Map(stalledKey ? stalledKey.split("\n").map((line) => line.split("\t") as [string, string]) : []),
    [stalledKey],
  );
  const forecastOf = (download: DownloadDto): string | null => {
    const item = forecasts.get(download.id);
    if (!item || item.finishesInSeconds === null || item.finishesInSeconds <= 0 || item.phase === "paused" || download.error) return null;
    return `Finishes about ${clockAt(plan.dataUpdatedAt + item.finishesInSeconds * 1000, plan.dataUpdatedAt)}`;
  };
  const standingOf = (download: DownloadDto): string | null => {
    const position = download.state === "queued" && !download.error ? positions?.get(download.id) : undefined;
    return position ? queuePosition(position) : null;
  };

  return (
    <Page>
      <PageHeader
        title="Downloads"
        description="What is being fetched, when it will be here, and what has finished. Downloads carry on in the background and continue from where they stopped."
        actions={
          <>
            <Button asChild>
              <Link to={manageLink("installed")}>Manage what is downloaded</Link>
            </Button>
            {nothing ? null : (
              <Button asChild>
                <Link to="/explore">Find more in Explore</Link>
              </Button>
            )}
            {nothing ? null : (
              <Button asChild>
                <Link to="/maps?reference=manage">Reference data for the map</Link>
              </Button>
            )}
          </>
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
      ) : nothing && installed > 0 ? (
        // Installed without a download here: a map imported from a file, a book included with Outpost.
        <EmptyState
          title="Nothing is downloading"
          seed={7}
          action={
            <>
              <Button asChild variant="primary">
                <Link to="/explore">Explore collections</Link>
              </Button>
              <Button asChild>
                <Link to="/library?tab=collections">See your collections</Link>
              </Button>
            </>
          }
        >
          The Library holds {plural(installed, "collection")}, added without a download here: included with Outpost or imported from a
          file. Collections and maps you fetch from Explore or Maps are listed here, with their real size and progress.
        </EmptyState>
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
              <Button asChild>
                <Link to="/maps?reference=manage">Reference data for the map</Link>
              </Button>
            </>
          }
        >
          Collections and maps you choose are fetched here, with their real size and progress. Once installed they work without a
          connection.
        </EmptyState>
      ) : (
        <>
          {active.length === 0 ? null : plan.data && queued > 0 ? (
            <PlanSection plan={plan.data} fetchedAt={plan.dataUpdatedAt} stale={plan.isError} stalled={stalled} />
          ) : plan.isPending ? (
            <div className="grid gap-4" aria-busy>
              <Skeleton className="h-14 max-w-[36rem]" />
              <Skeleton className="h-16" />
              <Skeleton className="h-28" />
            </div>
          ) : plan.isError && !plan.data ? (
            <ErrorState error={plan.error} onRetry={() => plan.refetch()} />
          ) : null}

          <Section title="In progress">
            {active.length === 0 ? (
              <>
                <p className="text-small text-ink-muted">
                  Nothing is downloading right now.{plan.data ? " The next downloads will run like this:" : ""}
                </p>
                {plan.data ? <PlanControls plan={plan.data} className="mt-3" /> : null}
              </>
            ) : (
              <Rows>
                {active.map((download) => (
                  <ActiveRow key={download.id} download={download} standing={standingOf(download)} forecast={forecastOf(download)} />
                ))}
              </Rows>
            )}
          </Section>

          {failed.length > 0 ? (
            <Section title="Needs attention" description="These stopped and will not continue by themselves.">
              <Rows>
                {failed.map((download) => (
                  <FailedRow key={download.id} download={download} />
                ))}
              </Rows>
            </Section>
          ) : null}

          {otherWork.length > 0 ? (
            <Section title="Other work in the background">
              <Rows>
                {otherWork.slice(0, JOBS_SHOWN).map((job) => (
                  <JobRow key={job.id} job={job} />
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
                    installed={
                      // A file saved from a link became a document; anything else became a collection.
                      Boolean(download.documentId) ||
                      (Boolean(download.collectionId) && (installedIds === undefined || installedIds.has(download.collectionId!)))
                    }
                  />
                ))}
              </Rows>
              {moreHistory ? (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button onClick={() => (olderAsked ? void older.fetchNextPage() : setOlderAsked(true))} loading={older.isFetching}>
                    Show more
                  </Button>
                  <span className="tabular text-small text-ink-muted">
                    {formatNumber(history.length)} of {formatNumber(historyTotal)} shown
                  </span>
                </div>
              ) : null}
            </Section>
          ) : null}
        </>
      )}
    </Page>
  );
}
