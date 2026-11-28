/**
 * A plan to read, with nothing on the screen that changes it: for someone in the household
 * who wants to go through the whole plan, in order, without the form. Everything is as the
 * plan reads in an emergency (`printable.ts`): the number to call, the steps for before,
 * during and after, who to call, where to meet, each person's line, where things are, if the
 * phones fail, what to take and the notes. "Change the plan" and "Use now" lead on.
 */
import { PLAN_PHASES, planCaveat } from "@outpost/shared";
import { ListChecks, Pencil, Phone } from "lucide-react";
import { type ReactNode, useEffect, useMemo } from "react";
import { Link, useParams } from "react-router";
import { ErrorState, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/misc";
import { timeAgo } from "@/lib/utils";
import { usePlan, usePlanAction } from "./data";
import { PlanHouseholdLine } from "./household-line";
import { type ReadNumber, readableOf } from "./printable";

function Dial({ number }: { number: ReadNumber }) {
  return number.dial ? (
    <a
      href={`tel:${number.dial}`}
      className="tabular inline-flex min-h-11 items-center gap-1.5 text-primary underline-offset-4 hover:underline"
    >
      <Phone aria-hidden className="size-4" />
      {number.value}
    </a>
  ) : (
    <span className="tabular">{number.value}</span>
  );
}

/** A line of the plan with words under it, quieter. */
function Line({ title, children }: { title: ReactNode; children?: ReactNode }) {
  return (
    <li className="py-2.5">
      <span className="block text-body text-ink">{title}</span>
      {children ? <span className="block text-small text-ink-muted">{children}</span> : null}
    </li>
  );
}

export default function ReadPlanPage() {
  const { id = "" } = useParams();
  const response = usePlan(id);
  const opened = usePlanAction(id, "opened");
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
  if (response.isError || !response.data || !readable) {
    return (
      <Page width="reading">
        <PageHeader back={{ to: "/prepare/plans", label: "Emergency plans" }} title="Emergency plan" />
        <ErrorState error={response.error} onRetry={() => void response.refetch()} />
      </Page>
    );
  }
  const { plan } = response.data;
  const notes = plan.body.notes.trim();
  const people = readable.people.filter((person) => person.name || person.remember.trim() || person.medical.trim());
  const nothing =
    readable.steps.length === 0 &&
    readable.contacts.length === 0 &&
    readable.places.length === 0 &&
    people.length === 0 &&
    readable.where.length === 0 &&
    readable.comms.length === 0 &&
    readable.supplies.length === 0 &&
    !notes;

  return (
    <Page width="reading">
      <PageHeader
        back={{ to: "/prepare/plans", label: "Emergency plans" }}
        title={plan.name}
        description={
          <>
            <span className="block">{readable.kind}. To read: nothing here changes the plan.</span>
            <span className="mt-1 block text-small">Changed {timeAgo(plan.updatedAt)}.</span>
          </>
        }
        actions={
          <>
            <Button asChild variant="primary">
              <Link to={`/prepare/plans/${id}/use`}>
                <ListChecks aria-hidden /> Use now
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/prepare/plans/${id}`}>
                <Pencil aria-hidden /> Change the plan
              </Link>
            </Button>
          </>
        }
      />
      <PlanHouseholdLine household={response.data.household} className="-mt-6 mb-6" />

      <Section title="In an emergency, call">
        <p className="text-heading font-semibold text-ink">
          {readable.emergencyNumber.trim() ? (
            <Dial
              number={{
                label: "emergency services",
                value: readable.emergencyNumber,
                dial: readable.emergencyNumber.replace(/[^\d+*#]/g, "") || null,
              }}
            />
          ) : (
            "Not given yet"
          )}
        </p>
        <p className="mt-1 max-w-[65ch] text-small text-ink-muted">{planCaveat(plan.emergencyNumber)}</p>
      </Section>

      {nothing ? (
        <p className="mt-10 text-body text-ink-muted">This plan has nothing in it yet. Change the plan to add its steps.</p>
      ) : null}

      {PLAN_PHASES.map((phase) => {
        const steps = readable.steps.filter((step) => step.phase === phase.id);
        if (steps.length === 0) return null;
        return (
          <Section key={phase.id} title={phase.label}>
            <ol className="list-decimal space-y-1.5 pl-6 text-body text-ink">
              {steps.map((step) => (
                <li key={step.id}>{step.text}</li>
              ))}
            </ol>
          </Section>
        );
      })}

      {readable.contacts.length > 0 ? (
        <Section title="Who to call, in this order">
          <Rows>
            {readable.contacts.map((contact, index) => (
              <Line
                // biome-ignore lint/suspicious/noArrayIndexKey: the plan's order is the key; two contacts may share a name.
                key={index}
                title={
                  <>
                    {contact.name}
                    {contact.outOfArea ? <span className="text-ink-muted"> (out of area)</span> : null}
                  </>
                }
              >
                {contact.missing ? (
                  "No longer in Contacts"
                ) : (
                  <span className="flex flex-wrap gap-x-4">
                    {contact.numbers.map((number) => (
                      <span key={`${number.label}${number.value}`}>
                        {number.label}: <Dial number={number} />
                      </span>
                    ))}
                  </span>
                )}
                {contact.note.trim() ? <span className="block">{contact.note.trim()}</span> : null}
              </Line>
            ))}
          </Rows>
        </Section>
      ) : null}

      {readable.places.length > 0 ? (
        <Section title="Where to meet">
          <Rows>
            {readable.places.map((place, index) => (
              <Line
                // biome-ignore lint/suspicious/noArrayIndexKey: the plan's order is the key.
                key={index}
                title={`${place.role ? `${place.role}: ` : ""}${place.name}${place.missing ? " (no longer on the map)" : ""}`}
              >
                {[place.note.trim(), place.coords].filter(Boolean).join(". ")}
                {place.mapPath ? (
                  <>
                    {" "}
                    <Link to={place.mapPath} className="text-primary underline underline-offset-2">
                      On the map
                    </Link>
                  </>
                ) : null}
              </Line>
            ))}
          </Rows>
        </Section>
      ) : null}

      {people.length > 0 ? (
        <Section title="The household">
          <Rows>
            {people.map((person, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the plan's order is the key.
              <Line key={index} title={person.name || "A person with no name"}>
                {[person.remember.trim(), person.medical.trim() ? `Medical: ${person.medical.trim()}` : ""].filter(Boolean).join(". ")}
                {person.numbers.length > 0 ? (
                  <span className="block">
                    <Dial number={person.numbers[0]!} />
                  </span>
                ) : null}
              </Line>
            ))}
          </Rows>
        </Section>
      ) : null}

      {readable.where.length > 0 ? (
        <Section title="Where things are">
          <Rows>
            {readable.where.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the plan's order is the key.
              <Line key={index} title={item.what}>
                {item.where || "Not said yet"}
              </Line>
            ))}
          </Rows>
        </Section>
      ) : null}

      {readable.comms.length > 0 ? (
        <Section title="If the phones fail">
          <div className="space-y-1.5 text-body text-ink">
            {readable.comms.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </Section>
      ) : null}

      {readable.supplies.length > 0 ? (
        <Section title="What to take">
          <Rows>
            {readable.supplies.map((supply, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the plan's order is the key.
              <Line key={index} title={supply.name}>
                {supply.amount}
              </Line>
            ))}
          </Rows>
        </Section>
      ) : null}

      {notes ? (
        <Section title="Notes">
          <p className="whitespace-pre-line text-body text-ink">{notes}</p>
        </Section>
      ) : null}

      {readable.attributions.length > 0 ? (
        <div className="mt-10 space-y-1 text-small text-ink-muted">
          {readable.attributions.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </Page>
  );
}
