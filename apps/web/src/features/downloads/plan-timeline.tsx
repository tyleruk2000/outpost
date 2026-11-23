import { type DownloadPlan, type DownloadPlanItem, formatBytes, formatDuration } from "@outpost/shared";
import { type FocusEvent, memo, type PointerEvent, useRef, useState } from "react";
import { Link } from "react-router";
import { useWidth } from "@/lib/use-width";
import { cn } from "@/lib/utils";
import { ChartTooltip } from "./charts/chart-tooltip";
import { linearScale } from "./charts/scale";
import { useTextScale } from "./charts/text-scale";
import { aheadLabel, atClock, clockAt, clockTime, durationTicks } from "./charts/time-axis";
import { mapTaskTitle } from "./download-text";
import { finishWords, startWords, unscheduledReason } from "./plan-text";

/** The label column and the plot share these columns in the axis, the grid and every row, so they line up. */
const columns = "grid gap-x-4 md:grid-cols-[15rem_minmax(0,1fr)]";
const ROW_HEIGHT = 28;
const BAR = 12;
const RADIUS = 4;
/** The width of a character of the small tabular text beside a bar, near enough to keep room for it. */
const CHARACTER = 6.7;

const phaseOrder: Record<DownloadPlanItem["phase"], number> = { active: 0, waiting: 1, paused: 2 };

/** A bar that is square where it starts and rounded where it ends. */
function barPath(x0: number, x1: number, y: number): string {
  const radius = Math.min(RADIUS, (x1 - x0) / 2);
  return `M${x0},${y} H${x1 - radius} a${radius},${radius} 0 0 1 ${radius},${radius} V${y + BAR - radius} a${radius},${radius} 0 0 1 ${-radius},${radius} H${x0} Z`;
}

const leftOf = (item: DownloadPlanItem) =>
  item.remainingBytes === null ? `${formatBytes(item.receivedBytes)} so far` : `${formatBytes(item.remainingBytes)} left`;

/** The key to a colour: a small square of it beside the words. A pale one gets an edge so it shows on the page. */
export function Swatch({ className, edged }: { className: string; edged?: boolean }) {
  return (
    <span aria-hidden className={cn("inline-block size-2.5 shrink-0 rounded-[2px]", edged && "border border-border-strong", className)} />
  );
}

/**
 * The queue as a schedule: one row per download in the order they will run, time from
 * now across. A bar runs from the forecast start to the forecast finish. Amber is being
 * fetched now, and the solid start of an amber bar is the share already here; teal is
 * waiting for its turn. What cannot be timed is listed with the reason instead of a bar.
 */
