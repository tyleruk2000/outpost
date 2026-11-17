import { memo } from "react";
import { useServerConnection } from "@/lib/events";
import { formatMegabits, formatRate, formatSpeed } from "./charts/speed";
import { SpeedChart } from "./charts/speed-chart";
import { agoLabel } from "./charts/time-axis";
import { THROUGHPUT_WINDOW_SECONDS, useThroughput } from "./use-plan";

/** The stretch of time shown grows with what has been collected, so a first minute is not a sliver at the edge. */
const WINDOWS = [60, 120, THROUGHPUT_WINDOW_SECONDS];
/** Fewer readings than this are a dot, not a trend. */
const ENOUGH = 4;

/** The time axis for a window ending now: where the ticks fall and what they say. Exported for its tests. */
export function recentWindow(firstAt: number | undefined, now: number): { seconds: number; ticks: Array<{ at: number; label: string }> } {
  const held = firstAt === undefined ? 0 : (now - firstAt) / 1000;
  const seconds = WINDOWS.find((window) => held <= window) ?? THROUGHPUT_WINDOW_SECONDS;
  const step = seconds / (seconds === 300 ? 5 : 4);
  const ticks = [];
  for (let back = seconds; back >= 0; back -= step) ticks.push({ at: now - back * 1000, label: agoLabel(back) });
  return { seconds, ticks };
}

/**
 * Total download speed over the last few minutes, as measured in this browser since
 * the screen was opened. The present figure is stated in text; the line gives it context.
 */
export const PlanThroughput = memo(function PlanThroughput({ limit, transferring }: { limit: number | null; transferring: boolean }) {
  const readings = useThroughput(transferring);
  const connected = useServerConnection();
  const last = readings[readings.length - 1];
  const now = last?.at ?? Date.now();
  const { seconds, ticks } = recentWindow(readings[0]?.at, now);
  const speed = last?.value ?? 0;

  return (
    <section aria-labelledby="plan-speed-title" className="min-w-0">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4">
        <h3 id="plan-speed-title" className="text-body font-semibold text-ink">
          Speed now
        </h3>
        <p className="tabular text-small text-ink-muted">
          {!connected ? (
            "Not known while the server is away"
          ) : !last ? (
            "Collecting…"
          ) : speed > 0 ? (
            <>
              <span className="text-body font-semibold text-ink">{formatSpeed(speed)}</span>
              <span className="ml-2">{formatMegabits(speed)}</span>
            </>
          ) : (
            "Nothing is moving"
          )}
        </p>
      </div>
      <p className="mb-2 text-small text-ink-muted">
        All transfers together, measured since this screen was opened
        {limit ? `. The limit is ${formatRate(limit).replace(" ", "\u00a0")}` : ""}.
      </p>
      <SpeedChart
        readings={readings.length < ENOUGH ? [] : readings}
        domain={[now - seconds * 1000, now]}
        xTicks={ticks}
        limit={limit}
        height={164}
        label={`Total download speed over the last ${agoLabel(seconds).replace(" ago", "")}`}
        timeLabel={(at) => agoLabel((now - at) / 1000)}
        placeholder={readings.length < ENOUGH ? (transferring ? "Collecting readings…" : "Nothing is transferring") : undefined}
        tableCaption="Total download speed, averaged over each 15 seconds"
        tableBucketSeconds={15}
      />
    </section>
  );
});
