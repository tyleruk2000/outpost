import type { DownloadPlan } from "@outpost/shared";
import { WifiOff } from "lucide-react";
import { memo } from "react";
import { Notice } from "@/components/page";
import { clockTimeWithSeconds } from "./charts/time-axis";
import { PlanControls } from "./plan-controls";
import { PlanStorage } from "./plan-storage";
import { planSentence } from "./plan-text";
import { PlanThroughput } from "./plan-throughput";
import { PlanTimeline } from "./plan-timeline";

/** Keeps a figure on the same line as its unit: "500 kB/s", "11 minutes". */
const keepUnits = (text: string) => text.replace(/(\d) (?=[A-Za-z])/g, "$1\u00a0");

/**
 * The plan for the queue: a sentence that states it, the controls that steer it, then
 * when each download will finish, where it will land and how fast things are moving.
 * It takes the plan and nothing that changes with every progress event, so the charts
 * are redrawn when the plan is refreshed and not twice a second.
 */
export const PlanSection = memo(function PlanSection({
  plan,
  fetchedAt,
  stale,
  stalled,
}: {
  plan: DownloadPlan;
  /** When the plan was worked out; forecasts count from this moment. */
  fetchedAt: number;
  /** The last refresh failed, so the figures are from `fetchedAt` and are not moving. */
  stale: boolean;
  /** Downloads that stopped and are waiting to try again, by id, with what they are waiting for. Keep its identity stable. */
  stalled: ReadonlyMap<string, string>;
}) {
  const waitingForConnection = [...stalled.values()].filter((reason) => reason === "Waiting for a connection").length;
  const words = planSentence(plan, { now: fetchedAt, waitingForConnection });
  const moving = plan.counts.active + plan.counts.waiting > 0;
  const landing = plan.locations.some((location) => location.pendingBytes > 0);

  return (
    <section aria-labelledby="plan-title">
      <h2 id="plan-title" className="sr-only">
        The plan
      </h2>
      <p className="max-w-[52ch] font-title text-heading text-pretty text-ink">{keepUnits(words.lead)}</p>
      {words.notes.length > 0 ? <p className="tabular mt-2 max-w-[70ch] text-small text-ink-muted">{words.notes.join(" ")}</p> : null}

      {stale ? (
        <Notice tone="warning" icon={<WifiOff />} title="The plan is not updating" className="mt-4">
          The Outpost server did not answer. These figures are from {clockTimeWithSeconds(fetchedAt)}; they will refresh by themselves when
          it is back.
        </Notice>
      ) : null}

      <PlanControls plan={plan} className="mt-5" />

      {/* With everything paused there is no schedule to draw; the sentence has said so, and the list below has the rest. */}
      {moving ? (
        <div className="mt-8">
          <PlanTimeline plan={plan} now={fetchedAt} stalled={stalled} />
        </div>
      ) : null}

      {landing || moving ? (
        <div className="mt-9 grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {landing ? <PlanStorage locations={plan.locations} /> : null}
          {moving ? <PlanThroughput limit={plan.rateLimitBytesPerSecond} /> : null}
        </div>
      ) : null}
    </section>
  );
});
