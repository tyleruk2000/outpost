/**
 * Power and batteries (Tools): quick calculators that keep nothing, and power plans, a
 * person's own battery systems kept on the server to come back to, copy and compare.
 */
import { MONTHS, type PowerPlan } from "@outpost/shared";
import { ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { plural } from "@/lib/utils";
import { type PlanAnswers, workOut } from "./calc/plan";
import { inputOf, useCreatePowerPlan, usePowerPlans } from "./data";
import { hoursText } from "./document";
import { ColourCodeCalculator, CombineCalculator, DividerCalculator, LedCalculator, OhmCalculator } from "./electronics-calculators";
import {
  BankCalculator,
  type CarriedEnergy,
  GeneratorCalculator,
  RuntimeCalculator,
  SolarCalculator,
  WireCalculator,
} from "./energy-calculators";
import { CalculatorGroup, figure } from "./inputs";

const POWER_CALCULATORS = [
  {
    id: "cable",
    title: "Cable size and voltage drop",
    about: "The voltage a cable loses, and the current one rule allows it.",
    body: WireCalculator,
  },
  { id: "bank", title: "Batteries in series and parallel", about: "The voltage, capacity and energy of a bank.", body: BankCalculator },
  {
    id: "generator",
    title: "Generator fuel",
    about: "Fuel an hour and a day, from your generator's data sheet.",
    body: GeneratorCalculator,
  },
];
const ELECTRONICS_CALCULATORS = [
  { id: "ohm", title: "Ohm's law and power", about: "Volts, amps, ohms and watts from any two.", body: OhmCalculator },
  {
    id: "colour",
    title: "Resistor colour code",
    about: "A resistor's value from its bands, and the bands for a value.",
    body: ColourCodeCalculator,
  },
  { id: "combine", title: "Resistors in series and parallel", about: "The resistance of several together.", body: CombineCalculator },
  { id: "led", title: "LED resistor", about: "The series resistor for one or more LEDs.", body: LedCalculator },
  { id: "divider", title: "Voltage divider", about: "The output of two resistors across a supply.", body: DividerCalculator },
];

function PlanSummary({ answers }: { answers: PlanAnswers }) {
  return (
    <>
      {figure(answers.bank.wattHours, 0)} Wh bank, {figure(answers.dailyUseWh, 0)} Wh a day.{" "}
      {answers.runtimeHours === null ? "No loads yet." : `Runs ${hoursText(answers.runtimeHours)} with no charging.`}
    </>
  );
}

/** The plans side by side: a row for each answer, a column for each plan. */
function Comparison({ plans }: { plans: Array<{ plan: PowerPlan; answers: PlanAnswers }> }) {
  const rows: Array<[string, (answers: PlanAnswers, plan: PowerPlan) => string]> = [
    ["Bank", (a) => `${figure(a.bank.volts, 1)} V, ${figure(a.bank.wattHours, 0)} Wh`],
    ["Used in a day", (a) => `${figure(a.dailyUseWh, 0)} Wh`],
    ["Runs with no charging", (a) => hoursText(a.runtimeHours)],
    ["Days of autonomy", (a) => (a.daysOfAutonomy === null ? "–" : figure(a.daysOfAutonomy, 1))],
    ["Solar", (_, plan) => `${figure(plan.solar.arrayWatts, 0)} W`],
    [
      "Solar to break even",
      (a) =>
        a.breakEvenArrayW === null
          ? "–"
          : Number.isFinite(a.breakEvenArrayW)
            ? `${figure(a.breakEvenArrayW, 0)} W (${MONTHS[a.worstMonth!]!.slice(0, 3)})`
            : "No amount",
    ],
    ["Peak current", (a) => `${figure(a.peak.dischargeA, 1)} A`],
  ];
  return (
    <div className="scroll-quiet overflow-x-auto">
      <table className="tabular w-full min-w-max text-small">
        <caption className="mb-2 text-left text-ink-muted">
          Your plans side by side. Each is an estimate from the figures typed into it.
        </caption>
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="py-1.5 pr-4 font-medium text-ink-muted">
              <span className="sr-only">Answer</span>
            </th>
            {plans.map(({ plan }) => (
              <th key={plan.id} scope="col" className="px-3 py-1.5 font-medium text-ink">
                <Link to={`/tools/power/plans/${plan.id}`} className="text-primary underline underline-offset-2">
                  {plan.name}
                </Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, cell]) => (
            <tr key={label} className="border-b border-border">
              <th scope="row" className="py-1.5 pr-4 text-left font-normal text-ink-muted">
                {label}
              </th>
              {plans.map(({ plan, answers }) => (
                <td key={plan.id} className="px-3 py-1.5 text-ink">
                  {cell(answers, plan)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function PowerPage() {
  const plans = usePowerPlans();
  const create = useCreatePowerPlan();
  const navigate = useNavigate();
  const [name, setName] = useState<string | null>(null);
  const [carried, setCarried] = useState<CarriedEnergy | null>(null);
  const worked = useMemo(() => (plans.data ?? []).map((plan) => ({ plan, answers: workOut(inputOf(plan)) })), [plans.data]);

  const start = (
    <Button variant="primary" onClick={() => setName("")}>
      New power plan
    </Button>
  );
  return (
    <Page width="reading">
      <PageHeader
        title="Power and batteries"
        description="Quick calculators for batteries, solar, cable, generators and small circuits, and power plans: your own battery systems, worked out into how long they run and how much solar they need."
      />

      <Section
        title="Power plans"
        description="Kept on this Outpost, to come back to, copy and compare."
        actions={worked.length > 0 ? start : undefined}
      >
        {plans.isPending ? (
          <div className="grid gap-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : plans.isError ? (
          <ErrorState error={plans.error} onRetry={() => void plans.refetch()} />
        ) : worked.length === 0 ? (
          <EmptyState title="No power plans yet" action={start} compact>
            A plan is a battery bank, what draws from it and what charges it. Outpost works out how long it runs, how much solar it needs in
            the darkest month, and its state of charge hour by hour.
          </EmptyState>
        ) : (
          <>
            <Rows>
              {worked.map(({ plan, answers }) => (
                <li key={plan.id}>
                  <Link
                    to={`/tools/power/plans/${plan.id}`}
                    className="group flex items-center gap-4 py-3.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-lead text-ink group-hover:text-primary">{plan.name}</span>
                      <span className="tabular mt-0.5 block text-small text-ink-muted">
                        {plural(plan.loads.length, "load")}. <PlanSummary answers={answers} />
                      </span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-faint" />
                  </Link>
                </li>
              ))}
            </Rows>
            {worked.length > 1 ? (
              <div className="mt-6">
                <h3 className="mb-2 text-body font-semibold text-ink">Compare</h3>
                <Comparison plans={worked} />
              </div>
            ) : null}
          </>
        )}
      </Section>

      <Section title="Batteries, solar and power" description="Nothing typed into these is kept.">
        <Rows>
          <CalculatorGroup
            id="calc-runtime"
            title="Battery runtime"
            about="How long a battery runs your things: a Raspberry Pi, phones to charge, a radio. Or one load in watts."
          >
            <RuntimeCalculator
              onSolar={(dailyWh) => {
                setCarried({ dailyWh, at: Date.now() });
                const solar = document.getElementById("calc-solar") as HTMLDetailsElement | null;
                if (solar) {
                  solar.open = true;
                  solar.scrollIntoView?.({ block: "start", behavior: "smooth" });
                }
              }}
            />
          </CalculatorGroup>
          <CalculatorGroup
            id="calc-solar"
            title="Solar output and charging"
            about="What panels make in a day, and how long they take to refill a battery."
          >
            <SolarCalculator carried={carried} />
          </CalculatorGroup>
          {POWER_CALCULATORS.map((item) => (
            <CalculatorGroup key={item.id} id={`calc-${item.id}`} title={item.title} about={item.about}>
              <item.body />
            </CalculatorGroup>
          ))}
        </Rows>
      </Section>

      <Section title="Electronics" description="Nothing typed into these is kept.">
        <Rows>
          {ELECTRONICS_CALCULATORS.map((item) => (
            <CalculatorGroup key={item.id} id={`calc-${item.id}`} title={item.title} about={item.about}>
              <item.body />
            </CalculatorGroup>
          ))}
        </Rows>
      </Section>

      <p className="mt-8 max-w-[70ch] text-small text-ink-muted">
        Electricity can hurt people and start fires. The figures here are estimates and general information; current limits come from a
        named rule or from the maker's data you type in, and none of it replaces the wiring regulations or a qualified electrician.
      </p>

      {name !== null ? (
        <Dialog open onOpenChange={(open) => !open && setName(null)}>
          <DialogContent title="New power plan" description="Give it a name. The battery, loads and charging are added on the next screen.">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!name.trim()) return;
                create.mutate(name.trim(), { onSuccess: (plan) => navigate(`/tools/power/plans/${plan.id}`) });
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
                      placeholder="Shack in a power cut"
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
    </Page>
  );
}
