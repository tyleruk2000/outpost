/**
 * The supplies a plan needs, set beside what the Supplies inventory holds: days of food
 * and water held (from `GET /api/supplies/outlook`) against the days this plan wants,
 * and each thing listed as in stock, low, missing, or held only in another unit. The
 * missing and low ones go on the supplies shopping list with one press.
 */
import {
  compareSupplies,
  daysWords,
  type HeldRow,
  localDay,
  type PlanSupply,
  pastUseBy,
  SUPPLY_CATEGORIES,
  type SupplyCategory,
  type SupplyCheck,
  templateById,
} from "@outpost/shared";
import { CircleAlert, CircleCheck, CircleHelp, CircleMinus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { localId, plural } from "@/lib/utils";
import { useAddToShopping, useOutlook, useSupplies } from "./data";
import { move, RowTools, removeAt, replaceAt } from "./list-edit";
import { amountText } from "./printable";
import { SourceLine } from "./steps-section";

const ANY = "any";

const STANDING_WORDS: Record<SupplyCheck["standing"], { label: string; icon: typeof CircleCheck; tone: string }> = {
  "in-stock": { label: "In stock", icon: CircleCheck, tone: "text-success" },
  low: { label: "Low", icon: CircleMinus, tone: "text-warning" },
  missing: { label: "Missing", icon: CircleAlert, tone: "text-danger" },
  check: { label: "Check", icon: CircleHelp, tone: "text-ink-muted" },
};

export function checkWords(check: SupplyCheck): string {
  const held = amountText(check.held, check.unit);
  switch (check.standing) {
    case "in-stock":
      return check.needed === null ? `${plural(check.rows, "row")} in Supplies` : `${held} held of ${amountText(check.needed, check.unit)}`;
    case "low":
      return `${held} held of ${amountText(check.needed, check.unit)}`;
    case "missing":
      return check.needed === null ? "None in Supplies" : `None of ${amountText(check.needed, check.unit)} in Supplies`;
    case "check":
      return `Held in ${check.otherUnits.join(", ")}: compare by hand`;
  }
}

/** Days held against days wanted, for food and for water. */
export function DaysHeld({ days }: { days: number | null }) {
  const outlook = useOutlook();
  if (outlook.isPending) return <Skeleton className="h-12" />;
  if (outlook.isError) return <p className="text-small text-danger">The supplies could not be read. {errorMessage(outlook.error)}</p>;
  const { food, water, people, pets } = outlook.data.outlook;
  const line = (what: string, held: number | null) => {
    const enough = days !== null && held !== null && held >= days;
    return (
      <li className="flex flex-wrap items-baseline justify-between gap-x-4 py-2">
        <span className="text-ink">{what}</span>
        <span className="tabular text-small">
          <span className="text-ink">{daysWords(held)}</span>
          {days !== null ? (
            <span className={enough ? "text-success" : "text-warning"}>
              {" "}
              {held === null ? "" : enough ? `, enough for ${plural(days, "day")}` : `, short of ${plural(days, "day")}`}
            </span>
          ) : null}
        </span>
      </li>
    );
  };
  return (
    <div>
      <ul className="divide-y divide-border border-y border-border">
        {line("Food held", food.days)}
        {line("Water held", water.days)}
      </ul>
      <p className="mt-1.5 text-small text-ink-muted">
        As Supplies works it out for its household of {plural(people, "person", "people")}
        {pets > 0 ? ` and ${plural(pets, "pet")}` : ""}.{" "}
        <Link to="/prepare/supplies?view=days" className="text-primary underline underline-offset-2">
          How long the supplies last
        </Link>
      </p>
    </div>
  );
}

export function SuppliesSection({
  supplies,
  days,
  people,
  templateId,
  planName,
  onChange,
}: {
  supplies: PlanSupply[];
  days: number | null;
  people: number;
  templateId: string | null;
  planName: string;
  onChange: (patch: { supplies?: PlanSupply[]; days?: number | null }) => void;
}) {
  const stock = useSupplies();
  const add = useAddToShopping();
  const template = templateById(templateId);
  const [name, setName] = useState("");
  const held: HeldRow[] = useMemo(() => {
    const today = localDay();
    return (stock.data?.items ?? []).map((item) => ({
      name: item.name,
      category: item.category,
      quantity: item.quantity,
      unit: item.unit,
      expired: pastUseBy(item, today),
    }));
  }, [stock.data]);
  const household = Math.max(1, people);
  const checks = useMemo(() => compareSupplies(supplies, held, household, days), [supplies, held, household, days]);
  const toBuy = checks.filter((check) => check.standing === "missing" || check.standing === "low");

  const buy = () =>
    add.mutate(
      toBuy.map((check) => ({ name: check.name, quantity: check.short, unit: check.unit, note: `For the emergency plan “${planName}”` })),
      {
        onSuccess: (lines) => toast.success(`${plural(lines.length, "line")} added to the shopping list.`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  return (
    <Section
      title="Supplies this plan needs"
      description={`For a household of ${plural(household, "person", "people")} (the people in this plan), set beside what Supplies holds now.`}
    >
      <Field
        label="Days the supplies should cover"
        className="max-w-56"
        hint={template?.days ? <SourceLine source={template.days.source} /> : undefined}
      >
        {(ids) => (
          <Input
            {...ids}
            type="number"
            inputMode="numeric"
            min={1}
            max={3650}
            value={days ?? ""}
            onChange={(event) => {
              const value = Number.parseInt(event.target.value, 10);
              onChange({ days: Number.isFinite(value) && value >= 1 ? Math.min(3650, value) : null });
            }}
          />
        )}
      </Field>
      <div className="mt-4">
        <DaysHeld days={days} />
      </div>

      {stock.isError ? (
        <Notice tone="danger" className="mt-4">
          The inventory could not be read, so the list below is not compared with it. {errorMessage(stock.error)}
        </Notice>
      ) : null}
      {supplies.length === 0 ? (
        <p className="mt-4 text-small text-ink-muted">Nothing listed yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-border border-y border-border" aria-label="Supplies this plan needs">
          {supplies.map((supply, index) => {
            const check = checks[index]!;
            const words = STANDING_WORDS[check.standing];
            const from = supply.origin ? template?.supplies.find((each) => each.id === supply.origin) : undefined;
            return (
              <li key={supply.id} className="flex gap-2 py-3">
                <div className="grid min-w-0 flex-1 gap-2">
                  <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_6rem_7rem]">
                    <Input
                      aria-label={`Supply ${index + 1}`}
                      value={supply.name}
                      maxLength={120}
                      onChange={(event) => onChange({ supplies: replaceAt(supplies, index, { ...supply, name: event.target.value }) })}
                    />
                    <Input
                      aria-label={`How many: ${supply.name}`}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={supply.quantity ?? ""}
                      placeholder="How many"
                      onChange={(event) => {
                        const value = Number.parseFloat(event.target.value);
                        onChange({
                          supplies: replaceAt(supplies, index, {
                            ...supply,
                            quantity: Number.isFinite(value) && value >= 0 ? value : null,
                          }),
                        });
                      }}
                    />
                    <Input
                      aria-label={`Unit: ${supply.name}`}
                      value={supply.unit}
                      maxLength={40}
                      placeholder="Unit"
                      onChange={(event) => onChange({ supplies: replaceAt(supplies, index, { ...supply, unit: event.target.value }) })}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-small text-ink">
                    <label htmlFor={`${supply.id}-person`} className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`${supply.id}-person`}
                        checked={supply.perPerson}
                        onCheckedChange={(checked) =>
                          onChange({ supplies: replaceAt(supplies, index, { ...supply, perPerson: checked === true }) })
                        }
                      />
                      Each person
                    </label>
                    <label htmlFor={`${supply.id}-day`} className="flex min-h-11 items-center gap-2">
                      <Checkbox
                        id={`${supply.id}-day`}
                        checked={supply.perDay}
                        onCheckedChange={(checked) =>
                          onChange({ supplies: replaceAt(supplies, index, { ...supply, perDay: checked === true }) })
                        }
                      />
                      Each day
                    </label>
                    <Select<string>
                      aria-label={`Where Supplies keeps it: ${supply.name}`}
                      className="w-auto min-w-40"
                      value={supply.category ?? ANY}
                      onChange={(value) =>
                        onChange({
                          supplies: replaceAt(supplies, index, { ...supply, category: value === ANY ? null : (value as SupplyCategory) }),
                        })
                      }
                      options={[
                        { value: ANY, label: "Any category" },
                        ...SUPPLY_CATEGORIES.map((category) => ({ value: category.id, label: category.label })),
                      ]}
                    />
                  </div>
                  <p className={`flex items-center gap-1.5 text-small ${words.tone}`} data-testid="supply-standing">
                    {stock.isPending ? (
                      <span className="text-ink-muted">Looking in Supplies…</span>
                    ) : stock.isError ? null : (
                      <>
                        <words.icon aria-hidden className="size-4 shrink-0" />
                        <span>
                          <span className="font-medium">{words.label}</span>
                          <span className="text-ink">: {checkWords(check)}</span>
                        </span>
                      </>
                    )}
                  </p>
                  {from ? (
                    <p className="text-small text-ink-muted">
                      From <SourceLine source={from.source} />
                    </p>
                  ) : null}
                </div>
                <RowTools
                  name={supply.name}
                  first={index === 0}
                  last={index === supplies.length - 1}
                  onMove={(by) => onChange({ supplies: move(supplies, index, by) })}
                  onRemove={() => onChange({ supplies: removeAt(supplies, index) })}
                />
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="mt-3 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          onChange({
            supplies: [
              ...supplies,
              { id: localId(), name: name.trim(), quantity: null, unit: "", perPerson: false, perDay: false, category: null, origin: null },
            ],
          });
          setName("");
        }}
      >
        <Field label="Add a supply" className="min-w-0 flex-1 basis-56">
          {(ids) => (
            <Input
              {...ids}
              value={name}
              maxLength={120}
              placeholder="Torch, wind-up radio, spare glasses"
              onChange={(event) => setName(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" disabled={!name.trim()}>
          Add
        </Button>
      </form>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={toBuy.length === 0 || stock.isPending || stock.isError} loading={add.isPending} onClick={buy}>
          {toBuy.length === 0
            ? "Nothing to add to the shopping list"
            : `Add ${plural(toBuy.length, "missing or low thing", "missing or low things")} to the shopping list`}
        </Button>
        <Link to="/prepare/supplies?view=shopping" className="text-small text-primary underline underline-offset-2">
          Open the shopping list
        </Link>
      </div>
      <p className="mt-2 max-w-[65ch] text-small text-ink-muted">
        A thing counts as held when a row in Supplies has every word of what it names (the words before any bracket, comma, “and” or “or”),
        in its category if one is chosen, and in the same unit. Anything past its use-by is not counted.
      </p>
    </Section>
  );
}
