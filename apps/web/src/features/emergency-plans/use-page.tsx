/**
 * A plan in use: the steps to tick, the numbers to call (a press calls on a phone) and
 * the places to meet (a press opens the offline map there), in large type and nothing
 * else. Each tick is kept on the server with its time, so the plan shows what has been
 * done to whoever opens it next. It needs Outpost's server and nothing beyond it.
 */
import { PLAN_PHASES, planCaveat } from "@outpost/shared";
import { ArrowLeft, Check, MapPin, Phone, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { ErrorState, Page } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/misc";
import { formatTimeOfDay } from "@/lib/clock";
import { cn, formatDate, plural } from "@/lib/utils";
import { usePlan, usePlanAction, useTick } from "./data";
import { type ReadNumber, readableOf } from "./printable";
import { HomeWarningLine } from "./warning-line";

function Dial({ number, label, big }: { number: ReadNumber; label: string; big?: boolean }) {
  const content = (
    <>
      <Phone aria-hidden className={big ? "size-6" : "size-5"} />
      <span className="whitespace-nowrap">{number.value}</span>
    </>
  );
  const style = cn("tabular inline-flex min-h-12 items-center gap-2 font-semibold", big ? "text-display" : "text-heading");
  return number.dial ? (
    <a
      href={`tel:${number.dial}`}
      className={cn(style, "text-primary underline-offset-4 hover:underline")}
      aria-label={`Call ${label}: ${number.value}`}
    >
      {content}
    </a>
  ) : (
    <span className={cn(style, "text-ink")}>{content}</span>
  );
}

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
  const readable = useMemo(() => (response.data ? readableOf(response.data.plan, response.data.resolved) : null), [response.data]);

  if (response.isPending) {
    return (
      <Page width="reading">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="mt-6 h-24" />
        <Skeleton className="mt-4 h-64" />
      </Page>
    );
  }
  if (response.isError || !readable || !response.data) {
    return (
      <Page width="reading">
        <h1 className="font-title text-title text-ink">Emergency plan</h1>
        <div className="mt-4">
          <ErrorState error={response.error} onRetry={() => void response.refetch()} />
        </div>
      </Page>
    );
  }
  const { plan } = response.data;
  const ticks = plan.use.ticks;
  const done = readable.steps.filter((step) => ticks[step.id] !== undefined).length;
  const emergency: ReadNumber = {
    label: "emergency services",
    value: plan.emergencyNumber,
    dial: plan.emergencyNumber.replace(/[^\d+*#]/g, "") || null,
  };

  return (
    <Page width="reading" className="text-lead">
      <Link to={`/prepare/plans/${id}`} className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-small text-primary">
        <ArrowLeft aria-hidden className="size-4" /> The whole plan
      </Link>
      <h1 className="font-title text-title text-ink">{plan.name}</h1>
      <p className="mt-1 text-body text-ink-muted" aria-live="polite">
        {plan.use.startedAt !== null
          ? `In use since ${formatDate(plan.use.startedAt)}, ${formatTimeOfDay(plan.use.startedAt)}. ${done} of ${plural(readable.steps.length, "step")} done.`
          : `${plural(readable.steps.length, "step")}. Not in use.`}
      </p>
      <HomeWarningLine className="mt-3" />
      {plan.use.startedAt === null ? (
        <Button variant="primary" size="lg" className="mt-3" loading={start.isPending} onClick={() => start.mutate()}>
          Start using this plan
        </Button>
      ) : null}

      <section aria-label="Emergency services" className="mt-6 border-y border-border py-4">
        <p className="text-body text-ink">Emergency services</p>
        <Dial number={emergency} label="the emergency services" big />
      </section>

      {PLAN_PHASES.map((phase) => {
        const steps = readable.steps.filter((step) => step.phase === phase.id);
        if (steps.length === 0) return null;
        return (
          <section key={phase.id} className="mt-8" aria-labelledby={`phase-${phase.id}`}>
            <h2 id={`phase-${phase.id}`} className="text-heading font-semibold text-ink">
              {phase.label}
            </h2>
            <ol className="mt-2 divide-y divide-border border-y border-border">
              {steps.map((step, index) => {
                const at = ticks[step.id];
                const checked = at !== undefined;
                return (
                  <li key={step.id}>
                    <label className="flex min-h-14 cursor-pointer items-start gap-4 py-3">
                      <input
                        type="checkbox"
                        className="peer sr-only"
                        checked={checked}
                        onChange={(event) => tick.mutate({ stepId: step.id, done: event.target.checked })}
                      />
                      <span
                        aria-hidden
                        className={cn(
                          "mt-0.5 grid size-8 shrink-0 place-items-center rounded-control border-2 peer-focus-visible:ring-2 peer-focus-visible:ring-focus",
                          checked ? "border-primary bg-primary text-primary-ink" : "border-border-strong bg-page",
                        )}
                      >
                        {checked ? <Check className="size-5" strokeWidth={3} /> : null}
                      </span>
                      <span className="min-w-0">
                        <span className={cn("block text-lead", checked ? "text-ink-muted line-through decoration-1" : "text-ink")}>
                          <span className="tabular">{index + 1}.</span> {step.text}
                        </span>
                        {checked ? <span className="block text-small text-ink-muted">Done at {formatTimeOfDay(at)}</span> : null}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      {readable.contacts.length > 0 ? (
        <section className="mt-8" aria-labelledby="who-to-call">
          <h2 id="who-to-call" className="text-heading font-semibold text-ink">
            Who to call
          </h2>
          <ol className="mt-2 divide-y divide-border border-y border-border">
            {readable.contacts.map((contact, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the order is the plan's and does not change here
              <li key={index} className="py-3">
                <p className="text-lead text-ink">
                  {contact.name}
                  {contact.outOfArea ? <span className="text-body text-ink-muted"> (out of area)</span> : null}
                </p>
                {contact.note ? <p className="text-body text-ink-muted">{contact.note}</p> : null}
                {contact.missing ? (
                  <p className="text-body text-warning">No longer in Contacts: no number to call.</p>
                ) : contact.numbers.length === 0 ? (
                  <p className="text-body text-ink-muted">No number given.</p>
                ) : (
                  contact.numbers.map((number) => (
                    <div key={number.value} className="flex flex-wrap items-baseline gap-x-3">
                      <Dial number={number} label={contact.name} />
                      <span className="text-small text-ink-muted">{number.label}</span>
                    </div>
                  ))
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      {readable.places.length > 0 ? (
        <section className="mt-8" aria-labelledby="where-to-meet">
          <h2 id="where-to-meet" className="text-heading font-semibold text-ink">
            Where to meet
          </h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {readable.places.map((place, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above
              <li key={index} className="py-3">
                <p className="text-body text-ink-muted">{place.role}</p>
                {place.mapPath ? (
                  <Link
                    to={place.mapPath}
                    className="inline-flex min-h-12 items-center gap-2 text-heading font-semibold text-primary underline-offset-4 hover:underline"
                  >
                    <MapPin aria-hidden className="size-5" /> {place.name}
                  </Link>
                ) : (
                  <p className="text-heading font-semibold text-ink">{place.name}</p>
                )}
                {place.missing ? <p className="text-body text-warning">No longer on the map.</p> : null}
                {place.note ? <p className="text-body text-ink">{place.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-small text-ink-muted">{planCaveat(plan.emergencyNumber)}</p>
      {readable.attributions.map((line) => (
        <p key={line} className="mt-1 text-micro text-ink-muted">
          {line}
        </p>
      ))}
      <div className="mt-4">
        <Button size="lg" onClick={() => setResetting(true)} disabled={plan.use.startedAt === null && done === 0}>
          <RotateCcw aria-hidden /> Reset for next time
        </Button>
      </div>
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
