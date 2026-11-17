/**
 * Days of energy, under "How long it lasts": how many days the food holds for the
 * household, on what daily figure and whose, and the food not counted because it has no
 * energy figure, with one press to go through those items one after another and give
 * each a figure (from the label, or a food chosen from USDA FoodData Central's table).
 * The same sentences as `GET /api/supplies/outlook` gives (energySummary, in
 * @outpost/shared), so that the screen and the API never disagree.
 */
import { energySummary, type Household, type SupplyItem, type SupplyOutlook } from "@outpost/shared";
import { type ReactNode, useMemo, useState } from "react";
import { Link } from "react-router";
import { Button } from "@/components/ui/button";
import { ItemDialog } from "./item-form";
import { itemPath } from "./stock-view";

export function EnergyLines({
  outlook,
  household,
  items,
  children,
}: {
  outlook: SupplyOutlook;
  household: Household;
  items: SupplyItem[];
  /** Said after the figures, in the same paragraph: what reaches its use-by, other rows left out. */
  children?: ReactNode;
}) {
  const summary = useMemo(() => energySummary(outlook, household), [outlook, household]);
  /** The items being given a figure, in turn, and which one is open. */
  const [filling, setFilling] = useState<{ ids: string[]; at: number } | null>(null);
  const locations = useMemo(() => [...new Set(items.map((item) => item.location.trim()).filter(Boolean))].sort(), [items]);
  const { sentences } = summary;
  const named = summary.uncounted.slice(0, 12);
  const open = filling ? items.find((item) => item.id === filling.ids[filling.at]) : undefined;

  return (
    <>
      <p>
        <span className="text-ink">Food, by energy:</span> <strong className="font-semibold text-ink">{sentences.days}</strong>{" "}
        {sentences.basis}
        {children}
      </p>
      {sentences.uncounted ? (
        <p>
          {/* The sentence the API says, with each item a link to it. */}
          {sentences.uncounted.slice(0, sentences.uncounted.indexOf(": ") + 2)}
          {named.map((row, index) => (
            <span key={row.id}>
              {index > 0 ? ", " : ""}
              <Link to={itemPath(row.id)} className="text-primary underline decoration-1 underline-offset-[0.2em] hover:decoration-2">
                {row.name}
              </Link>
            </span>
          ))}
          {summary.uncounted.length > named.length ? ` and ${summary.uncounted.length - named.length} more` : ""}.{" "}
          <Button
            variant="link"
            className="text-body"
            onClick={() => setFilling({ ids: [...new Set(summary.uncounted.map((row) => row.id))], at: 0 })}
          >
            Give them their energy
          </Button>
        </p>
      ) : null}
      <p className="text-small">{sentences.caveat}</p>
      {filling && open ? (
        <ItemDialog
          key={open.id}
          item={open}
          locations={locations}
          description={`${filling.at + 1} of ${filling.ids.length} without an energy figure. Choose a food from the table, or give the label's figure.`}
          onClose={() => setFilling(null)}
          onSaved={() =>
            setFilling((current) => (current && current.at + 1 < current.ids.length ? { ...current, at: current.at + 1 } : null))
          }
        />
      ) : null}
    </>
  );
}
