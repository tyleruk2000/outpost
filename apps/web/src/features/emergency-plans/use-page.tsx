/**
 * A plan in use: the steps to tick, the numbers to call (a press calls on a phone) and
 * the places to meet (a press opens the offline map there), in large type and nothing
 * else. Each tick is kept on the server with its time, so the plan shows what has been
 * done to whoever opens it next. With the server out of reach, a copy kept on this
 * phone ("Keep on this phone", below) is shown instead (`features/kept/kept-plan-screen.tsx`).
 */
import { RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { BackLink, ErrorState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { BoardPlanLine } from "@/features/board/elsewhere";
import { KeepPlanSection } from "@/features/kept/keep-plan";
import { plural } from "@/lib/utils";
import { usePlan, usePlanAction, useTick } from "./data";
import { PlanHouseholdLine } from "./household-line";
import { PlanInUse, stateLine } from "./use-view";
import { HomeWarningLine } from "./warning-line";

export default function UsePlanPage() {
  const { id = "" } = useParams();
  const response = usePlan(id);
  const tick = useTick(id);
  const reset = usePlanAction(id, "reset");
  const opened = usePlanAction(id, "opened");
  const start = usePlanAction(id, "start");
  const [resetting, setResetting] = useState(false);
  const openedMutate = opened.mutate;
  useEffect(() => {
    if (response.isSuccess) openedMutate();
  }, [response.isSuccess, openedMutate]);

  if (response.isPending) {
    return (
      <Page width="reading">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-24" />
        <Skeleton className="mt-4 h-64" />
      </Page>
    );
  }
  if (response.isError || !response.data) {
    return (
      <Page width="reading">
        <h1 className="font-title text-title text-ink">Emergency plan</h1>
        <div className="mt-4">
          <ErrorState error={response.error} onRetry={() => void response.refetch()} />
        </div>
      </Page>
    );
  }
  const { plan, resolved } = response.data;
  const ticks = plan.use.ticks;
  const done = plan.body.steps.filter((step) => ticks[step.id] !== undefined).length;

  return (
    <Page width="reading" className="text-lead">
      <PlanInUse
        plan={plan}
        resolved={resolved}
        ticks={ticks}
        onTick={(stepId, checked) => tick.mutate({ stepId, done: checked })}
        head={
          <>
            <BackLink to={`/prepare/plans/${id}`} className="mb-2">
              The whole plan
            </BackLink>
            <h1 className="font-title text-title text-ink">{plan.name}</h1>
            <PlanHouseholdLine household={response.data.household} className="mt-1" />
            <p className="mt-1 text-body text-ink-muted" aria-live="polite">
              {stateLine(plan, ticks, plan.use.startedAt)}
            </p>
            <HomeWarningLine className="mt-3" />
            {plan.use.startedAt !== null ? <BoardPlanLine className="mt-2" /> : null}
            {plan.use.startedAt === null ? (
              <Button variant="primary" size="lg" className="mt-3" loading={start.isPending} onClick={() => start.mutate()}>
                Start using this plan
              </Button>
            ) : null}
          </>
        }
        foot={
          <>
            <div className="mt-4">
              <Button size="lg" onClick={() => setResetting(true)} disabled={plan.use.startedAt === null && done === 0}>
                <RotateCcw aria-hidden /> Reset for next time
              </Button>
            </div>
            <KeepPlanSection plan={plan} />
          </>
        }
      />
      <ConfirmDialog
        open={resetting}
        onOpenChange={setResetting}
        title="Reset the plan for next time?"
        description={`The ${plural(done, "tick")} and the time the plan was started will be cleared. The steps themselves are not changed.`}
        confirmLabel="Reset"
        confirmVariant="primary"
        loading={reset.isPending}
        onConfirm={() => reset.mutate(undefined, { onSuccess: () => setResetting(false) })}
      />
    </Page>
  );
}
