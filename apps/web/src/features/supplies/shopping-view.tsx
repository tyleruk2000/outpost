/**
 * The shopping list: worked out from the stock (the shortfall against the days wanted,
 * what is below a minimum, what is past its use-by), with lines of the person's own.
 * Every line can be changed or taken off. Ticking one off asks how many were bought and
 * the date on them, and adds them to the stock. The list can be made a PDF, and copied
 * as text.
 */
import {
  type ShoppingLine,
  SUPPLY_CATEGORIES,
  SUPPLY_LIMITS,
  type SupplyCategory,
  type SupplyDateKind,
  type SupplyItem,
} from "@outpost/shared";
import { Check, ClipboardCopy, Minus, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Segmented, Select, Skeleton } from "@/components/ui/misc";
import { copyText } from "@/features/downloads/copy";
import { madePdf } from "@/features/library/made/made-pdf";
import { PdfActions } from "@/features/library/made/pdf-actions";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/utils";
import { useAddShoppingLine, useBought, useRemoveShoppingLine, useShopping, useUpdateShoppingLine, useWorkOutShopping } from "./data";
import { Stepper } from "./item-form";
import { shoppingPdf, shoppingTitle } from "./shopping-document";
import { amount, lineWords, reasonsWords, shoppingText } from "./words";

function BoughtDialog({ line, model, onClose }: { line: ShoppingLine; model: SupplyItem | undefined; onClose: () => void }) {
  const [quantity, setQuantity] = useState(String(line.quantity ?? 1));
  const [dateKind, setDateKind] = useState<SupplyDateKind>(model?.dateKind ?? "best-before");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState(model?.location ?? "");
  const [category, setCategory] = useState<SupplyCategory>("food");
  const [problem, setProblem] = useState<string | null>(null);
  const bought = useBought();
  const submit = () => {
    const count = Number(quantity);
    if (!(count > 0)) return setProblem("Say how many you bought.");
    bought.mutate(
      {
        id: line.id,
        input: { quantity: count, dateKind: date ? dateKind : null, date: date || null, location, ...(model ? {} : { category }) },
      },
      {
        onSuccess: (result) => {
          toast.success(
            `${result.item.name}: ${amount(result.item.quantity)} now in stock${result.item.location ? ` in ${result.item.location}` : ""}.`,
          );
          onClose();
        },
        onError: (error) => setProblem(errorMessage(error)),
      },
    );
  };
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent title={`Bought: ${line.name}`} description="It is added to the stock with the date on what you bought.">
        <form
          className="contents"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <DialogBody className="grid gap-4">
            <Field label="How many you bought">
              {(ids) => <Stepper id={ids.id} value={quantity} onChange={setQuantity} label="how many bought" />}
            </Field>
            <fieldset className="grid gap-2">
              <legend className="mb-1.5 text-small font-medium text-ink">Date on the label</legend>
              <Segmented<SupplyDateKind>
                label="Kind of date"
                value={dateKind}
                onChange={setDateKind}
                options={[
                  { value: "best-before", label: "Best before" },
                  { value: "use-by", label: "Use by" },
                ]}
                className="justify-self-start"
              />
              <Input
                type="date"
                aria-label={dateKind === "use-by" ? "Use by" : "Best before"}
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="tabular max-w-56"
              />
              <p className="text-small text-ink-muted">Leave it empty if it has none.</p>
            </fieldset>
            <Field label="Kept in">
              {(ids) => (
                <Input {...ids} value={location} onChange={(event) => setLocation(event.target.value)} maxLength={SUPPLY_LIMITS.location} />
              )}
            </Field>
            {model ? null : (
              <Field label="Category">
                {(ids) => (
                  <Select<SupplyCategory>
                    {...ids}
                    value={category}
                    onChange={setCategory}
                    options={SUPPLY_CATEGORIES.map((entry) => ({ value: entry.id, label: entry.label }))}
                  />
                )}
              </Field>
            )}
            {problem ? <Notice tone="danger">{problem}</Notice> : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={bought.isPending}>
              Add to stock
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function OwnLine() {
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const add = useAddShoppingLine();
  return (
    <form
      className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name.trim()) return;
        add.mutate(
          { name, quantity: Number(quantity) > 0 ? Number(quantity) : null, unit: "", note: "" },
          { onSuccess: () => setName("") },
        );
      }}
    >
      <Field label="Something else to buy">
        {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={SUPPLY_LIMITS.name} />}
      </Field>
      <Field label="How many">{(ids) => <Stepper id={ids.id} value={quantity} onChange={setQuantity} label="how many to buy" />}</Field>
      <Button type="submit" loading={add.isPending} className="max-md:h-11">
        <Plus />
        Add to the list
      </Button>
    </form>
  );
}

