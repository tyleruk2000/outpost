/**
 * Adding an item, or changing one. Made for a phone in a cupboard: the name first, the
 * count with large plus and minus, the category and place remembered from the last
 * item on this device, and "Add, then another like this", which keeps everything but
 * the date, so that the next batch of the same tins is a date and a press.
 */
import {
  type EnergyNote,
  type FoodMatch,
  gramsInUnit,
  isCalendarDay,
  kcalOfUnit,
  readEnergyNote,
  SUPPLY_CATEGORIES,
  SUPPLY_FIGURE_MAX,
  SUPPLY_LIMITS,
  SUPPLY_UNITS,
  type SupplyCategory,
  type SupplyDateKind,
  type SupplyItem,
  type SupplyItemInput,
  withEnergyNote,
  withoutEnergyNote,
} from "@outpost/shared";
import { Minus, Plus } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Segmented, Select } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { useAddItem, useUpdateItem } from "./data";
import { EnergySource, FoodOffers, filledFrom, noteOf, weightWanted } from "./energy-lookup";

const REMEMBER = "outpost.supplies.last.v1";

/** The category and place of the last item added on this device: a per-device convenience, nothing more. */
function remembered(): { category: SupplyCategory; location: string } {
  try {
    const stored = JSON.parse(localStorage.getItem(REMEMBER) ?? "{}") as { category?: string; location?: string };
    const category = SUPPLY_CATEGORIES.find((entry) => entry.id === stored.category)?.id ?? "food";
    return { category, location: typeof stored.location === "string" ? stored.location : "" };
  } catch {
    return { category: "food", location: "" };
  }
}
function remember(category: SupplyCategory, location: string): void {
  try {
    localStorage.setItem(REMEMBER, JSON.stringify({ category, location }));
  } catch {
    // Nothing depends on it.
  }
}

/** Text fields as typed, so that "2." can be on its way to "2.5". */
interface Draft {
  name: string;
  category: SupplyCategory;
  quantity: string;
  unit: string;
  location: string;
  dateKind: SupplyDateKind;
  date: string;
  energyBy: "pack" | "100g";
  kcalPerUnit: string;
  kcalPer100g: string;
  gramsPerUnit: string;
  litresPerUnit: string;
  minimum: string;
  barcode: string;
  /** The person's own notes; the line saying where a figure came from is kept apart, in `energyFrom`. */
  notes: string;
  /** The food in USDA FoodData Central's table the energy per 100 g came from, while it is still that figure. */
  energyFrom: EnergyNote | null;
}

const text = (value: number | null) => (value === null ? "" : String(value));

export function draftOf(item: Partial<SupplyItemInput> | undefined): Draft {
  const last = remembered();
  const category = item?.category ?? last.category;
  const note = readEnergyNote(item?.notes ?? "");
  return {
    name: item?.name ?? "",
    category,
    quantity: text(item?.quantity ?? 1),
    unit: item?.unit ?? SUPPLY_UNITS[category][0] ?? "",
    location: item?.location ?? last.location,
    dateKind: item?.dateKind ?? "best-before",
    date: item?.date ?? "",
    energyBy: item?.kcalPerUnit == null && item?.kcalPer100g != null ? "100g" : "pack",
    kcalPerUnit: text(item?.kcalPerUnit ?? null),
    kcalPer100g: text(item?.kcalPer100g ?? null),
    gramsPerUnit: text(item?.gramsPerUnit ?? null),
    litresPerUnit: text(item?.litresPerUnit ?? null),
    minimum: text(item?.minimum ?? null),
    barcode: item?.barcode ?? "",
    notes: withoutEnergyNote(item?.notes ?? ""),
    // Only while the figure is still the table's: one typed over it is the person's own.
    energyFrom: note && item?.kcalPerUnit == null && item?.kcalPer100g === note.kcalPer100g ? note : null,
  };
}

/** A number as typed: empty is null; anything else must be a number of nought or more. */
const number = (value: string): number | null | undefined => {
  const trimmed = value.trim().replace(/,/g, "");
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
};

type Problem = { field: keyof Draft; text: string };

