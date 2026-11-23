/**
 * Getting ready, on the Preparedness page: the five things that make a household ready, in the
 * order each needs the one before (the people count towards how long supplies last; home gives
 * the plan and the book their places), each ticked from what Outpost already holds and each a
 * link straight to where it is done. The first not yet done is marked Next.
 *
 * Read from the queries the screens themselves use, so a change anywhere refreshes it through
 * the live events. Nothing here is a new store of progress.
 */
import { Check, ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { Rows } from "@/components/page";
import { Badge, Skeleton } from "@/components/ui/misc";
import { usePlans } from "@/features/emergency-plans/data";
import { useBook } from "@/features/household-book/data";
import { HOUSEHOLDS_PATH } from "@/features/households/for-household";
import { useHousehold } from "@/features/households/use-household";
import { peopleWords } from "@/features/households/words";
import { useSupplies } from "@/features/supplies/data";
import { cn, plural } from "@/lib/utils";

export interface ReadyStep {
  id: "people" | "home" | "supplies" | "plan" | "book";
  title: string;
  /** What to do, while it is not done; what there is, once it is. */
  text: string;
  to: string;
  done: boolean;
}

/** The five steps for the current household, in order, from what is held. Exported for its test. */
export function readySteps(input: {
  householdId: string;
  householdName: string;
  people: number;
  home: string | null;
  items: number;
  plans: number;
  bookMade: boolean;
}): ReadyStep[] {
  const page = `${HOUSEHOLDS_PATH}/${input.householdId}`;
  return [
    {
      id: "people",
      title: "Who lives here",
      text:
        input.people > 0
          ? `${peopleWords(input.people)} in ${input.householdName}.`
          : `Add the people and pets of ${input.householdName}: supplies are counted in days for them.`,
      to: `${page}#people`,
      done: input.people > 0,
    },
    {
      id: "home",
      title: "Where home is",
      text: input.home ? `Marked as ${input.home}.` : "Mark it on the map: warnings, weather, meeting places and the book start from it.",
      to: `${page}#place`,
      done: input.home !== null,
    },
    {
      id: "supplies",
      title: "Supplies",
      text:
        input.items > 0
          ? `${plural(input.items, "thing", "things")} kept.`
          : "Add the food, water and kit you keep, or scan their barcodes.",
      to: "/prepare/supplies",
      done: input.items > 0,
    },
    {
      id: "plan",
      title: "An emergency plan",
      text:
        input.plans > 0
          ? `${plural(input.plans, "plan", "plans")}.`
          : "What to do in a power cut, a flood or with no phone, started from official guidance.",
      to: "/prepare/plans",
      done: input.plans > 0,
    },
    {
      id: "book",
      title: "The household book",
      text: input.bookMade ? "Made. Make it again when things change." : "Everything above on paper, from a few questions, ready to print.",
      to: "/prepare/book",
      done: input.bookMade,
    },
  ];
}

export function GettingReady() {
  const { data: current, isPending: householdPending } = useHousehold();
  const supplies = useSupplies();
  const plans = usePlans();
  const book = useBook();
  const pending = householdPending || supplies.isPending || plans.isPending || book.isPending;

  const steps =
    current && !pending
      ? readySteps({
          householdId: current.household.id,
          householdName: current.household.name,
          people: current.household.personIds.length,
          home: current.home?.name ?? null,
          items: supplies.data?.items.length ?? 0,
          plans: plans.data?.length ?? 0,
          bookMade: Boolean(book.data?.made),
        })
      : null;
  const next = steps?.find((step) => !step.done);
  const doneCount = steps?.filter((step) => step.done).length ?? 0;

  return (
    <section aria-labelledby="getting-ready" className="mb-10">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="getting-ready" className="text-lead font-semibold text-ink">
          Getting ready
        </h2>
        {steps ? (
          <p className="tabular text-small text-ink-muted">
            {doneCount} of {steps.length} done
          </p>
        ) : null}
      </div>
      <p className="mb-3 max-w-[60ch] text-small text-ink-muted">
        {next
          ? "Five steps, in this order: each uses what the one before it holds."
          : "Your household is ready. Keep it so under Routine checks."}
      </p>
      {steps === null ? (
        <div aria-busy className="divide-y divide-border border-y border-border">
          {[0, 1, 2, 3, 4].map((index) => (
            <div key={index} className="flex items-center gap-3 py-3">
              <Skeleton className="size-6 rounded-full" />
              <span className="grid flex-1 gap-1.5">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3.5 w-64 max-w-full" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <Rows aria-label="Steps to get ready">
          {steps.map((step, index) => {
            const isNext = step === next;
            return (
              <li key={step.id}>
                <Link
                  to={step.to}
                  aria-current={isNext ? "step" : undefined}
                  className="group flex min-h-11 items-center gap-3 py-3 transition-colors duration-(--duration-fast) hover:bg-surface"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 shrink-0 place-content-center rounded-full border text-micro font-semibold tabular",
                      step.done
                        ? "border-primary bg-primary text-primary-ink"
                        : isNext
                          ? "border-primary text-primary"
                          : "border-border-strong text-ink-muted",
                    )}
                  >
                    {step.done ? <Check className="size-3.5" strokeWidth={2.5} /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span className={cn("text-body group-hover:text-primary", step.done ? "text-ink-muted" : "text-ink")}>
                        {step.title}
                      </span>
                      {isNext ? <Badge tone="primary">Next</Badge> : null}
                      <span className="sr-only">{step.done ? ", done" : ", not done yet"}</span>
                    </span>
                    <span className="mt-0.5 block text-small text-ink-muted">{step.text}</span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
                </Link>
              </li>
            );
          })}
        </Rows>
      )}
    </section>
  );
}
