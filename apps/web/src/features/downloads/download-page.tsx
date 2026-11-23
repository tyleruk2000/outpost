import {
  ACTIVE_DOWNLOAD_STATES,
  type CollectionsResponse,
  type DownloadDetail,
  type DownloadDto,
  type DownloadKind,
  formatBytes,
  formatDuration,
} from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Check, CircleAlert, RotateCw, ShieldAlert, ShieldCheck, ShieldQuestion, WifiOff } from "lucide-react";
import { memo, useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { BackLink, EmptyState, ErrorState, Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton } from "@/components/ui/misc";
import { ApiError, api } from "@/lib/api";
import { useWidth } from "@/lib/use-width";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { formatMegabits, formatRate, formatSpeed } from "./charts/speed";
import { SpeedChart } from "./charts/speed-chart";
import { clockAt, clockTicks, clockTimeWithSeconds } from "./charts/time-axis";
import { Checksum, Exact, Fact, Facts, History, Part, Region } from "./detail-parts";
import { DownloadControls, DownloadProgress, RemoveDownloadButton } from "./download-progress";
import { describeDownload } from "./download-text";
import { fetcherWords, integrityVerdict, queuePosition, queuePositions, retryWords, stateWords, type Tone } from "./plan-text";
import { useDownloads } from "./use-downloads";
import { useDownloadDetail, useNow, usePlan } from "./use-plan";

const kindWords: Record<DownloadKind, string> = {
  zim: "Reference collection",
  map: "Map region",
  terrain: "Terrain for a map region",
  places: "Place names",
  file: "File",
  model: "Search model",
  dataset: "Map layer or radio data",
  document: "Document saved from a link",
  extract: "Country file",
};

const badgeTone: Record<Tone, "neutral" | "lamp" | "success" | "warning" | "danger"> = {
  normal: "neutral",
  alive: "lamp",
  success: "success",
  warning: "warning",
  danger: "danger",
};

function BackToDownloads() {
  return <BackLink to="/downloads">Downloads and tasks</BackLink>;
}

/** A figure with its name, small and in a row: speed, time left, when it finishes. */
function Figures({ items }: { items: Array<[term: string, value: string, aside?: string] | null> }) {
  const present = items.filter((item) => item !== null);
  if (present.length === 0) return null;
  return (
    <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-3">
      {present.map(([term, value, aside]) => (
        <div key={term}>
          <dt className="text-small text-ink-muted">{term}</dt>
          <dd className="tabular mt-0.5 text-body text-ink">
            {value}
            {aside ? <span className="ml-2 text-small text-ink-muted">{aside}</span> : null}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Counts down to the next attempt, a second at a time, without redrawing anything else. */
function NextAttempt({ attempts }: { attempts: DownloadDetail["attempts"] }) {
  const now = useNow(1000);
  const words = retryWords(attempts, now);
  if (!words) return null;
  return (
    <p className="mt-4 flex items-start gap-2 text-small text-ink" role="timer" aria-live="off">
      <RotateCw aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
      <span className="tabular">{words}. It carries on from where it stopped.</span>
    </p>
  );
}

function NowPart({ detail, download, onRemoved }: { detail: DownloadDetail; download: DownloadDto; onRemoved: () => void }) {
  const active = ACTIVE_DOWNLOAD_STATES.includes(download.state);
  const inQueue = download.state === "queued" || download.state === "running";
  const plan = usePlan({ enabled: inQueue });
  const planned = inQueue ? plan.data?.queue.find((item) => item.id === download.id) : undefined;
  const base = plan.dataUpdatedAt || Date.now();
  const position =
    planned && download.state === "queued" && !download.error ? queuePositions(plan.data?.queue ?? []).get(download.id) : undefined;
  const finishIn = planned?.finishesInSeconds ?? (download.state === "running" ? download.etaSeconds : null);
  const { startedAt, finishedAt } = detail.timing;
  const view = describeDownload(download);

  // Speed and time left are already in the line under the bar; these are the figures it does not give.
  // A download that stopped and is waiting to try again gets no forecast: nobody knows when the network will be back.
  const figures: Array<[string, string, string?] | null> = [
    download.state === "running" && download.bytesPerSecond ? ["As a connection speed", formatMegabits(download.bytesPerSecond)] : null,
    position ? ["Place in the queue", queuePosition(position)] : null,
    planned && planned.phase === "waiting" && planned.startsInSeconds && !download.error
      ? ["Starts", `about ${clockAt(base + planned.startsInSeconds * 1000, base)}`, `in ${formatDuration(planned.startsInSeconds)}`]
      : null,
    inQueue && !download.error && finishIn !== null && finishIn > 0
      ? ["Finishes", `about ${clockAt(base + finishIn * 1000, base)}`, `in ${formatDuration(finishIn)}`]
      : null,
    download.state === "completed" && finishedAt ? ["Finished", formatDateTime(finishedAt), timeAgo(finishedAt)] : null,
    download.state === "completed" && finishedAt && startedAt && finishedAt > startedAt
      ? ["Took", formatDuration((finishedAt - startedAt) / 1000), "from first byte to installed"]
      : null,
    (download.state === "failed" || download.state === "cancelled") && finishedAt
      ? ["Stopped", formatDateTime(finishedAt), timeAgo(finishedAt)]
      : null,
    download.state !== "completed" && detail.attempts.made > 1
      ? ["Attempts", `${detail.attempts.made} of ${detail.attempts.allowed}`]
      : null,
  ];

  return (
    <Part title={active ? "Now" : "How it ended"}>
      {download.state === "completed" ? (
        <p className="flex items-start gap-2 text-body text-ink">
          <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
          <span>
            All <span className="tabular">{formatBytes(download.totalBytes ?? download.receivedBytes)}</span> arrived and{" "}
            {detail.integrity.verified ? "matched the published checksum" : "was installed"}.
          </span>
        </p>
      ) : download.state === "failed" ? (
        <p className="flex max-w-[70ch] items-start gap-2 text-body text-danger">
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>
            {view.status}
            {view.detail ? <span className="mt-0.5 block text-small text-ink-muted">{view.detail}</span> : null}
          </span>
        </p>
      ) : (
        <DownloadProgress download={download} />
      )}
      {download.state === "queued" && detail.attempts.nextAttemptAt ? <NextAttempt attempts={detail.attempts} /> : null}
      <Figures items={figures} />
      {/* Text buttons are pulled left so their words line up with the column; an outlined one (Retry, after a failure) is not. */}
      <div className={cn("mt-5 flex flex-wrap items-center gap-1", download.state !== "failed" && "-ml-2.5")}>
        <DownloadControls download={download} />
        {active ? null : (
          <RemoveDownloadButton
            download={download}
            label={download.state === "completed" ? "Remove from history" : "Remove"}
            onRemoved={onRemoved}
          />
        )}
      </div>
    </Part>
  );
}

/**
 * Takes the details and the state, not the live download, so the chart is redrawn when
 * new readings arrive (every few seconds) and not with every progress event.
 */
const SpeedPart = memo(function SpeedPart({ detail, state }: { detail: DownloadDetail; state: DownloadDto["state"] }) {
  const [frame, width] = useWidth();
  const readings = useMemo(
    () => detail.speedHistory.map((point) => ({ at: point.at, value: point.bytesPerSecond })),
    [detail.speedHistory],
  );
  const first = readings[0];
  const last = readings[readings.length - 1];
  const limit = detail.rateLimitBytesPerSecond;
  const { averageBytesPerSecond: average, peakBytesPerSecond: peak } = detail.timing;

  return (
    <Part
      title="Speed over time"
      note={limit && readings.length >= 2 ? `All downloads together are limited to ${formatRate(limit)}.` : undefined}
    >
      <div ref={frame}>
        {readings.length < 2 || !first || !last ? (
          <p className="max-w-[60ch] text-small text-ink-muted">
            {state === "running"
              ? "Collecting readings. The line appears after a few seconds."
              : ACTIVE_DOWNLOAD_STATES.includes(state)
                ? "Speed is recorded while a download runs. There is nothing to show until this one is moving."
                : "Speed is recorded while a download runs. Nothing has been recorded for this one since the server last started."}
          </p>
        ) : (
          <>
            <p className="tabular mb-3 text-small text-ink-muted">
              {average !== null ? (
                <>
                  Average <span className="font-semibold text-ink">{formatSpeed(average)}</span>
                </>
              ) : null}
              {average !== null && peak !== null ? ", " : null}
              {peak !== null ? (
                <>
                  peak <span className="font-semibold text-ink">{formatSpeed(peak)}</span>
                </>
              ) : null}
              {average !== null || peak !== null ? " " : null}
              over the {formatDuration((last.at - first.at) / 1000)} from {clockTimeWithSeconds(first.at)} to{" "}
              {clockTimeWithSeconds(last.at)}.
            </p>
            <SpeedChart
              readings={readings}
              domain={[first.at, last.at]}
              xTicks={clockTicks(first.at, last.at, Math.max(2, Math.floor((width || 640) / 120)))}
              limit={limit}
              height={208}
              label={`Speed of this download from ${clockTimeWithSeconds(first.at)} to ${clockTimeWithSeconds(last.at)}`}
              timeLabel={(at) => `at ${clockTimeWithSeconds(at)}`}
              tableCaption="Speed of this download, averaged over each 30 seconds"
              tableBucketSeconds={30}
            />
          </>
        )}
      </div>
    </Part>
  );
});

const verdictIcon: Record<Tone, typeof ShieldCheck> = {
  success: ShieldCheck,
  danger: ShieldAlert,
  normal: ShieldQuestion,
  warning: ShieldQuestion,
  alive: ShieldQuestion,
};

function lastModifiedWords(value: string): string {
  const at = Date.parse(value);
  return Number.isNaN(at) ? value : formatDateTime(at);
}

export default function DownloadPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const detail = useDownloadDetail(id);
  // The live list is patched by progress events, so the bar and the figures move without waiting for a refetch.
  const list = useDownloads();
  const collections = useQuery({ queryKey: ["collections", "all"], queryFn: () => api.get<CollectionsResponse>("/api/collections") });
  // Relative times ("3 minutes ago") are refreshed now and then even when nothing else changes.
  const now = useNow(30_000);

  if (detail.isPending) {
    return (
      <Page>
        <BackToDownloads />
        <div className="mt-4 grid gap-6" aria-busy>
          <Skeleton className="h-9 max-w-[28rem]" />
          <Skeleton className="h-5 max-w-[18rem]" />
          <Skeleton className="mt-4 h-24" />
          <Skeleton className="h-48" />
          <Skeleton className="h-32" />
        </div>
      </Page>
    );
  }

  if (!detail.data) {
    const missing = detail.error instanceof ApiError && detail.error.status === 404;
    return (
      <Page>
        <BackToDownloads />
        <div className="mt-6">
          {missing ? (
            <EmptyState
              title="This download is not listed any more"
              seed={11}
              action={
                <Button asChild variant="primary">
                  <Link to="/downloads">Back to Downloads and tasks</Link>
                </Button>
              }
            >
              It may have been removed from the history. What it installed, if anything, is still in the library.
            </EmptyState>
          ) : (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          )}
        </div>
      </Page>
    );
  }

  const data = detail.data;
  const live = list.data?.find((item) => item.id === id);
  const download = live && live.updatedAt >= data.download.updatedAt ? live : data.download;
  const state = stateWords(download);
  const alive = download.state === "running" || download.state === "verifying";
  const { source, integrity, destination, about, region } = data;
  const verdict = integrityVerdict(integrity, download.state);
  const VerdictIcon = verdictIcon[verdict.tone];
  const installed =
    download.state === "completed" &&
    // A file saved from a link became a document; anything else became a collection.
    (download.documentId !== null ||
      (download.collectionId !== null &&
        (!collections.data || collections.data.collections.some((item) => item.id === download.collectionId))));

  return (
    <Page>
      <BackToDownloads />
      <header className="mt-3 mb-9">
        <h1 className="font-title text-title text-ink">{download.title}</h1>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-small text-ink-muted">
          <Badge tone={badgeTone[state.tone]}>{state.label}</Badge>
          <span>
            {kindWords[download.kind] ?? "Download"}
            <span aria-hidden className="mx-2 text-border-strong">
              /
            </span>
            to {destination.locationName}
            <span aria-hidden className="mx-2 text-border-strong">
              /
            </span>
            added {timeAgo(data.timing.createdAt)}
          </span>
        </p>
      </header>

      {detail.isError ? (
        <Notice tone="warning" icon={<WifiOff />} title="These details are not updating" className="mb-8">
          The Outpost server did not answer. What is shown is from {clockTimeWithSeconds(detail.dataUpdatedAt)}; it will refresh by itself
          when the server is back.
        </Notice>
      ) : null}

      <NowPart detail={data} download={download} onRemoved={() => navigate("/downloads")} />

      <SpeedPart detail={data} state={download.state} />

      <Part title="What happened" note="Every change of state, oldest first.">
        <History events={data.events} alive={alive} now={now} />
      </Part>

      <Part title="Where from">
        <Facts>
          <Fact term="Asked for at">
            <span className="block text-body font-medium">{source.requestedHost || "An address without a host name"}</span>
            <Exact className="text-ink-muted">{source.requestedUrl}</Exact>
          </Fact>
          {source.servedBy ? (
            <Fact term="Sent by">
              <span className="block text-body font-medium">{source.servedBy}</span>
              <span className="block max-w-[62ch] text-ink-muted">
                A mirror, chosen by the source. Mirrors only carry the bytes; what is trusted is the checksum, which comes from the source
                itself.
              </span>
            </Fact>
          ) : null}
          <Fact term="How it is fetched">{fetcherWords(source.fetcher)}</Fact>
          {source.lastModified ? (
            <Fact term="Last changed there">
              <span className="tabular">{lastModifiedWords(source.lastModified)}</span>
            </Fact>
          ) : null}
          {source.etag ? (
            <Fact term="Version tag (ETag)">
              <Exact>{source.etag}</Exact>
              <span className="block text-ink-muted">Used to make sure a resumed download continues the same file.</span>
            </Fact>
          ) : null}
        </Facts>
      </Part>

      <Part title="Integrity">
        <p className="flex items-start gap-2.5">
          <VerdictIcon
            aria-hidden
            className={cn(
              "mt-0.5 size-5 shrink-0",
              verdict.tone === "success" ? "text-success" : verdict.tone === "danger" ? "text-danger" : "text-ink-muted",
            )}
          />
          <span className="max-w-[62ch] text-small text-ink">
            <span className={cn("font-semibold", verdict.tone === "success" && "text-success", verdict.tone === "danger" && "text-danger")}>
              {verdict.title}.
            </span>{" "}
            {verdict.text}
          </span>
        </p>
        <Facts className="mt-5">
          {integrity.md5Expected && !integrity.sha256Expected ? (
            // A source that publishes an MD5 and nothing else: that is what the file is held to.
            <>
              <Fact term="Published MD5">
                <Checksum value={integrity.md5Expected} name="the published checksum" />
              </Fact>
              <Fact term="MD5 of the file">
                {integrity.md5Actual ? (
                  <Checksum value={integrity.md5Actual} name="the MD5 of the file" />
                ) : (
                  <span className="text-ink-muted">
                    {download.state === "failed" || download.state === "cancelled"
                      ? "Not worked out: the download did not finish"
                      : "Worked out when the download finishes"}
                  </span>
                )}
              </Fact>
            </>
          ) : (
            <Fact term="Published SHA-256">
              {integrity.sha256Expected ? (
                <Checksum value={integrity.sha256Expected} name="the published checksum" />
              ) : (
                <span className="text-ink-muted">None published by the source</span>
              )}
            </Fact>
          )}
          <Fact term="SHA-256 of the file">
            {integrity.sha256Actual ? (
              <Checksum value={integrity.sha256Actual} name="the checksum of the file" />
            ) : (
              <span className="text-ink-muted">
                {download.state === "completed"
                  ? "Not recorded"
                  : download.state === "failed" || download.state === "cancelled"
                    ? "Not worked out: the download did not finish"
                    : "Worked out when the download finishes"}
              </span>
            )}
          </Fact>
        </Facts>
      </Part>

      <Part title="Where to">
        <Facts>
          <Fact term="Storage location">
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-body font-medium">{destination.locationName}</span>
              {destination.locationAvailable ? (
                <Badge tone="success">
                  <Check aria-hidden /> Connected
                </Badge>
              ) : (
                <Badge tone="warning">
                  <CircleAlert aria-hidden /> Not connected
                </Badge>
              )}
            </span>
          </Fact>
          <Fact term="Path inside it">
            <Exact>{destination.relPath}</Exact>
          </Fact>
          {destination.freeBytes !== null ? (
            <Fact term="Free there now">
              <span className="tabular">
                {formatBytes(destination.freeBytes)}
                {destination.totalBytes !== null ? ` of ${formatBytes(destination.totalBytes)}` : ""}
              </span>
            </Fact>
          ) : null}
          {download.state === "completed" && download.collectionId && !installed ? (
            <Fact term="In the library">Since removed from the library.</Fact>
          ) : null}
        </Facts>
        {installed || download.catalogEntryId ? (
          <p className="mt-5 flex flex-wrap gap-2">
            {installed ? (
              <Button asChild variant="primary">
                <Link
                  to={download.documentId ? `/library/documents/${download.documentId}` : `/library/collections/${download.collectionId}`}
                >
                  Open in the library
                </Link>
              </Button>
            ) : null}
            {download.catalogEntryId ? (
              <Button asChild>
                <Link to={`/explore?entry=${encodeURIComponent(download.catalogEntryId)}`}>See it in Explore</Link>
              </Button>
            ) : null}
          </p>
        ) : null}
      </Part>

      {about ? (
        <Part title="About this item" note="As the catalogue described it when the download was started.">
          {about.description ? <p className="mb-5 max-w-[68ch] text-body text-ink">{about.description}</p> : null}
          <Facts>
            {about.publisher ? <Fact term="Publisher">{about.publisher}</Fact> : null}
            {about.license ? <Fact term="Licence">{about.license}</Fact> : null}
            {about.attribution ? <Fact term="Attribution">{about.attribution}</Fact> : null}
            {about.version ? (
              <Fact term="Version">
                <span className="tabular">{about.version}</span>
              </Fact>
            ) : null}
            {about.language ? <Fact term="Language">{languageName(about.language)}</Fact> : null}
          </Facts>
        </Part>
      ) : null}

      {region ? (
        <Part title="The map region">
          <Region region={region} />
        </Part>
      ) : null}
    </Page>
  );
}

/** "English" for "en", falling back to the tag itself. */
function languageName(tag: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(tag) ?? tag;
  } catch {
    return tag;
  }
}
