/**
 * An emergency plan's "Use now", from the copy kept on this phone, while the server is
 * out of reach. The same view as in reach (`emergency-plans/use-view.tsx`). Ticks are
 * kept on the phone and sent when the server is back (`plan-copy.ts`); the screen says
 * how old the copy is and that its ticks are waiting.
 */
import type { EmergencyPlanResponse } from "@outpost/shared";
import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { PlanInUse, stateLine } from "@/features/emergency-plans/use-view";
import { notify } from "@/lib/notify";
import { formatDateTime, plural, timeAgo } from "@/lib/utils";
import { DEVICE } from "./device";
import { type PendingTicks, readKeptPlan, tickOnPhone, ticksOnPhone } from "./plan-copy";
import { type KeptPlan, outOfRoomMessage } from "./store";

type Found =
  | { state: "loading" }
  | { state: "not-kept" }
  | { state: "kept"; item: KeptPlan; answer: EmergencyPlanResponse; pending: PendingTicks };

function NotKept() {
  return (
    <Page width="reading">
      <h1 className="font-title text-title text-ink">This plan is not kept on this {DEVICE}</h1>
      <p className="mt-2 max-w-[60ch] text-ink-muted">
        It is on the Outpost server, which is out of reach from here. When the server is back in reach, open the plan's “Use now” and choose
        “Keep on this {DEVICE}” at the foot of it, and it will open here next time.
      </p>
      <Button asChild variant="primary" className="mt-5">
        <Link to="/kept">See what is kept</Link>
      </Button>
    </Page>
  );
}

export default function KeptPlanScreen() {
  const { id = "" } = useParams();
  const [found, setFound] = useState<Found>({ state: "loading" });

  const load = useCallback(async () => {
    const kept = await readKeptPlan(id);
    setFound(kept ? { state: "kept", ...kept } : { state: "not-kept" });
  }, [id]);
  useEffect(() => {
    void load().catch(() => setFound({ state: "not-kept" }));
  }, [load]);

  if (found.state === "loading") {
    return (
      <Page width="reading">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-24" />
      </Page>
    );
  }
  if (found.state === "not-kept") return <NotKept />;

  const { item, answer, pending } = found;
  const { ticks, startedAt } = ticksOnPhone(answer, pending);
  const waiting = Object.keys(pending.ticks).length + Object.keys(pending.unticks).length;
  const tick = (stepId: string, done: boolean) => {
    // Written to the phone first, then shown: what is on screen is what is kept.
    tickOnPhone(id, stepId, done).then(
      (next) => setFound({ ...found, pending: next }),
      (error) => notify.error(outOfRoomMessage(error) ?? (error instanceof Error ? error.message : String(error))),
    );
  };

  return (
    <Page width="reading" className="text-lead">
      <PlanInUse
        plan={answer.plan}
        resolved={answer.resolved}
        ticks={ticks}
        onTick={tick}
        head={
          <>
            <Link to="/kept" className="mb-2 inline-flex min-h-11 items-center text-small text-primary">
              What is kept on this {DEVICE}
            </Link>
            <h1 className="font-title text-title text-ink">{answer.plan.name}</h1>
            <p className="mt-1 text-body text-ink-muted" aria-live="polite">
              {stateLine(answer.plan, ticks, startedAt)}
            </p>
            <p className="mt-2 max-w-[62ch] text-small text-ink">
              The copy kept on this {DEVICE}, from {formatDateTime(item.refreshedAt)} ({timeAgo(item.refreshedAt)}). Ticks made here are
              kept on this {DEVICE} and sent to the server when it is back in reach
              {waiting > 0 ? `: ${plural(waiting, "change")} waiting.` : "."}
              {item.gone ? " The plan is no longer on the server, so they cannot be sent." : ""}
            </p>
          </>
        }
      />
    </Page>
  );
}
