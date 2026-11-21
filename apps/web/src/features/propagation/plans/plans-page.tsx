/** Communication plans: the list of them, and starting a new one. */
import { modeById, planHours, utcLabel } from "@outpost/shared";
import { ChevronRight } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { LicenceLine } from "@/features/radio/licence";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { useCreatePlan, usePlans } from "./data";

export default function PlansPage() {
  const plans = usePlans();
  const create = useCreatePlan();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);

  const start = (
    <Button variant="primary" onClick={() => setName("")}>
      New plan
    </Button>
  );
  return (
    <Page width="reading">
      <PageHeader
        title="Communication plans"
        description="Several stations, and for each pair of them which band is predicted to serve at which hour. Worked out by VOACAP from monthly medians, and written out to print and carry."
        actions={plans.data && plans.data.length > 0 ? start : undefined}
      />
      <LicenceLine use="listen-and-transmit" className="mb-6" />
      {plans.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : plans.isError ? (
        <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
      ) : plans.data.length === 0 ? (
        <EmptyState title="No communication plans yet" action={start}>
          A plan names the places you need to reach each other from (home, a shelter, a relative's house) and the equipment at each. Outpost
          then asks the engine about every pair, both ways.
        </EmptyState>
      ) : (
        <Rows className="border-y border-border">
          {plans.data.map((plan) => (
            <li key={plan.id}>
              <Link
                to={`/radio/plans/${plan.id}`}
                className="group flex items-center gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-lead text-ink group-hover:text-primary">{plan.name}</span>
                  <span className="tabular mt-0.5 block text-small text-ink-muted">
                    {plural(plan.stations.length, "station")}, {plural(planHours(plan.fromUtc, plan.toUtc).length, "hour")} from{" "}
                    {utcLabel(plan.fromUtc)} to {utcLabel(plan.toUtc)} UTC, {modeById(plan.mode).label}, for {plan.date}.{" "}
                    {plan.workedOut ? "Worked out." : "Not worked out as it stands."}
                  </span>
                </span>
                <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
              </Link>
            </li>
          ))}
        </Rows>
      )}

      {name !== null ? (
        <Dialog open onOpenChange={(open) => !open && setName(null)}>
          <DialogContent title="New plan" description="Give it a name. Stations, hours and bands are added on the next screen.">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return;
                create.mutate(name.trim(), { onSuccess: (plan) => navigate(`/radio/plans/${plan.id}`) });
              }}
            >
              <DialogBody className="grid gap-3">
                <Field label="Name">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      maxLength={120}
                      placeholder="Family net"
                      autoFocus
                    />
                  )}
                </Field>
                {create.isError ? <Notice tone="danger">{errorMessage(create.error)}</Notice> : null}
              </DialogBody>
              <DialogFooter>
                <Button onClick={() => setName(null)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={create.isPending} disabled={!name.trim()}>
                  Create plan
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      ) : null}
      <p className="mt-6 text-small text-ink-muted">
        Nothing here says which frequencies you may transmit on. That is set by each operator's licence; the band sheets in the library give
        the limits.
      </p>
    </Page>
  );
}
