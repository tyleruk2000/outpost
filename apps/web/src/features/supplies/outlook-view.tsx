/**
 * How long the supplies last, said in sentences: days of food by energy and days of
 * water for this household, each with what was counted and what was left out; what runs
 * out first; what to use first, in date order; and what is held, by category and by
 * place. Never more exact than the figures behind it: "about", and a tenth of a day at most.
 */
import {
  categoryLabel,
  type DatedRow,
  daysWords,
  type Household,
  type LeftOut,
  localDay,
  type Stretch,
  type SupplyItem,
  supplyOutlook,
} from "@outpost/shared";
import { CircleAlert, Clock } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { Notice, Section } from "@/components/page";
import { Segmented } from "@/components/ui/misc";
import { formatNumber, plural } from "@/lib/utils";
import { EnergyLines } from "./energy-outlook";
import { itemPath } from "./stock-view";
import { amount, dayWords, LEFT_OUT_WORDS, quantityWords, whenWords } from "./words";

const link = "text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2";

function LeftOutList({ rows }: { rows: LeftOut[] }) {
  if (rows.length === 0) return null;
  const shown = rows.slice(0, 12);
  return (
    <>
      {" "}
      Left out:{" "}
      {shown.map((row, index) => (
        <span key={row.id}>
          {index > 0 ? ", " : ""}
          <Link to={itemPath(row.id)} className={link}>
            {row.name}
          </Link>{" "}
          ({LEFT_OUT_WORDS[row.reason]})
        </span>
      ))}
      {rows.length > shown.length ? ` and ${rows.length - shown.length} more` : ""}.
    </>
  );
}

/** "about 2.3 days", with the shortfall against the days wanted. */
function Days({ days, wanted }: { days: number | null; wanted: number }) {
  return (
    <strong className="font-semibold text-ink">
      {daysWords(days)}
      {days !== null && days < wanted ? <span className="font-normal text-ink-muted"> of the {plural(wanted, "day")} wanted</span> : null}
    </strong>
  );
}

function Lost({ stretch, unit }: { stretch: Stretch; unit: string }) {
  if (stretch.lost <= 0) return null;
  return (
    <>
      {" "}
      Eaten in date order, {formatNumber(Math.round(stretch.lost))} {unit} of it reaches its use-by before its turn and is not counted in
      the days.
    </>
  );
}

