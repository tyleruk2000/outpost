/**
 * The stock: one row to a batch, with plus and minus at the end of it. Minus is "use
 * one", the press made most often, so it is one press and the number changes at once.
 * A row's name opens the item, which has an address of its own that a note can link to.
 */
import { localDay, SUPPLY_CATEGORIES, type SupplyCategory, type SupplyItem } from "@outpost/shared";
import { CircleAlert, Clock, Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { cn, plural } from "@/lib/utils";
import { useAdjust } from "./data";
import { contentWords, dateState, dateWords, dayWords, quantityWords } from "./words";

type Order = "name" | "date";
const EVERY = "__every__";

export function itemPath(id: string): string {
  return `/prepare/supplies/items/${encodeURIComponent(id)}`;
}

/** The words under an item's name: how many, where, its date and what that means today. */
export function ItemFacts({ item, today, className }: { item: SupplyItem; today: string; className?: string }) {
  const state = dateState(item, today);
  const date = dateWords(item);
  const content = contentWords(item);
  return (
    <p className={cn("text-small text-ink-muted", className)}>
      <span className="tabular">{quantityWords(item.quantity, item.unit)}</span>
      {item.location ? <> · {item.location}</> : null}
      {content ? <> · {content}</> : null}
      {date ? (
        <>
          {" · "}
          <span
            className={cn(
              "inline-flex items-center gap-1 whitespace-nowrap",
              state === "past-use-by" && "font-medium text-danger",
              state === "past-best-before" && "font-medium text-warning",
            )}
          >
            {state === "past-use-by" ? <CircleAlert aria-hidden className="size-3.5" /> : null}
            {state === "past-best-before" || state === "soon" ? <Clock aria-hidden className="size-3.5" /> : null}
            {state === "past-use-by"
              ? `Past its use-by, ${dayWords(item.date!)}`
              : state === "past-best-before"
                ? `Past best before: check it, eat it first`
                : date}
          </span>
        </>
      ) : null}
    </p>
  );
}

/** Minus and plus for one row: 44 px each, so that a thumb finds them. */
export function Adjuster({ item }: { item: SupplyItem }) {
  const adjust = useAdjust();
  // "Use one tin of Baked beans"; counted without a unit, "Use one of AA batteries".
  const one = item.unit ? `one ${item.unit}` : "one";
  return (
    <div className="relative flex shrink-0 items-center gap-1">
      <Button
        variant="secondary"
        size="icon"
        className="size-11"
        aria-label={`Use ${one} of ${item.name}`}
        disabled={item.quantity <= 0}
        onClick={() => adjust.mutate({ id: item.id, by: -1 })}
      >
        <Minus />
      </Button>
      <span className="tabular w-9 text-center text-lead text-ink" aria-hidden>
        {Math.round(item.quantity * 100) / 100}
      </span>
      <Button
        variant="secondary"
        size="icon"
        className="size-11"
        aria-label={`Add ${one} of ${item.name}`}
        onClick={() => adjust.mutate({ id: item.id, by: 1 })}
      >
        <Plus />
      </Button>
    </div>
  );
}

export function StockView({ items, locations, onAdd }: { items: SupplyItem[]; locations: string[]; onAdd: () => void }) {
  const [text, setText] = useState("");
  const [category, setCategory] = useState<SupplyCategory | typeof EVERY>(EVERY);
  const [place, setPlace] = useState<string>(EVERY);
  const [order, setOrder] = useState<Order>("name");
  const today = localDay();

  const shown = useMemo(() => {
    const words = text.trim().toLowerCase();
    const rows = items.filter(
      (item) =>
        (category === EVERY || item.category === category) &&
        (place === EVERY || item.location === place) &&
        (!words || `${item.name} ${item.notes} ${item.barcode ?? ""}`.toLowerCase().includes(words)),
    );
    return order === "name"
      ? [...rows].sort((a, b) => a.name.localeCompare(b.name) || (a.date ?? "9").localeCompare(b.date ?? "9"))
      : [...rows].sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999") || a.name.localeCompare(b.name));
  }, [items, text, category, place, order]);

  if (items.length === 0)
    return (
      <EmptyState
        title="Nothing stored yet"
        action={
          <Button variant="primary" onClick={onAdd}>
            <Plus />
            Add the first item
          </Button>
        }
      >
        Add what you keep in the cupboard, the garage or a go-bag: food and water, and the fuel, medicine, batteries and kit beside them. A
        spreadsheet you already keep can be brought in from “Bring in a CSV file” below.
      </EmptyState>
    );

  const categories = SUPPLY_CATEGORIES.filter((entry) => items.some((item) => item.category === entry.id));
  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <Input
          type="search"
          aria-label="Find in supplies"
          placeholder="Find by name, note or barcode"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <Select<string>
            aria-label="Category"
            value={category}
            onChange={(value) => setCategory(value as SupplyCategory | typeof EVERY)}
            options={[{ value: EVERY, label: "Every category" }, ...categories.map((entry) => ({ value: entry.id, label: entry.label }))]}
            className="sm:w-44"
          />
          <Select<string>
            aria-label="Kept in"
            value={place}
            onChange={setPlace}
            options={[{ value: EVERY, label: "Everywhere" }, ...locations.map((location) => ({ value: location, label: location }))]}
            className="sm:w-44"
          />
        </div>
      </div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-small text-ink-muted" aria-live="polite">
          {shown.length === items.length ? plural(items.length, "row") : `${plural(shown.length, "row")} of ${items.length}`}
        </p>
        <Segmented<Order>
          label="Order"
          value={order}
          onChange={setOrder}
          options={[
            { value: "name", label: "By name" },
            { value: "date", label: "Use first" },
          ]}
        />
      </div>
      {shown.length === 0 ? (
        <p className="border-y border-border py-6 text-body text-ink-muted">Nothing matches. Clear the search or choose every category.</p>
      ) : (
        <ul className="divide-y divide-border border-y border-border" aria-label="Supplies">
          {shown.map((item) => (
            <li key={item.id} className={cn("relative flex items-center gap-3 py-2.5", item.quantity <= 0 && "opacity-70")}>
              <div className="min-w-0 flex-1">
                <Link
                  to={itemPath(item.id)}
                  // The whole row, not only the name's line of text, opens the item; plus and minus sit above it.
                  className="block text-body font-medium text-ink after:absolute after:inset-0 after:content-[''] hover:text-primary focus-visible:outline-2 focus-visible:outline-focus"
                >
                  {item.name}
                  {item.quantity <= 0 ? <span className="font-normal text-ink-muted"> (used up)</span> : null}
                </Link>
                <ItemFacts item={item} today={today} />
              </div>
              <Adjuster item={item} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
