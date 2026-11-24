/**
 * What "Use now" shows of a plan, in large type: the emergency number, then what to do now
 * (the During steps), who to call, where to meet, where things are, what to do if the phones
 * fail, each person's own line and the notes; the After steps; and the Before steps last,
 * folded, since by now they are done or too late. Drawn the same from the server's answer
 * (`use-page.tsx`) and from the copy kept on a phone (`features/kept/kept-plan-screen.tsx`);
 * each says where its ticks go.
 */
import { type EmergencyPlan, type PlanPhase, type PlanResolved, planCaveat } from "@outpost/shared";
import { Check, ChevronRight, MapPin, Phone } from "lucide-react";
import { type ReactNode, useMemo } from "react";
import { Link } from "react-router";
import { JumpLinks } from "@/components/page";
import { formatTimeOfDay } from "@/lib/clock";
import { cn, formatDate, plural } from "@/lib/utils";
import { type Readable, type ReadNumber, readableOf } from "./printable";

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

/** The order "Use now" shows a plan's phases in: what to do now first; what was for beforehand last, folded. */
const NOW_FIRST: PlanPhase[] = ["during", "after"];

export function PlanInUse({
  plan,
  resolved,
  ticks,
  onTick,
  head,
  foot,
  editTo,
}: {
  plan: EmergencyPlan;
  resolved: PlanResolved;
  ticks: Record<string, number>;
  onTick: (stepId: string, done: boolean) => void;
  /** Above the emergency number: the back link, the title, the line about the plan's state and anything else. */
  head: ReactNode;
  /** After the caveat. */
  foot?: ReactNode;
  /** Where the plan is changed, for "add your local number"; none on a copy kept on a phone. */
  editTo?: string;
}) {
  const readable = useMemo(() => readableOf(plan, resolved), [plan, resolved]);
  const emergency: ReadNumber = {
    label: "emergency services",
    value: plan.emergencyNumber,
    dial: plan.emergencyNumber.replace(/[^\d+*#]/g, "") || null,
  };
  const people = readable.people.filter((person) => person.name && (person.remember.trim() || person.medical.trim()));
  const notes = plan.body.notes.trim();
  const before = readable.steps.filter((step) => step.phase === "before");
  const beforeDone = before.filter((step) => ticks[step.id] !== undefined).length;
  const phaseSteps = (phase: PlanPhase) => readable.steps.filter((step) => step.phase === phase);
  const jumps = [
    phaseSteps("during").length > 0 ? { id: "phase-during", label: "What to do now" } : null,
    readable.contacts.length > 0 ? { id: "who-to-call", label: "Who to call" } : null,
    readable.places.length > 0 ? { id: "where-to-meet", label: "Where to meet" } : null,
    readable.where.length > 0 ? { id: "where-things-are", label: "Where things are" } : null,
    readable.comms.length > 0 ? { id: "if-phones-fail", label: "If the phones fail" } : null,
  ].filter((item): item is { id: string; label: string } => item !== null);

  const stepList = (steps: Readable["steps"]) => (
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
                <span className={cn("block text-lead wrap-anywhere", checked ? "text-ink-muted line-through decoration-1" : "text-ink")}>
                  <span className="tabular">{index + 1}.</span> {step.text}
                </span>
                {checked ? <span className="block text-small text-ink-muted">Done at {formatTimeOfDay(at)}</span> : null}
              </span>
            </label>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      {head}
      <section aria-label="Emergency services" className="mt-6 border-y border-border py-4">
        <p className="text-body text-ink">Emergency services</p>
        {plan.emergencyNumber.trim() ? (
          <Dial number={emergency} label="the emergency services" big />
        ) : (
          <p className="mt-1 text-lead text-warning">
            Not given in this plan.{" "}
            {editTo ? (
              <Link to={`${editTo}#plan-what`} className="text-primary underline underline-offset-4">
                Add your local number
              </Link>
            ) : (
              "Add your local number to the plan."
            )}
          </p>
        )}
      </section>
      {jumps.length > 1 ? <JumpLinks label="In this plan" items={jumps} className="mt-4 mb-0" /> : null}

      {NOW_FIRST.map((phase) => {
        const steps = phaseSteps(phase);
        if (steps.length === 0) return null;
        return (
          <section key={phase} className="mt-8" aria-labelledby={`phase-${phase}`}>
            <h2 id={`phase-${phase}`} className="scroll-mt-20 text-heading font-semibold text-ink">
              {phase === "during" ? "What to do now" : "Afterwards"}
            </h2>
            {stepList(steps)}
          </section>
        );
      })}

      {readable.contacts.length > 0 ? (
        <section className="mt-8" aria-labelledby="who-to-call">
          <h2 id="who-to-call" className="scroll-mt-20 text-heading font-semibold text-ink">
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
          <h2 id="where-to-meet" className="scroll-mt-20 text-heading font-semibold text-ink">
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

      {readable.where.length > 0 ? (
        <section className="mt-8" aria-labelledby="where-things-are">
          <h2 id="where-things-are" className="scroll-mt-20 text-heading font-semibold text-ink">
            Where things are
          </h2>
          <dl className="mt-2 divide-y divide-border border-y border-border">
            {readable.where.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above
              <div key={index} className="py-3">
                <dt className="text-body text-ink-muted">{item.what}</dt>
                <dd className="text-lead text-ink">{item.where || <span className="text-ink-muted">Not written down yet.</span>}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}

      {readable.comms.length > 0 ? (
        <section className="mt-8" aria-labelledby="if-phones-fail">
          <h2 id="if-phones-fail" className="scroll-mt-20 text-heading font-semibold text-ink">
            If the phones fail
          </h2>
          <div className="mt-2 border-y border-border py-3">
            {readable.comms.map((line) => (
              <p key={line} className="whitespace-pre-line text-lead text-ink">
                {line}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {people.length > 0 ? (
        <section className="mt-8" aria-labelledby="each-person">
          <h2 id="each-person" className="text-heading font-semibold text-ink">
            Each person
          </h2>
          <ul className="mt-2 divide-y divide-border border-y border-border">
            {people.map((person, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: as above
              <li key={index} className="py-3">
                <p className="text-lead font-semibold text-ink">{person.name}</p>
                {person.remember.trim() ? <p className="text-lead text-ink">{person.remember}</p> : null}
                {person.medical.trim() ? <p className="text-body text-ink-muted">Medical: {person.medical}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {notes ? (
        <section className="mt-8" aria-labelledby="plan-notes">
          <h2 id="plan-notes" className="text-heading font-semibold text-ink">
            Notes
          </h2>
          <p className="mt-2 whitespace-pre-line border-y border-border py-3 text-lead text-ink">{notes}</p>
        </section>
      ) : null}

      {before.length > 0 ? (
        <section className="mt-8" aria-labelledby="phase-before">
          <details className="group">
            <summary className="flex min-h-12 cursor-default flex-wrap items-center gap-x-2 py-2 marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
              <ChevronRight aria-hidden className="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-90" />
              <h2 id="phase-before" className="text-heading font-semibold text-ink">
                Before: things to have done ahead
              </h2>
              <span className="text-body text-ink-muted tabular">
                {beforeDone} of {before.length} done
              </span>
            </summary>
            {stepList(before)}
          </details>
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
