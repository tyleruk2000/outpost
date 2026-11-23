/**
 * One task's page: what it is, where it stands, how fast it has gone, what it waits for,
 * what happened, and what can be done about it. The task's counterpart of the download page.
 */
import { formatDuration, type JobDetail, type JobDto, type JobSample, taskKind } from "@outpost/shared";
import { Check, CircleAlert, WifiOff } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { BackLink, EmptyState, ErrorState, Notice, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Progress, Skeleton } from "@/components/ui/misc";
import { ApiError } from "@/lib/api";
import { useServerConnection } from "@/lib/events";
import { useWidth } from "@/lib/use-width";
import { cn, formatDateTime, timeAgo } from "@/lib/utils";
import { niceTicks } from "./charts/scale";
import { speedTicks } from "./charts/speed";
import { SpeedChart } from "./charts/speed-chart";
import { clockAt, clockTicks, clockTimeWithSeconds } from "./charts/time-axis";
import { Exact, Fact, Facts, Part, Timeline } from "./detail-parts";
import { mapTaskTitle } from "./download-text";
import type { Tone } from "./plan-text";
import { liveRate, TaskControls } from "./task-row";
import {
  currentRate,
  describeTaskEvents,
  failureAdvice,
  fractionDone,
  progressText,
  rateReadings,
  rateTick,
  rateWords,
  secondsLeft,
  taskNowWords,
  taskStateWords,
  timeLeftWords,
  unitOf,
  waitingWords,
} from "./task-text";
import { useNow } from "./use-plan";
import { useTaskDetail } from "./use-tasks";

const badgeTone: Record<Tone, "neutral" | "lamp" | "success" | "warning" | "danger"> = {
  normal: "neutral",
  alive: "lamp",
  success: "success",
  warning: "warning",
  danger: "danger",
};

/** How often, at most, a screen reader is told how far a running task has got. */
const ANNOUNCE_EVERY_MS = 30_000;

function BackToList() {
  return <BackLink to="/downloads?show=tasks">Downloads and tasks</BackLink>;
}

/** A figure with its name, small and in a row, as on the download page. */
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

/** Tells a screen reader where a running task stands, now and then rather than with every change. */
function ProgressAnnouncer({ text }: { text: string }) {
  const [said, setSaid] = useState("");
  const last = useRef(0);
  const latest = useRef(text);
  latest.current = text;
  useEffect(() => {
    const now = Date.now();
    if (now - last.current >= ANNOUNCE_EVERY_MS) {
      last.current = now;
      setSaid(text);
      return;
    }
    const timer = window.setTimeout(
      () => {
        last.current = Date.now();
        setSaid(latest.current);
      },
      ANNOUNCE_EVERY_MS - (now - last.current),
    );
    return () => window.clearTimeout(timer);
  }, [text]);
  return (
    <p className="sr-only" aria-live="polite">
      {said}
    </p>
  );
}

function NowPart({ detail, job }: { detail: JobDetail; job: JobDto }) {
  const now = useNow(job.state === "running" ? 5000 : 30_000);
  const kind = taskKind(job.type);
  const unit = unitOf(job);
  const running = job.state === "running";
  const ended = job.state === "succeeded" || job.state === "failed" || job.state === "cancelled";
  // The server's smoothed rate; worked out from the samples when it has none (it restarted since, say).
  const rate = liveRate(job) ?? currentRate(detail.samples, job);
  const left = secondsLeft(job, rate);
  const fraction = fractionDone(job);
  const figures = progressText(job);
  const waiting = waitingWords(detail.waiting, now);
  const { startedAt, finishedAt } = job;

  const items: Array<[string, string, string?] | null> = [
    figures ? ["Progress", figures, fraction !== undefined ? `${Math.round(fraction * 100)}%` : undefined] : null,
    rate !== null ? ["Rate", rate > 0 ? rateWords(rate, unit) : "Not moving just now", "over the last few minutes"] : null,
    left !== null ? ["Time left", timeLeftWords(left), `finishes about ${clockAt(now + left * 1000, now)}`] : null,
    startedAt
      ? ["Started", formatDateTime(startedAt), timeAgo(startedAt)]
      : ["Added", formatDateTime(job.createdAt), timeAgo(job.createdAt)],
    ended && finishedAt ? [job.state === "succeeded" ? "Finished" : "Stopped", formatDateTime(finishedAt), timeAgo(finishedAt)] : null,
    startedAt && (running || (ended && finishedAt))
      ? [running ? "Running for" : "Took", formatDuration(((running ? now : finishedAt!) - startedAt) / 1000)]
      : null,
    job.attempts > 1 || (job.maxAttempts > 1 && job.state === "queued" && job.error)
      ? ["Attempts", `${job.attempts} of ${job.maxAttempts}`]
      : null,
  ];

  const announce = running
    ? [fraction !== undefined ? `${Math.round(fraction * 100)}% done` : taskNowWords(job), left !== null ? timeLeftWords(left) : null]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <Part title={ended ? "How it ended" : "Now"}>
      {job.state === "succeeded" ? (
        <p className="flex items-start gap-2 text-body text-ink">
          <Check aria-hidden className="mt-1 size-4 shrink-0 text-success" />
          <span>Finished{figures ? <span className="tabular">: {figures}</span> : null}.</span>
        </p>
      ) : job.state === "failed" ? (
        <div className="max-w-[70ch]">
          <p className="flex items-start gap-2 text-body text-danger">
            <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
            <span>{job.error ?? "It stopped with an error."}</span>
          </p>
          <p className="mt-2 text-small text-ink">{failureAdvice(job)}</p>
        </div>
      ) : job.state === "cancelled" ? (
        <p className="text-body text-ink">
          Cancelled before it finished{figures ? <span className="tabular"> ({figures} done)</span> : null}.
        </p>
      ) : (
        <div>
          {running || (fraction !== undefined && fraction > 0) ? (
            <Progress
              value={fraction}
              tone={running ? "lamp" : "muted"}
              label={`Progress of ${mapTaskTitle(job.title)}`}
              className="mb-2"
            />
          ) : null}
          <p className="text-small text-ink" aria-live="off">
            {taskNowWords(job)}
          </p>
          {running ? <ProgressAnnouncer text={announce} /> : null}
        </div>
      )}

      {waiting ? <p className="mt-4 max-w-[70ch] text-small text-ink">{waiting}</p> : null}
      {detail.waiting.reason === "turn" && detail.waiting.running.length + detail.waiting.ahead.length > 0 ? (
        <WaitingBehind detail={detail} />
      ) : null}

      <Figures items={items} />

      <div className={cn("mt-5 flex flex-wrap items-center gap-1", job.state !== "failed" && "-ml-2.5")}>
        <TaskControls job={job} />
        {kind.from ? (
          <Button asChild variant={job.state === "failed" && !kind.retry ? "secondary" : "ghost"} size="sm">
            <Link to={kind.from.to}>{kind.from.label}</Link>
          </Button>
        ) : null}
      </div>
    </Part>
  );
}