function DatedList({ rows, empty }: { rows: DatedRow[]; empty: string }) {
  if (rows.length === 0) return <p className="border-y border-border py-4 text-body text-ink-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-border border-y border-border">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2.5">
          <span className="min-w-0">
            <Link to={itemPath(row.id)} className="text-body font-medium text-ink hover:text-primary">
              {row.name}
            </Link>
            <span className="block text-small text-ink-muted">
              <span className="tabular">{quantityWords(row.quantity, row.unit)}</span>
              {row.location ? ` · ${row.location}` : ""} · {categoryLabel(row.category)}
            </span>
          </span>
          <span className="tabular text-small text-ink">
            {row.dateKind === "use-by" ? "Use by" : "Best before"} {dayWords(row.date)},{" "}
            <span className="text-ink-muted">{whenWords(row.daysLeft)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function OutlookView({ items, household, onHousehold }: { items: SupplyItem[]; household: Household; onHousehold: () => void }) {
  const today = localDay();
  const outlook = useMemo(() => supplyOutlook(items, household, today), [items, household, today]);
  const [within, setWithin] = useState<"30" | "90" | "180">("90");
  const nobody = outlook.people === 0 && outlook.pets === 0;
  const { food, water } = outlook;
  const waterBasis = water.basis === "all" ? "for drinking, cooking and washing" : "to drink";

  return (
    <div>
      <Section
        title="How long it lasts"
        description={`For the household as it is set under Household, from today, ${dayWords(today)}. Planning figures, not dietary advice.`}
      >
        {nobody ? (
          <Notice
            title="Say who the supplies are for"
            action={
              <button type="button" onClick={onHousehold} className="min-h-11 shrink-0 font-medium underline underline-offset-2">
                Household
              </button>
            }
          >
            The days are worked out for the people (and pets) in the household. None are set yet.
          </Notice>
        ) : (
          <div className="grid gap-4 text-body text-ink-muted">
            {outlook.runsOutFirst ? (
              <p className="text-lead text-ink">
                {outlook.runsOutFirst.what === "food" ? "Food" : "Water"} runs out first, in {daysWords(outlook.runsOutFirst.days)}.{" "}
                {outlook.runsOutFirst.days >= outlook.daysWanted
                  ? `That covers the ${plural(outlook.daysWanted, "day")} wanted.`
                  : `You want ${plural(outlook.daysWanted, "day")}: the shopping list says what would close the gap.`}
              </p>
            ) : null}
            <EnergyLines outlook={outlook} household={household} items={items}>
              <Lost stretch={food} unit="kcal" />
              <LeftOutList rows={food.leftOut.filter((row) => row.reason !== "no-energy")} />
              {outlook.peopleWithoutFigure.length > 0
                ? ` ${outlook.peopleWithoutFigure.join(", ")} ${outlook.peopleWithoutFigure.length === 1 ? "has" : "have"} no energy figure and ${outlook.peopleWithoutFigure.length === 1 ? "is" : "are"} not in the daily need: give one under Household.`
                : ""}
            </EnergyLines>
            <p>
              <span className="text-ink">Water {waterBasis}:</span> <Days days={water.days} wanted={outlook.daysWanted} />. Counted{" "}
              {amount(water.counted)} litres in {plural(water.items, "row")} against {amount(water.perDay)} litres a day.
              {water.basis === "all"
                ? ` To drink alone, at ${amount(water.drinkingPerDay)} litres a day: ${daysWords(water.daysDrinking)}.`
                : ` For drinking, cooking and washing as well, at ${amount(water.allUsesPerDay)} litres a day: ${daysWords(water.daysAllUses)}.`}
              <LeftOutList rows={water.leftOut} />
            </p>
            {outlook.petFood ? (
              <p>
                <span className="text-ink">Pet food:</span> <Days days={outlook.petFood.days} wanted={outlook.daysWanted} />, at the{" "}
                {formatNumber(Math.round(outlook.petFood.perDay))} kcal a day given for the pets.
                <LeftOutList rows={outlook.petFood.leftOut} />
              </p>
            ) : null}
            <details className="text-small">
              <summary className="cursor-pointer text-ink select-none">How this is worked out</summary>
              <ul className="mt-2 grid list-disc gap-1.5 pl-5">
                <li>
                  Food is counted by energy: each row's kcal (per pack, or per 100 g times the weight) times how many. Rows with no energy
                  given, none left, or past their use-by are left out.
                </li>
                <li>
                  An item's energy per 100 g can come from USDA FoodData Central's table (SR Legacy, April 2018), chosen by name when it is
                  added. Those are averages for a kind of food, not your packet's figure: the label's figure, typed in, always wins.
                </li>
                <li>
                  It is eaten in date order: what reaches its use-by first is eaten first, and what would reach its use-by before its turn
                  is lost. A best before date does not stop food being counted: it is about quality, not safety (GOV.UK, Best before and
                  use-by dates, June 2026).
                </li>
                <li>
                  The daily need is the sum of each person's energy figure (Public Health England, Government Dietary Recommendations, 2016)
                  or the figure you gave, and each person's water: 3 litres to drink (UK government, Be ready) or 7.5 litres for drinking,
                  cooking and washing (the low end of WHO's 7.5 to 15, technical note 9), unless you gave another. Pets count only with
                  figures you give.
                </li>
                <li>
                  Days are rounded down, to a tenth under ten days and to whole days above. Hot weather, illness, hard work, pregnancy and
                  breastfeeding all raise the need; FEMA says water needs can double in very hot weather.
                </li>
              </ul>
            </details>
          </div>
        )}
      </Section>

      <Section title="Use first" description="Dated rows with some left, the soonest first.">
        {outlook.expired.length > 0 ? (
          <div className="mb-6">
            <h3 className="mb-2 flex items-center gap-1.5 text-body font-semibold text-danger">
              <CircleAlert aria-hidden className="size-4" />
              Past its use-by: do not eat, throw away or replace
            </h3>
            <DatedList rows={outlook.expired} empty="" />
          </div>
        ) : null}
        {outlook.pastBestBefore.length > 0 ? (
          <div className="mb-6">
            <h3 className="mb-2 flex items-center gap-1.5 text-body font-semibold text-warning">
              <Clock aria-hidden className="size-4" />
              Past best before: check it, and eat it first
            </h3>
            <DatedList rows={outlook.pastBestBefore} empty="" />
          </div>
        ) : null}
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-body font-semibold text-ink">Dated in the next</h3>
          <Segmented<"30" | "90" | "180">
            label="Dated within"
            value={within}
            onChange={setWithin}
            options={[
              { value: "30", label: "30 days" },
              { value: "90", label: "90 days" },
              { value: "180", label: "180 days" },
            ]}
          />
        </div>
        <DatedList rows={outlook.within[Number(within) as 30 | 90 | 180]} empty={`Nothing is dated in the next ${within} days.`} />
      </Section>

      <Section title="What is held">
        <div className="grid gap-8 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-body font-semibold text-ink">By category</h3>
            <ul className="divide-y divide-border border-y border-border">
              {outlook.byCategory.map((row) => (
                <li key={row.category} className="flex items-baseline justify-between gap-4 py-2 text-body">
                  <span className="text-ink">{categoryLabel(row.category)}</span>
                  <span className="tabular text-small text-ink-muted">
                    {plural(row.rows, "row")}
                    {row.kcal > 0 ? `, ${formatNumber(Math.round(row.kcal))} kcal` : ""}
                    {row.litres > 0 ? `, ${amount(row.litres)} litres` : ""}
                  </span>
                </li>
              ))}
              {outlook.byCategory.length === 0 ? <li className="py-2 text-body text-ink-muted">Nothing with any left.</li> : null}
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-body font-semibold text-ink">By place</h3>
            <ul className="divide-y divide-border border-y border-border">
              {outlook.byLocation.map((row) => (
                <li key={row.location} className="flex items-baseline justify-between gap-4 py-2 text-body">
                  <span className={row.location ? "text-ink" : "text-ink-muted"}>{row.location || "No place given"}</span>
                  <span className="tabular text-small text-ink-muted">
                    {plural(row.rows, "row")}: {row.categories.map((id) => categoryLabel(id).toLowerCase()).join(", ")}
                  </span>
                </li>
              ))}
              {outlook.byLocation.length === 0 ? <li className="py-2 text-body text-ink-muted">Nothing with any left.</li> : null}
            </ul>
          </div>
        </div>
      </Section>
    </div>
  );
}
