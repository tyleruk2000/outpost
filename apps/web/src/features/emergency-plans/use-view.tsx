/**
 * What "Use now" shows of a plan: the emergency number, the steps to tick, who to call
 * and where to meet, in large type. Drawn the same from the server's answer
 * (`use-page.tsx`) and from the copy kept on a phone (`features/kept/kept-plan-screen.tsx`);
 * each says where its ticks go.
 */
import { type EmergencyPlan, PLAN_PHASES, type PlanResolved, planCaveat } from "@outpost/shared";
import { Check, MapPin, Phone } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { formatTimeOfDay } from "@/lib/clock";
import { cn, formatDate, plural } from "@/lib/utils";
import { type ReadNumber, readableOf } from "./printable";

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

/** How many of the plan's steps are ticked, and the line that says so. */
export function stateLine(plan: EmergencyPlan, ticks: Record<string, number>, startedAt: number | null): string {
  const steps = plan.body.steps.length;
  const done = plan.body.steps.filter((step) => ticks[step.id] !== undefined).length;
  return startedAt !== null
    ? `In use since ${formatDate(startedAt)}, ${formatTimeOfDay(startedAt)}. ${done} of ${plural(steps, "step")} done.`
    : `${plural(steps, "step")}. Not in use.`;
}

export function PlanInUse({
  plan,
  resolved,
  ticks,
  onTick,
  head,
  foot,
}: {
  plan: EmergencyPlan;
  resolved: PlanResolved;
  ticks: Record<string, number>;
  onTick: (stepId: string, done: boolean) => void;
  /** Above the emergency number: the back link, the title, the line about the plan's state and anything else. */
  head: ReactNode;
  /** After the caveat. */
  foot?: ReactNode;
}) {
  const readable = useMemo(() => readableOf(plan, resolved), [plan, resolved]);
  const emergency: ReadNumber = {
    label: "emergency services",
    value: plan.emergencyNumber,
    dial: plan.emergencyNumber.replace(/[^\d+*#]/g, "") || null,
  };
  return (
    <>
      {head}
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
                        onChange={(event) => onTick(step.id, event.target.checked)}
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
                        {/* A step may hold an address (a web page to read), which must wrap on a small phone. */}
                        <span
                          className={cn("block text-lead wrap-anywhere", checked ? "text-ink-muted line-through decoration-1" : "text-ink")}
                        >
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
      {foot}
    </>
  );
}