export function inputOf(draft: Draft): SupplyItemInput | Problem {
  const name = draft.name.trim();
  if (!name) return { field: "name", text: "Give it a name: “Baked beans”, “AA batteries”." };
  const quantity = number(draft.quantity);
  if (quantity === undefined || quantity === null) return { field: "quantity", text: "Say how many: a number, nought or more." };
  if (quantity > SUPPLY_FIGURE_MAX.quantity) return { field: "quantity", text: `At most ${formatNumber(SUPPLY_FIGURE_MAX.quantity)}.` };
  if (draft.date && !isCalendarDay(draft.date)) return { field: "date", text: "Give the date from the label, or leave it empty." };
  const food = draft.category === "food" || draft.category === "pet-food";
  // Only the fields on the form for this category and way of giving energy are read: one hidden since holds nothing that counts.
  const shown = [
    ...(food ? (draft.energyBy === "pack" ? (["kcalPerUnit"] as const) : (["kcalPer100g", "gramsPerUnit"] as const)) : []),
    ...(draft.category === "water" ? (["litresPerUnit"] as const) : []),
    "minimum" as const,
  ];
  const values: Record<(typeof shown)[number], number | null> = {
    kcalPerUnit: null,
    kcalPer100g: null,
    gramsPerUnit: null,
    litresPerUnit: null,
    minimum: null,
  };
  for (const field of shown) {
    const value = number(draft[field]);
    if (value === undefined) return { field, text: "A number, or leave it empty." };
    if (value !== null && value > SUPPLY_FIGURE_MAX[field]) return { field, text: `At most ${formatNumber(SUPPLY_FIGURE_MAX[field])}.` };
    values[field] = value;
  }
  const fromTable =
    draft.energyFrom && draft.energyBy === "100g" && values.kcalPer100g === draft.energyFrom.kcalPer100g ? draft.energyFrom : null;
  const notes = withEnergyNote(draft.notes, fromTable);
  if (notes.length > SUPPLY_LIMITS.notes)
    return {
      field: "notes",
      text: `At most ${formatNumber(SUPPLY_LIMITS.notes)} characters, with the line saying where the energy came from.`,
    };
  return {
    name,
    category: draft.category,
    quantity,
    unit: draft.unit.trim(),
    location: draft.location.trim(),
    dateKind: draft.date ? draft.dateKind : null,
    date: draft.date || null,
    kcalPerUnit: values.kcalPerUnit,
    kcalPer100g: values.kcalPer100g,
    gramsPerUnit: values.gramsPerUnit,
    litresPerUnit: values.litresPerUnit,
    minimum: values.minimum,
    barcode: draft.barcode.trim() || null,
    notes,
  };
}

/** Large minus and plus round a number field: the count is what changes most often, standing in a cupboard. */
export function Stepper({
  value,
  onChange,
  label,
  id,
  describedBy,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  id?: string;
  describedBy?: string;
  invalid?: boolean;
}) {
  const step = (by: number) => {
    const current = number(value) ?? 0;
    onChange(String(Math.max(0, Math.round((current + by) * 100) / 100)));
  };
  return (
    <div className="flex items-stretch gap-2">
      <Button variant="secondary" size="icon" className="size-11" aria-label={`One fewer: ${label}`} onClick={() => step(-1)}>
        <Minus />
      </Button>
      <Input
        id={id}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="tabular h-11 w-24 text-center text-lead"
      />
      <Button variant="secondary" size="icon" className="size-11" aria-label={`One more: ${label}`} onClick={() => step(1)}>
        <Plus />
      </Button>
    </div>
  );
}

