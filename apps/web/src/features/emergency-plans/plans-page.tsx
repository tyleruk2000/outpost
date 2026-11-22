/**
 * Emergency plans (Preparedness): the household's plans, each opened to use in one more
 * press, and starting a new one from a template drawn from official guidance or from
 * blank.
 */
import { type EmergencyPlanSummary, type PlanTemplate, planFromTemplate, planKindLabel, reviewDue, templateById } from "@outpost/shared";
import { ListChecks } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { EmptyState, ErrorState, Joined, Page, PageHeader, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { useHomeCountry } from "@/features/frequencies/home-country";
import { BookPlansLine } from "@/features/household-book/book-line";
import { ForHousehold } from "@/features/households/for-household";
import { useHome } from "@/features/households/home";
import { errorMessage } from "@/lib/api";
import { formatDate, localId, plural } from "@/lib/utils";
import { useCreatePlan, usePlans } from "./data";
import { TemplateLicences, templateSources } from "./licences";
import { HomeWarningLine } from "./warning-line";
import { blankPlan, guessEmergencyNumber, templatesFor, templatesWhereLine } from "./words";

function PlanRow({ plan }: { plan: EmergencyPlanSummary }) {
  const review = reviewDue(plan, Date.now());
  const kind = plan.kindText.trim() || planKindLabel(plan.kind);
  const facts = [
    // "Power cut" under a plan called "Power cut" says nothing.
    kind.toLowerCase() === plan.name.trim().toLowerCase() ? null : kind,
    plan.startedAt !== null
      ? `In use since ${formatDate(plan.startedAt)}, ${plan.ticked} of ${plan.steps} steps done`
      : plural(plan.steps, "step"),
    plan.missing > 0 ? `${plural(plan.missing, "linked contact or place", "linked contacts or places")} missing` : null,
    review.due ? "Due for a look over" : null,
  ];
  return (
    <li className="group relative flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-60">
        <h2 className="font-title text-lead text-ink">
          {/* The link is stretched over the row; "Use now" sits above it. */}
          <Link
            to={`/prepare/plans/${plan.id}`}
            className="decoration-primary decoration-1 underline-offset-[0.22em] after:absolute after:inset-0 group-hover:underline"
          >
            {plan.name}
          </Link>
        </h2>
        <p className="mt-0.5 text-small text-ink-muted">
          <Joined parts={facts} />
        </p>
      </div>
      <Button asChild variant={plan.startedAt !== null ? "primary" : "secondary"} className="relative">
        <Link to={`/prepare/plans/${plan.id}/use`} aria-label={`Use now: ${plan.name}`}>
          <ListChecks aria-hidden /> Use now
        </Link>
      </Button>
    </li>
  );
}

function NewPlanDialog({
  open,
  onOpenChange,
  start,
  fromBook,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** A template to start with chosen: the household book's "Make a plan for this". */
  start?: PlanTemplate | null;
  fromBook?: boolean;
}) {
  const [chosen, setChosen] = useState<PlanTemplate | "blank" | null>(start ?? null);
  const [name, setName] = useState(start?.name ?? "");
  const create = useCreatePlan();
  const navigate = useNavigate();
  const close = (next: boolean) => {
    if (!next) {
      setChosen(null);
      setName("");
      create.reset();
    }
    onOpenChange(next);
  };
  // The current household's country (households D), and its name when there are several.
  const home = useHomeCountry();
  const current = useHome();
  const householdName = current.several && current.household ? current.household.name : null;
  const number = guessEmergencyNumber(undefined, home?.code);
  const whereLine = templatesWhereLine(home, undefined, householdName);
  const make = () => {
    if (!chosen) return;
    const input = chosen === "blank" ? blankPlan(name.trim() || "Our plan", number) : planFromTemplate(chosen, localId, number);
    if (name.trim()) input.name = name.trim();
    create.mutate(input, { onSuccess: (response) => navigate(`/prepare/plans/${response.plan.id}${fromBook ? "?from=book" : ""}`) });
  };
  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        size="lg"
        title="New emergency plan"
        description="Start from a template drawn from official guidance, then change it to fit your household. Every step says where it came from."
      >
        <DialogBody>
          <fieldset>
            <legend className="mb-2 text-small font-medium text-ink">What is it for?</legend>
            <Rows>
              {[...templatesFor(home), "blank" as const].map((template) => {
                const id = template === "blank" ? "blank" : template.id;
                const selected = chosen === template;
                return (
                  <li key={id}>
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 py-2.5">
                      <input
                        type="radio"
                        name="template"
                        className="mt-1 size-4 accent-primary"
                        checked={selected}
                        onChange={() => {
                          // The name follows the choice until the person types one of their own.
                          const previous = chosen && chosen !== "blank" ? chosen.name : "";
                          if (!name.trim() || name === previous) setName(template === "blank" ? "" : template.name);
                          setChosen(template);
                        }}
                      />
                      <span className="min-w-0">
                        <span className="block text-body text-ink">
                          {template === "blank" ? "Something else, from blank" : template.name}
                        </span>
                        <span className="block text-small text-ink-muted">
                          {template === "blank"
                            ? "No steps to start with: write your own. Any kind of event, in your own words."
                            : `${template.about} ${plural(template.steps.length, "step")} to start from.`}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </Rows>
          </fieldset>
          {whereLine ? (
            <p className="mt-4 max-w-[65ch] text-small text-ink" data-testid="templates-where">
              {whereLine}
            </p>
          ) : null}
          <div className="mt-4">
            <TemplateLicences sources={templateSources()} />
          </div>
          <Field label="Name" className="mt-4" hint="You can change everything later.">
            {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />}
          </Field>
          {create.isError ? (
            <p role="alert" className="mt-3 text-small text-danger">
              {errorMessage(create.error)}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => close(false)}>Cancel</Button>
          <Button variant="primary" disabled={!chosen} loading={create.isPending} onClick={make}>
            Make the plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function EmergencyPlansPage() {
  const plans = usePlans();
  // The household book sends a person here to make a plan for a hazard: ?template=flooding&from=book.
  const [params] = useSearchParams();
  const asked = templateById(params.get("template"));
  const fromBook = params.get("from") === "book";
  const [starting, setStarting] = useState(asked !== undefined);
  const start = (
    <Button variant="primary" onClick={() => setStarting(true)}>
      New plan
    </Button>
  );
  return (
    <Page width="reading">
      <PageHeader
        title="Emergency plans"
        description="What your household will do in a power cut, a flood, a storm or when the phones are down: written ahead, read on the day."
        actions={plans.data && plans.data.length > 0 ? start : undefined}
      />
      <ForHousehold className="-mt-6 mb-6" />
      <HomeWarningLine className="mb-4 max-w-[65ch]" />
      {plans.data && plans.data.length > 0 ? <BookPlansLine className="mb-4" /> : null}
      {plans.isPending ? (
        <div className="grid gap-3" aria-busy>
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState title="No emergency plans yet" action={start}>
          Start from a template for a power cut, flooding, no phone or internet, severe weather, sheltering at home or leaving at short
          notice. Each step comes from official guidance and says where.
        </EmptyState>
      ) : (
        <Rows>
          {plans.data.map((plan) => (
            <PlanRow key={plan.id} plan={plan} />
          ))}
        </Rows>
      )}
      <p className="mt-6 max-w-[65ch] text-small text-ink-muted">
        These are your household's own plans, made in advance. In a real emergency, follow the emergency services and official warnings.
      </p>
      <NewPlanDialog open={starting} onOpenChange={setStarting} start={asked ?? null} fromBook={fromBook} />
    </Page>
  );
}
