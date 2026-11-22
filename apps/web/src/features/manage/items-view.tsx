/**
 * Everything installed, in one list: every collection and document, whatever screen it
 * usually lives on. Sort it, narrow it, select one or many, and remove or move them.
 */
import { formatBytes, type ManagedItem, type ManagedKind } from "@outpost/shared";
import { CircleAlert, FolderInput, Search, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { EmptyState, ErrorState } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge, Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { cn, formatDate, plural } from "@/lib/utils";
import { MoveItemsDialog, RemoveItemsDialog } from "./item-dialogs";
import { useItems } from "./manage-data";
import {
  filterItems,
  type ItemFilter,
  kindNames,
  kindOrder,
  type SortOrder,
  sortItems,
  sortNames,
  stateOf,
  tallyOf,
  tallyText,
} from "./manage-text";

/** Rows drawn at first; a long library adds more on request rather than all at once. */
const PAGE = 150;

function ItemRow({ item, checked, onToggle }: { item: ManagedItem; checked: boolean; onToggle: (checked: boolean) => void }) {
  const state = stateOf(item);
  const id = `item-${item.key}`;
  return (
    <li className={cn("flex items-start gap-3 py-3 transition-colors", checked && "bg-primary-soft/50")}>
      {/* The whole square is the target, not only the box drawn in it. */}
      <label htmlFor={id} className="grid size-11 shrink-0 cursor-pointer place-content-center md:size-9">
        <Checkbox id={id} checked={checked} onCheckedChange={(next) => onToggle(next === true)} aria-label={`Select ${item.title}`} />
      </label>
      <div className="min-w-0 flex-1 pt-2 md:pt-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <Link to={item.href} className="min-w-0 font-title text-body break-words text-ink underline-offset-2 hover:underline">
            {item.title}
          </Link>
          <span className="tabular shrink-0 text-small font-medium text-ink max-md:hidden">{formatBytes(item.sizeBytes)}</span>
        </div>
        <p className="mt-0.5 text-small text-ink-muted">
          <span className="tabular font-medium text-ink md:hidden">{formatBytes(item.sizeBytes)}</span>
          <span aria-hidden className="mx-1.5 text-border-strong md:hidden">
            /
          </span>
          {kindNames[item.kind].one}
          {item.origin === "own" && item.kind !== "document" ? ", added by you" : ""}
          <span aria-hidden className="mx-1.5 text-border-strong">
            /
          </span>
          {item.locationName}
          <span aria-hidden className="mx-1.5 text-border-strong">
            /
          </span>
          Added {formatDate(item.addedAt)}
        </p>
        {item.documents.length > 1 ? (
          <p className="mt-0.5 text-small text-ink-muted">Holds {plural(item.documents.length, "document")}, which go with it.</p>
        ) : null}
        {state ? (
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-small text-ink-muted">
            <Badge tone={state.tone}>
              <CircleAlert aria-hidden /> {state.label}
            </Badge>
            {item.busyReason ??
              (!item.locationAvailable
                ? "Its file cannot be deleted while the location is away, only forgotten."
                : item.state === "missing"
                  ? "The record is here but the file is not."
                  : null)}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default function ItemsView({ busy }: { busy: boolean }) {
  const items = useItems();
  const [filter, setFilter] = useState<ItemFilter>({ text: "", kind: "all", locationId: "all", origin: "all" });
  const [order, setOrder] = useState<SortOrder>("largest");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [shown, setShown] = useState(PAGE);
  const [removing, setRemoving] = useState(false);
  const [moving, setMoving] = useState(false);

  const all = items.data ?? [];
  const visible = useMemo(() => sortItems(filterItems(all, filter), order), [all, filter, order]);
  // A selection survives filtering, but never outlives the things it names.
  const chosen = useMemo(() => all.filter((item) => selected.has(item.key)), [all, selected]);

  if (items.isPending) {
    return (
      <div className="mt-6 grid gap-3" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    );
  }
  if (items.isError) {
    return (
      <div className="mt-6">
        <ErrorState error={items.error} onRetry={() => items.refetch()} />
      </div>
    );
  }
  if (all.length === 0) {
    return (
      <EmptyState
        className="mt-6"
        title="Nothing is installed yet"
        action={
          <>
            <Button asChild variant="primary">
              <Link to="/explore">Find collections in Explore</Link>
            </Button>
            <Button asChild>
              <Link to="/library?upload=1">Add documents</Link>
            </Button>
          </>
        }
      >
        Reference archives, maps, catalogue sheets and your own documents are listed here once they are in your library.
      </EmptyState>
    );
  }

  const kinds = kindOrder.filter((kind) => all.some((item) => item.kind === kind));
  const locations = [...new Map(all.map((item) => [item.locationId, item.locationName])).entries()];
  const allVisibleChosen = visible.length > 0 && visible.every((item) => selected.has(item.key));
  const someVisibleChosen = visible.some((item) => selected.has(item.key));
  const toggle = (key: string, on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });
  const toggleVisible = (on: boolean) =>
    setSelected((current) => {
      const next = new Set(current);
      for (const item of visible) {
        if (on) next.add(item.key);
        else next.delete(item.key);
      }
      return next;
    });
  const narrowed = filter.text.trim() !== "" || filter.kind !== "all" || filter.locationId !== "all" || filter.origin !== "all";

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[min(12rem,100%)] flex-1 max-md:basis-full">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            type="search"
            aria-label="Filter by name"
            placeholder="Filter by name"
            className="pl-9"
            value={filter.text}
            onChange={(event) => {
              setFilter((current) => ({ ...current, text: event.target.value }));
              setShown(PAGE);
            }}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 max-md:w-full md:flex md:flex-wrap">
          <Select<ManagedKind | "all">
            aria-label="Kind"
            value={filter.kind}
            onChange={(kind) => setFilter((current) => ({ ...current, kind }))}
            options={[{ value: "all", label: "All kinds" }, ...kinds.map((kind) => ({ value: kind, label: kindNames[kind].many }))]}
            className="md:w-52"
          />
          {locations.length > 1 ? (
            <Select
              aria-label="Location"
              value={filter.locationId}
              onChange={(locationId) => setFilter((current) => ({ ...current, locationId }))}
              options={[{ value: "all", label: "All locations" }, ...locations.map(([id, name]) => ({ value: id, label: name }))]}
              className="md:w-44"
            />
          ) : null}
          <Select<ItemFilter["origin"]>
            aria-label="Where it came from"
            value={filter.origin}
            onChange={(origin) => setFilter((current) => ({ ...current, origin }))}
            options={[
              { value: "all", label: "Downloaded and yours" },
              { value: "downloaded", label: "Downloaded" },
              { value: "own", label: "Yours" },
            ]}
            className="md:w-48"
          />
          <Select<SortOrder>
            aria-label="Sort"
            value={order}
            onChange={setOrder}
            options={(Object.keys(sortNames) as SortOrder[]).map((value) => ({ value, label: sortNames[value] }))}
            className="md:w-40"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 border-b border-border pb-2">
        <label htmlFor="manage-select-all" className="grid size-11 shrink-0 cursor-pointer place-content-center md:size-9">
          <Checkbox
            id="manage-select-all"
            checked={allVisibleChosen ? true : someVisibleChosen ? "indeterminate" : false}
            onCheckedChange={(next) => toggleVisible(next === true)}
            aria-label={narrowed ? "Select everything shown" : "Select everything"}
            disabled={visible.length === 0}
          />
        </label>
        <p className="tabular text-small text-ink-muted" aria-live="polite">
          {narrowed ? `${tallyText(tallyOf(visible))} shown of ${plural(all.length, "item")}` : tallyText(tallyOf(all))}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-small text-ink-muted">
          Nothing matches.{" "}
          <button
            type="button"
            className="text-primary underline underline-offset-2"
            onClick={() => setFilter({ text: "", kind: "all", locationId: "all", origin: "all" })}
          >
            Show everything
          </button>
        </p>
      ) : (
        <ul className="divide-y divide-border border-b border-border" aria-label="Everything installed">
          {visible.slice(0, shown).map((item) => (
            <ItemRow key={item.key} item={item} checked={selected.has(item.key)} onToggle={(on) => toggle(item.key, on)} />
          ))}
        </ul>
      )}
      {visible.length > shown ? (
        <div className="mt-4">
          <Button onClick={() => setShown((current) => current + PAGE)}>Show {Math.min(PAGE, visible.length - shown)} more</Button>
        </div>
      ) : null}

      {chosen.length > 0 ? (
        // Sits above the phone's bottom bar, and stays in reach while the list scrolls.
        <section
          aria-label="Selection"
          className="sticky bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-(--z-sticky) mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-panel border border-border-strong bg-raised px-4 py-3 shadow-float md:bottom-4"
        >
          <p className="tabular text-small text-ink" aria-live="polite">
            <span className="font-semibold">{plural(chosen.length, "item")} selected</span>, {formatBytes(tallyOf(chosen).bytes)}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Clear selection
            </Button>
            <Button size="sm" onClick={() => setMoving(true)}>
              <FolderInput /> Move
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setRemoving(true)}
              disabled={busy}
              title={busy ? "A clean-up is already under way" : undefined}
            >
              <Trash2 /> Remove
            </Button>
          </div>
        </section>
      ) : null}

      <RemoveItemsDialog
        items={chosen}
        open={removing}
        onOpenChange={setRemoving}
        onStarted={() => {
          setRemoving(false);
          setSelected(new Set());
          window.scrollTo({ top: 0 });
        }}
      />
      <MoveItemsDialog items={chosen} open={moving} onOpenChange={setMoving} />
    </div>
  );
}