/** The tasks a waiting one is behind: what runs now, then what is queued before it. */
function WaitingBehind({ detail }: { detail: JobDetail }) {
  const { running, ahead, aheadCount } = detail.waiting;
  const more = aheadCount - ahead.length;
  return (
    <ol className="mt-3 grid gap-1.5 text-small">
      {[...running.map((item) => ({ item, now: true })), ...ahead.map((item) => ({ item, now: false }))].map(({ item, now }) => (
        <li key={item.id} className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-ink-muted">{now ? "Running now:" : "Before it:"}</span>
          <Link
            to={`/downloads/tasks/${item.id}`}
            className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2"
          >
            {mapTaskTitle(item.title)}
          </Link>
        </li>
      ))}
      {more > 0 ? <li className="text-ink-muted">And {more} more before it.</li> : null}
    </ol>
  );
}

/** The samples of the stage it is in now: a rate across two stages that count different things means nothing. */
function lastStage(samples: readonly JobSample[]): JobSample[] {
  const last = samples[samples.length - 1];
  if (!last) return [];
  let from = samples.length - 1;
  while (from > 0 && samples[from - 1]!.unit === last.unit) from -= 1;
  return samples.slice(from);
}

/**
 * Takes the samples and the state, not the live job, so the chart is redrawn when new
 * samples arrive (every few seconds) and not with every progress event.
 */