export function ShoppingView({ items }: { items: SupplyItem[] }) {
  const shopping = useShopping();
  const workOut = useWorkOutShopping();
  const update = useUpdateShoppingLine();
  const remove = useRemoveShoppingLine();
  const [buying, setBuying] = useState<ShoppingLine | null>(null);
  const [now] = useState(() => Date.now());
  const lines = shopping.data?.lines ?? [];
  const workedOutAt = shopping.data?.workedOutAt ?? null;
  const pdf = useMemo(
    () =>
      lines.length > 0
        ? madePdf(shoppingPdf(lines, workedOutAt, now), shoppingTitle(workedOutAt, now), "Shopping list", {
            what: "the supplies' shopping list",
            path: "/prepare/supplies?view=shopping",
          })
        : null,
    [lines, workedOutAt, now],
  );

  if (shopping.isPending)
    return (
      <div className="grid gap-3">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  if (shopping.isError) return <ErrorState error={shopping.error} onRetry={() => void shopping.refetch()} />;

  const workButton = (
    <Button variant={lines.length === 0 ? "primary" : "secondary"} loading={workOut.isPending} onClick={() => workOut.mutate(undefined)}>
      <RefreshCw />
      {workedOutAt ? "Work it out again" : "Work out the list"}
    </Button>
  );

  return (
    <div>
      <Section
        title="Shopping list"
        description={
          workedOutAt
            ? `Worked out on ${formatDate(workedOutAt)}: enough to reach the days wanted, in whole packs of what you keep, with what is below a minimum or past its use-by. Lines you added stay when it is worked out again.`
            : "Worked out from the stock: enough to reach the days wanted, in whole packs of what you already keep, and what is below a minimum or past its use-by."
        }
        actions={workButton}
      >
        {shopping.data?.stale ? (
          <Notice tone="warning" className="mb-4">
            The stock or the household has changed since this list was worked out. Work it out again to bring it up to date; lines you added
            stay.
          </Notice>
        ) : null}
        {lines.length === 0 ? (
          <EmptyState compact title={workedOutAt ? "Nothing to buy" : "No list yet"}>
            {workedOutAt
              ? "The stock reaches the days wanted, nothing is below its minimum, and nothing is past its use-by."
              : "Work out the list from the stock and the household, or add a line of your own below."}
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border border-y border-border" aria-label="To buy">
            {lines.map((line) => (
              <li key={line.id} className="flex items-center gap-2 py-2.5">
                <Button
                  variant="secondary"
                  size="icon"
                  className="size-11"
                  aria-label={`Bought ${line.name}`}
                  onClick={() => setBuying(line)}
                >
                  <Check />
                </Button>
                <div className="min-w-0 flex-1">
                  <p className="text-body text-ink">{lineWords(line)}</p>
                  <p className="text-small text-ink-muted">{reasonsWords(line.reasons)}</p>
                </div>
                {line.quantity !== null ? (
                  <div className="flex shrink-0 items-center">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`One fewer ${line.name}`}
                      disabled={line.quantity <= 1}
                      onClick={() => update.mutate({ id: line.id, input: { quantity: line.quantity! - 1 } })}
                    >
                      <Minus />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      aria-label={`One more ${line.name}`}
                      onClick={() => update.mutate({ id: line.id, input: { quantity: line.quantity! + 1 } })}
                    >
                      <Plus />
                    </Button>
                  </div>
                ) : null}
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-11"
                  aria-label={`Take ${line.name} off the list`}
                  onClick={() => remove.mutate(line.id)}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <OwnLine />
      </Section>

      {lines.length > 0 ? (
        <Section title="Take it with you" description="As a PDF to print or keep, or as text to paste into a message.">
          <PdfActions pdf={pdf}>
            <Button
              onClick={async () => {
                const copied = await copyText(shoppingText(lines));
                if (copied) toast.success("The list is copied as text.");
                else toast.error("This browser would not copy. Save the PDF, or select the list and copy it yourself.");
              }}
            >
              <ClipboardCopy />
              Copy as text
            </Button>
          </PdfActions>
        </Section>
      ) : null}

      {buying ? (
        <BoughtDialog line={buying} model={items.find((item) => item.id === buying.itemId)} onClose={() => setBuying(null)} />
      ) : null}
    </div>
  );
}