export const PlanTimeline = memo(function PlanTimeline({
  plan,
  now,
  stalled,
}: {
  plan: DownloadPlan;
  /** The moment the plan was worked out; its forecasts count from here. */
  now: number;
  /** Downloads that stopped and are waiting to try again, by id, with what they are waiting for. */
  stalled: ReadonlyMap<string, string>;
}) {
  const [plot, measured] = useWidth();
  const plotWidth = measured || 560;
  const frame = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);

  const rows = plan.queue
    .map((item, index) => ({ item, index }))
    .sort((a, b) => phaseOrder[a.item.phase] - phaseOrder[b.item.phase] || a.index - b.index)
    .map((row) => row.item);
  // With large text the labels are wider and taller; the room kept for them grows with it.
  const scale = useTextScale();
  const character = CHARACTER * scale;
  const reasonFor = (item: DownloadPlanItem) => unscheduledReason(item, plan, stalled.get(item.id));
  const scheduled = rows.filter((item) => reasonFor(item) === null);
  const horizon = Math.max(0, ...scheduled.map((item) => item.finishesInSeconds ?? 0));
  const hasAxis = scheduled.length > 0 && horizon > 0;
  // The clock time at each bar's tip: "19:05" today, "tomorrow 02:10" or "Tue 17 Nov 02:10" otherwise.
  const tipLabel = (item: DownloadPlanItem) => {
    const at = now + (item.finishesInSeconds ?? 0) * 1000;
    return clockAt(at, now) === clockTime(at) ? clockTime(at) : clockAt(at, now).replace(" at ", " ");
  };
  // Room is kept to the right of the longest bar for the widest of those labels, so none is ever cut off.
  const tipRoom = 14 + Math.max(0, ...scheduled.map((item) => tipLabel(item).length)) * character;
  const reach = Math.max(60, plotWidth - tipRoom);
  const toX = linearScale([0, horizon || 1], [0, reach]);
  const ticks = hasAxis ? durationTicks(horizon, Math.max(1, Math.floor(reach / 92))) : [];
  const both = scheduled.some((item) => item.phase === "active") && scheduled.some((item) => item.phase === "waiting");

  const pointAt = (item: DownloadPlanItem) => (event: PointerEvent<HTMLElement>) => {
    const box = frame.current?.getBoundingClientRect();
    if (!box) return;
    const row = event.currentTarget.getBoundingClientRect();
    const next = { id: item.id, x: Math.round(event.clientX - box.left), y: Math.round(row.bottom - box.top) };
    setTip((current) => (current && current.id === next.id && Math.abs(current.x - next.x) < 3 && current.y === next.y ? current : next));
  };
  const focusAt = (item: DownloadPlanItem) => (event: FocusEvent<HTMLElement>) => {
    const box = frame.current?.getBoundingClientRect();
    const plotBox = plot.current?.getBoundingClientRect();
    if (!box || !plotBox) return;
    const row = event.currentTarget.getBoundingClientRect();
    const along = reasonFor(item) === null ? toX(item.finishesInSeconds ?? 0) : 0;
    setTip({ id: item.id, x: Math.round(plotBox.left - box.left + along), y: Math.round(row.bottom - box.top) });
  };
  const tipped = tip ? rows.find((item) => item.id === tip.id) : undefined;

  return (
    <section aria-labelledby="plan-schedule-title">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <h3 id="plan-schedule-title" className="text-body font-semibold text-ink">
          Schedule
        </h3>
        {both ? (
          <ul className="flex flex-wrap gap-x-5 gap-y-1 text-small text-ink-muted">
            <li className="flex items-center gap-2">
              <Swatch className="bg-lamp" /> Downloading now
            </li>
            <li className="flex items-center gap-2">
              <Swatch className="bg-chart-1" /> Waiting for its turn
            </li>
          </ul>
        ) : null}
      </div>
      <p className="mb-3 max-w-[70ch] text-small text-ink-muted">
        {plan.basis === "measured"
          ? "A forecast: it assumes the present speed holds and is shared equally between the transfers running together."
          : scheduled.length === 0
            ? "Nothing can be timed at the moment; each download says why."
            : plan.basis === "limit"
              ? "A forecast from the limit you set, as nothing is moving yet."
              : "Times appear here once a transfer is under way and its speed has been measured."}
        {scheduled.some((item) => item.phase === "active" && item.receivedBytes > 0)
          ? " The solid start of an amber bar is the part already downloaded."
          : ""}
      </p>

      <div ref={frame} className="relative">
        <div className="scroll-quiet max-h-[26.5rem] overflow-y-auto overscroll-contain">
          <div
            className={cn(
              columns,
              "sticky top-0 z-(--z-sticky) border-b border-border bg-page",
              !hasAxis && "h-0 overflow-hidden border-b-0",
            )}
          >
            <span className="max-md:hidden" />
            <div ref={plot} className="min-w-0">
              {hasAxis ? (
                <svg width={plotWidth} height={24 * scale} aria-hidden className="block text-micro">
                  {ticks.map((tick) => (
                    <text
                      key={tick}
                      x={toX(tick)}
                      y={15 * scale}
                      textAnchor={tick === 0 ? "start" : "middle"}
                      className="tabular fill-ink-muted"
                    >
                      {aheadLabel(tick)}
                    </text>
                  ))}
                </svg>
              ) : null}
            </div>
          </div>

          <div className="relative">
            {hasAxis ? (
              <div aria-hidden className={cn(columns, "pointer-events-none absolute inset-0 max-md:hidden")}>
                <span className="max-md:hidden" />
                <svg width={plotWidth} height="100%" aria-hidden className="block">
                  {ticks.map((tick) => (
                    <line
                      key={tick}
                      x1={toX(tick) + 0.5}
                      x2={toX(tick) + 0.5}
                      y1={0}
                      y2="100%"
                      className={tick === 0 ? "stroke-chart-axis" : "stroke-chart-grid"}
                      strokeWidth={1}
                    />
                  ))}
                </svg>
              </div>
            ) : null}

            <ol className="relative">
              {rows.map((item) => {
                const reason = reasonFor(item);
                const x0 = toX(item.startsInSeconds ?? 0);
                const x1 = Math.max(x0 + 3, toX(item.finishesInSeconds ?? 0));
                const y = (ROW_HEIGHT - BAR) / 2;
                const active = item.phase === "active";
                const share = active && item.totalBytes ? Math.min(1, item.receivedBytes / item.totalBytes) : 0;
                const tip = tipLabel(item);
                const tipFits = x1 + 8 + tip.length * character <= plotWidth + 4;
                return (
                  <li key={item.id}>
                    <Link
                      to={`/downloads/${item.id}`}
                      aria-label={`Details of ${mapTaskTitle(item.title)}`}
                      className={cn(columns, "group items-center rounded-control py-1.5 -outline-offset-2 max-md:gap-y-0.5 max-md:py-2")}
                      onPointerMove={pointAt(item)}
                      onPointerLeave={() => setTip(null)}
                      onFocus={focusAt(item)}
                      onBlur={() => setTip(null)}
                    >
                      <span className="flex min-w-0 items-baseline justify-between gap-x-3 md:block">
                        <span className="block truncate text-small font-medium text-ink decoration-1 underline-offset-[0.2em] group-hover:underline group-focus-visible:underline">
                          {mapTaskTitle(item.title)}
                        </span>
                        <span className="tabular block shrink-0 text-small text-ink-muted">{leftOf(item)}</span>
                      </span>
                      {reason ? (
                        <span className="flex items-center text-small text-ink-muted md:pl-2" style={{ minHeight: ROW_HEIGHT }}>
                          {reason}
                        </span>
                      ) : (
                        <svg width={plotWidth} height={ROW_HEIGHT} aria-hidden className="block text-micro">
                          {/* Where the label sits above the bar, the grid is drawn behind each bar rather than through the labels. */}
                          <g className="md:hidden">
                            {ticks.map((tick) => (
                              <line
                                key={tick}
                                x1={toX(tick) + 0.5}
                                x2={toX(tick) + 0.5}
                                y1={0}
                                y2={ROW_HEIGHT}
                                className={tick === 0 ? "stroke-chart-axis" : "stroke-chart-grid"}
                                strokeWidth={1}
                              />
                            ))}
                          </g>
                          <path d={barPath(x0, x1, y)} className={active ? "fill-lamp" : "fill-chart-1"} fillOpacity={active ? 0.38 : 1} />
                          {share > 0 ? (
                            <rect
                              x={x0}
                              y={y}
                              width={Math.max(2, Math.min(x1 - x0 - RADIUS, (x1 - x0) * share))}
                              height={BAR}
                              className="fill-lamp"
                            />
                          ) : null}
                          <path
                            d={barPath(x0, x1, y)}
                            fill="none"
                            strokeWidth={2}
                            className={cn(
                              "opacity-0 transition-opacity duration-(--duration-fast) group-hover:opacity-100 group-focus-visible:opacity-100",
                              active ? "stroke-lamp" : "stroke-chart-1",
                            )}
                          />
                          {tipFits ? (
                            <text x={x1 + 8} y={ROW_HEIGHT / 2} dy="0.34em" className="tabular fill-ink-muted">
                              {tip}
                            </text>
                          ) : null}
                        </svg>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>

        {tip && tipped ? (
          <ChartTooltip x={tip.x} y={tip.y} frameWidth={frame.current?.clientWidth ?? 0}>
            <p className="font-medium">{mapTaskTitle(tipped.title)}</p>
            {reasonFor(tipped) === null ? (
              <>
                <p className="tabular">{startWords(tipped, now)}</p>
                <p className="tabular">{finishWords(tipped.finishesInSeconds ?? 0, now)}</p>
              </>
            ) : (
              <p>{reasonFor(tipped)}</p>
            )}
            <p className="tabular text-ink-muted">
              {tipped.remainingBytes === null
                ? `${formatBytes(tipped.receivedBytes)} so far, size not known`
                : `${formatBytes(tipped.remainingBytes)} left of ${formatBytes(tipped.totalBytes)}`}
              , to {tipped.locationName}
            </p>
          </ChartTooltip>
        ) : null}
      </div>

      {/* A table ignores the one-pixel box that hides it from sight, so a block around it takes that job. */}
      <div className="sr-only">
        <table>
          <caption>The download schedule, in the order downloads will run</caption>
          <thead>
            <tr>
              <th scope="col">Download</th>
              <th scope="col">State</th>
              <th scope="col">Left to fetch</th>
              <th scope="col">Starts</th>
              <th scope="col">Finishes</th>
              <th scope="col">Goes to</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const timed = reasonFor(item) === null;
              return (
                <tr key={item.id}>
                  <th scope="row">{mapTaskTitle(item.title)}</th>
                  <td>{reasonFor(item) ?? (item.phase === "active" ? "Downloading now" : "Waiting for its turn")}</td>
                  <td>{item.remainingBytes === null ? "Not known" : formatBytes(item.remainingBytes)}</td>
                  <td>
                    {!timed
                      ? "Not known"
                      : item.startsInSeconds
                        ? `In about ${formatDuration(item.startsInSeconds)}, ${atClock(now + item.startsInSeconds * 1000, now)}`
                        : "Now"}
                  </td>
                  <td>
                    {timed
                      ? `About ${clockAt(now + (item.finishesInSeconds ?? 0) * 1000, now)}, in ${formatDuration(item.finishesInSeconds ?? 0)}`
                      : "Not known"}
                  </td>
                  <td>{item.locationName}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
});