export function ItemDialog({
  item,
  start,
  locations,
  onClose,
  onSaved,
  description,
}: {
  /** The item being changed; absent when adding. */
  item?: SupplyItem;
  /** What a new item starts with: a scanned barcode, a product remembered, a copy of another. */
  start?: Partial<SupplyItemInput>;
  locations: string[];
  onClose: () => void;
  /** Called in place of `onClose` once a change is saved (going through several items, one after another). */
  onSaved?: (saved: SupplyItem) => void;
  /** Said under the title in place of the usual words. */
  description?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftOf(item ?? start));
  const [problem, setProblem] = useState<Problem | null>(null);
  /** What the server said when it would not save. */
  const [failure, setFailure] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const add = useAddItem();
  const update = useUpdateItem();
  const nameRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const moreRef = useRef<HTMLDetailsElement>(null);
  const gramsRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    if (problem?.field === key) setProblem(null);
  };
  const error = (field: keyof Draft) => (problem?.field === field ? problem.text : undefined);
  const food = draft.category === "food" || draft.category === "pet-food";
  const busy = add.isPending || update.isPending;

  const save = (another: boolean) => {
    const input = inputOf(draft);
    setFailure(null);
    if ("field" in input) {
      setProblem(input);
      // The minimum is in the part of the form that starts closed: open it, so that what is wrong can be seen.
      if ((input.field === "minimum" || input.field === "notes") && moreRef.current) moreRef.current.open = true;
      return;
    }
    const done = (saved: SupplyItem) => {
      remember(saved.category, saved.location);
      if (!another) return onSaved ? onSaved(saved) : onClose();
      toast.success(`Added ${saved.name}. Now the next one like it.`);
      setAdded((count) => count + 1);
      // Everything stays but the date, which is what differs from one batch to the next.
      setDraft((current) => ({ ...current, date: "" }));
      dateRef.current?.focus();
    };
    const failed = (cause: unknown) => setFailure(errorMessage(cause));
    if (item) update.mutate({ id: item.id, input }, { onSuccess: done, onError: failed });
    else add.mutate(input, { onSuccess: done, onError: failed });
  };

  // Offered while there is no figure: one typed from the label is never replaced.
  const offering =
    food &&
    !draft.energyFrom &&
    (draft.energyBy === "pack" ? !draft.kcalPerUnit.trim() : !draft.kcalPer100g.trim() && !draft.kcalPerUnit.trim());
  const choose = (match: FoodMatch, source: string) => {
    const filled = filledFrom(match, draft.unit, draft.gramsPerUnit);
    setDraft((current) => ({ ...current, energyBy: "100g", kcalPerUnit: "", ...filled, energyFrom: noteOf(source, match) }));
    if (problem && ["kcalPer100g", "gramsPerUnit", "kcalPerUnit"].includes(problem.field)) setProblem(null);
    // A tin or a pack: its weight is the one thing left to give.
    if (!filled.gramsPerUnit) window.setTimeout(() => gramsRef.current?.focus(), 0);
  };

  const kcal = food
    ? kcalOfUnit({
        kcalPerUnit: draft.energyBy === "pack" ? (number(draft.kcalPerUnit) ?? null) : null,
        kcalPer100g: draft.energyBy === "100g" ? (number(draft.kcalPer100g) ?? null) : null,
        gramsPerUnit: draft.energyBy === "100g" ? (number(draft.gramsPerUnit) ?? null) : null,
      })
    : null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        size="lg"
        title={item ? `Change ${item.name}` : "Add to supplies"}
        description={
          description ??
          (item
            ? undefined
            : added > 0
              ? `${added} added so far.`
              : "Only the name and how many are needed. The rest makes the days and the shopping list better.")
        }
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          (item ? null : nameRef.current)?.focus();
        }}
      >
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            save(false);
          }}
        >
          <DialogBody className="grid gap-4">
            <Field label="Name" error={error("name")}>
              {(ids) => (
                <Input
                  {...ids}
                  ref={nameRef}
                  value={draft.name}
                  onChange={(event) => set("name", event.target.value)}
                  maxLength={SUPPLY_LIMITS.name}
                  autoComplete="off"
                  enterKeyHint="next"
                />
              )}
            </Field>
            {offering ? <FoodOffers name={draft.name} onChoose={choose} /> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="How many" error={error("quantity")}>
                {(ids) => (
                  <Stepper
                    id={ids.id}
                    describedBy={ids["aria-describedby"]}
                    invalid={ids["aria-invalid"]}
                    value={draft.quantity}
                    onChange={(value) => set("quantity", value)}
                    label="how many"
                  />
                )}
              </Field>
              <Field label="Of what" optional hint="A tin, a pack, a bottle: what one of them is.">
                {(ids) => (
                  <>
                    <Input
                      {...ids}
                      list={`${listId}-units`}
                      value={draft.unit}
                      onChange={(event) => {
                        const unit = event.target.value;
                        setDraft((current) => {
                          // A weight filled from the old unit ("kg": 1000 g) is not the weight of the new one ("bag").
                          const was = gramsInUnit(current.unit);
                          const filled = current.energyFrom && was !== null && current.gramsPerUnit === String(was);
                          const now = gramsInUnit(unit);
                          return { ...current, unit, gramsPerUnit: filled ? (now !== null ? String(now) : "") : current.gramsPerUnit };
                        });
                      }}
                      maxLength={SUPPLY_LIMITS.unit}
                    />
                    <datalist id={`${listId}-units`}>
                      {SUPPLY_UNITS[draft.category].map((unit) => (
                        <option key={unit} value={unit} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
              <Field label="Category">
                {(ids) => (
                  <Select<SupplyCategory>
                    {...ids}
                    value={draft.category}
                    onChange={(category) => {
                      setDraft((current) => ({
                        ...current,
                        category,
                        // A unit that belonged to the old category gives way to the new one's first.
                        unit:
                          SUPPLY_UNITS[current.category].includes(current.unit) || !current.unit
                            ? (SUPPLY_UNITS[category][0] ?? "")
                            : current.unit,
                      }));
                    }}
                    options={SUPPLY_CATEGORIES.map((category) => ({ value: category.id, label: category.label }))}
                  />
                )}
              </Field>
              <Field label="Kept in" optional hint="Pantry, garage, go-bag: wherever you would look.">
                {(ids) => (
                  <>
                    <Input
                      {...ids}
                      list={`${listId}-places`}
                      value={draft.location}
                      onChange={(event) => set("location", event.target.value)}
                      maxLength={SUPPLY_LIMITS.location}
                    />
                    <datalist id={`${listId}-places`}>
                      {locations.map((location) => (
                        <option key={location} value={location} />
                      ))}
                    </datalist>
                  </>
                )}
              </Field>
            </div>

            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-small font-medium text-ink">Date on the label</legend>
              <Segmented<SupplyDateKind>
                label="Kind of date"
                value={draft.dateKind}
                onChange={(value) => set("dateKind", value)}
                options={[
                  { value: "best-before", label: "Best before" },
                  { value: "use-by", label: "Use by" },
                ]}
                className="justify-self-start"
              />
              <Input
                ref={dateRef}
                type="date"
                aria-label={draft.dateKind === "use-by" ? "Use by" : "Best before"}
                aria-invalid={error("date") ? true : undefined}
                value={draft.date}
                onChange={(event) => set("date", event.target.value)}
                className="tabular max-w-56"
              />
              <p className="text-small text-ink-muted">
                {draft.dateKind === "use-by"
                  ? "Use by is about safety: after it, the food is not counted and is listed to throw away."
                  : "Best before is about quality: after it, the food still counts and is listed to check and eat first."}
              </p>
              {error("date") ? (
                <p role="alert" className="text-small text-danger">
                  {error("date")}
                </p>
              ) : null}
            </fieldset>

            {food ? (
              <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-small font-medium text-ink">Energy, from the label</legend>
                <Segmented<"pack" | "100g">
                  label="Energy given"
                  value={draft.energyBy}
                  onChange={(value) => set("energyBy", value)}
                  options={[
                    { value: "pack", label: "Per pack" },
                    { value: "100g", label: "Per 100 g" },
                  ]}
                  className="justify-self-start"
                />
                {draft.energyBy === "pack" ? (
                  <Field label="kcal in one" optional error={error("kcalPerUnit")}>
                    {(ids) => (
                      <Input
                        {...ids}
                        value={draft.kcalPerUnit}
                        onChange={(event) => set("kcalPerUnit", event.target.value)}
                        inputMode="decimal"
                        className="tabular max-w-40"
                      />
                    )}
                  </Field>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:max-w-sm">
                    <Field label="kcal per 100 g" optional error={error("kcalPer100g")}>
                      {(ids) => (
                        <Input
                          {...ids}
                          value={draft.kcalPer100g}
                          onChange={(event) => {
                            const typed = event.target.value;
                            set("kcalPer100g", typed);
                            // Typed over the table's figure: the label wins, and the note of the table goes.
                            if (draft.energyFrom && number(typed) !== draft.energyFrom.kcalPer100g) set("energyFrom", null);
                          }}
                          inputMode="decimal"
                          className="tabular"
                        />
                      )}
                    </Field>
                    <Field label="Grams in one" optional error={error("gramsPerUnit")}>
                      {(ids) => (
                        <Input
                          {...ids}
                          ref={gramsRef}
                          value={draft.gramsPerUnit}
                          onChange={(event) => set("gramsPerUnit", event.target.value)}
                          inputMode="decimal"
                          className="tabular"
                        />
                      )}
                    </Field>
                  </div>
                )}
                {draft.energyFrom && draft.energyBy === "100g" ? (
                  <EnergySource
                    note={draft.energyFrom}
                    onAnother={() => setDraft((current) => ({ ...current, kcalPer100g: "", energyFrom: null }))}
                  />
                ) : null}
                {draft.energyFrom && draft.energyBy === "100g" && kcal === null ? (
                  <p className="text-small font-medium text-ink">{weightWanted(draft.unit, draft.energyFrom)}</p>
                ) : (
                  <p className="text-small text-ink-muted">
                    {kcal !== null
                      ? `${formatNumber(Math.round(kcal))} kcal in one, ${formatNumber(Math.round(kcal * (number(draft.quantity) ?? 0)))} kcal in all.`
                      : "Without it, this is not counted in the days of food."}
                  </p>
                )}
              </fieldset>
            ) : null}

            {draft.category === "water" ? (
              <Field
                label="Litres in one"
                optional
                hint="Without it, this is not counted in the days of water."
                error={error("litresPerUnit")}
              >
                {(ids) => (
                  <Input
                    {...ids}
                    value={draft.litresPerUnit}
                    onChange={(event) => set("litresPerUnit", event.target.value)}
                    inputMode="decimal"
                    className="tabular max-w-40"
                  />
                )}
              </Field>
            ) : null}

            <details ref={moreRef} className="group rounded-panel border border-border px-4 py-3 open:pb-4">
              <summary className="cursor-pointer text-small font-medium text-ink select-none">More: minimum, barcode, notes</summary>
              <div className="mt-3 grid gap-4">
                <Field
                  label="Keep at least"
                  optional
                  hint="Fewer than this of it, and it goes on the shopping list."
                  error={error("minimum")}
                >
                  {(ids) => (
                    <Input
                      {...ids}
                      value={draft.minimum}
                      onChange={(event) => set("minimum", event.target.value)}
                      inputMode="decimal"
                      className="tabular max-w-40"
                    />
                  )}
                </Field>
                <Field label="Barcode" optional hint="The number under the bars. Scanning fills it in.">
                  {(ids) => (
                    <Input
                      {...ids}
                      value={draft.barcode}
                      onChange={(event) => set("barcode", event.target.value)}
                      inputMode="numeric"
                      maxLength={SUPPLY_LIMITS.barcode}
                      className="font-mono max-w-64"
                      autoComplete="off"
                    />
                  )}
                </Field>
                <Field label="Notes" optional error={error("notes")}>
                  {(ids) => (
                    <Textarea
                      {...ids}
                      value={draft.notes}
                      onChange={(event) => set("notes", event.target.value)}
                      maxLength={SUPPLY_LIMITS.notes}
                    />
                  )}
                </Field>
              </div>
            </details>
            {failure ? <Notice tone="danger">{failure}</Notice> : null}
          </DialogBody>
          <DialogFooter className="max-sm:flex-col-reverse max-sm:items-stretch">
            <Button variant="secondary" onClick={onClose}>
              {added > 0 ? "Done" : "Cancel"}
            </Button>
            {item ? null : (
              <Button variant="secondary" onClick={() => save(true)} disabled={busy}>
                Add, then another like this
              </Button>
            )}
            <Button type="submit" variant="primary" loading={busy}>
              {item ? "Save" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