const RatePart = memo(function RatePart({
  samples,
  state,
  unit,
}: {
  samples: readonly JobSample[];
  state: JobDto["state"];
  unit: string | null;
}) {
  const [frame, width] = useWidth();
  const stage = useMemo(() => lastStage(samples), [samples]);
  const readings = useMemo(() => rateReadings(stage), [stage]);
  const chartUnit = stage[stage.length - 1]?.unit ?? unit;
  const first = readings[0];
  const last = readings[readings.length - 1];
  // Samples are spaced further apart the longer a task runs; a pause is a gap several times that.
  const gapMs = useMemo(() => {
    const steps = stage
      .slice(1)
      .map((sample, index) => sample.at - stage[index]!.at)
      .sort((a, b) => a - b);
    return Math.max(30_000, (steps[Math.floor(steps.length / 2)] ?? 0) * 4);
  }, [stage]);
  const moving = readings.filter((reading) => reading.value > 0);
  const average =
    first && last && last.at > first.at
      ? ((stage[stage.length - 1]!.current - stage[0]!.current) / ((stage[stage.length - 1]!.at - stage[0]!.at) / 1000)) *
        (chartUnit === "bytes" ? 1 : 60)
      : null;
  const peak = moving.length > 0 ? Math.max(...moving.map((reading) => reading.value)) : null;
  const what = chartUnit === "bytes" ? "Speed" : `${chartUnit ? chartUnit[0]!.toUpperCase() + chartUnit.slice(1) : "Items"} a minute`;

  return (
    <Part title="Rate over time" note={stage.length < samples.length ? "For the stage it is in now." : undefined}>
      <div ref={frame}>
        {readings.length < 2 || !first || !last ? (
          <p className="max-w-[60ch] text-small text-ink-muted">
            {state === "running"
              ? "Collecting readings. The line appears after a few seconds."
              : state === "queued" || state === "paused"
                ? "The rate is recorded while a task runs. There is nothing to show until this one is moving."
                : "Too little was recorded while this task ran to draw its rate. Short tasks and tasks that do not count what they do have none."}
          </p>
        ) : (
          <>
            <p className="tabular mb-3 text-small text-ink-muted">
              {average !== null ? (
                <>
                  Average <span className="font-semibold text-ink">{rateWords(average, chartUnit)}</span>
                </>
              ) : null}
              {average !== null && peak !== null ? ", " : null}
              {peak !== null ? (
                <>
                  peak <span className="font-semibold text-ink">{rateWords(peak, chartUnit)}</span>
                </>
              ) : null}{" "}
              over the {formatDuration((last.at - first.at) / 1000)} from {clockTimeWithSeconds(first.at)} to{" "}
              {clockTimeWithSeconds(last.at)}.
            </p>
            <SpeedChart
              readings={readings}
              domain={[first.at, last.at]}
              xTicks={clockTicks(first.at, last.at, Math.max(2, Math.floor((width || 640) / 120)))}
              height={208}
              label={`${what} for this task from ${clockTimeWithSeconds(first.at)} to ${clockTimeWithSeconds(last.at)}`}
              timeLabel={(at) => `at ${clockTimeWithSeconds(at)}`}
              tableCaption={`${what} for this task, averaged over each minute`}
              tableBucketSeconds={60}
              format={(value) => rateWords(value, chartUnit)}
              formatTick={(value) => rateTick(value, chartUnit)}
              ticksFor={chartUnit === "bytes" ? speedTicks : (max, count) => niceTicks(max > 0 ? max : 10, count)}
              valueName={chartUnit === "bytes" ? "Speed" : "Rate"}
              gapMs={gapMs}
            />
          </>
        )}
      </div>
    </Part>
  );
});

export default function TaskPage() {
  const { id = "" } = useParams();
  const detail = useTaskDetail(id);
  const connected = useServerConnection();
  // Relative times ("3 minutes ago") are refreshed now and then even when nothing else changes.
  const now = useNow(30_000);

  if (detail.isPending) {
    return (
      <Page>
        <BackToList />
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
        <BackToList />
        <h1 className="sr-only">Task</h1>
        <div className="mt-6">
          {missing ? (
            <EmptyState
              title="This task is not listed any more"
              seed={11}
              action={
                <Button asChild variant="primary">
                  <Link to="/downloads?show=tasks">Back to Downloads and tasks</Link>
                </Button>
              }
            >
              Its record may have been cleared, by erasing everything or restoring a backup. What it made, if anything, is where it was
              made.
            </EmptyState>
          ) : (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          )}
        </div>
      </Page>
    );
  }

  const data = detail.data;
  const job = data.job;
  const kind = taskKind(job.type);
  const state = taskStateWords(job);
  const alive = job.state === "running";
  const unit = unitOf(job);

  return (
    <Page>
      <BackToList />
      <header className="mt-3 mb-9">
        <h1 className="font-title text-title text-ink">{mapTaskTitle(job.title)}</h1>
        <p className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-small text-ink-muted">
          <Badge tone={badgeTone[state.tone]}>{state.label}</Badge>
          <span>
            {kind.name}
            <span aria-hidden className="mx-2 text-border-strong">
              /
            </span>
            added {timeAgo(job.createdAt)}
          </span>
        </p>
        <p className="mt-3 max-w-[68ch] text-body text-ink">{kind.about}</p>
      </header>

      {detail.isError || !connected ? (
        <Notice tone="warning" icon={<WifiOff />} title="These details are not updating" className="mb-8">
          The Outpost server did not answer. What is shown is from {clockTimeWithSeconds(detail.dataUpdatedAt)}; it will refresh by itself
          when the server is back.
        </Notice>
      ) : null}

      <NowPart detail={data} job={job} />

      <RatePart samples={data.samples} state={job.state} unit={unit} />

      <Part title="What happened" note="Every change of state, oldest first.">
        <Timeline
          lines={describeTaskEvents(data.events)}
          alive={alive}
          now={now}
          empty="Nothing was recorded for this task. Tasks from before this version of Outpost, and those that ended more than a week ago, have no history."
        />
      </Part>

      <Part title="About this task">
        <Facts>
          <Fact term="Kind of work">{kind.name}</Fact>
          {unit ? <Fact term="It counts">{unit}</Fact> : null}
          <Fact term="Can be paused">
            {kind.pause === "resumes"
              ? "Yes. It carries on from where it stopped."
              : kind.pause === "restarts"
                ? "Yes. When resumed it starts again from the beginning."
                : "No. It runs to the end once started."}
          </Fact>
          <Fact term="Runs at once">
            {data.waiting.slots === 1 ? "One task of this kind at a time" : `${data.waiting.slots} tasks of this kind at a time`}
          </Fact>
          <Fact term="Identifier">
            <Exact>{job.id}</Exact>
          </Fact>
          <Fact term="Job type">
            <Exact>{job.type}</Exact>
          </Fact>
        </Facts>
      </Part>
    </Page>
  );
}
