/**
 * Leftovers: what is on disk or in the records that no longer serves anything. Each
 * group says what its things are and what clearing them does; nothing is cleared that
 * was not ticked.
 */
import { type ClearLeftoversResponse, formatBytes, type Leftover, type LeftoverKind, type LeftoversResponse } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Checkbox, Skeleton, Spinner } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { plural, timeAgo } from "@/lib/utils";
import { useClearLeftovers, useLeftovers, useMeasure } from "./manage-data";
import { cacheCost, leftoverOrder, leftoverWords } from "./manage-text";

const sizeOf = (items: Leftover[]) => items.reduce((sum, item) => sum + (item.bytes ?? 0), 0);

function LeftoverRow({ item, checked, onToggle }: { item: Leftover; checked: boolean; onToggle: (on: boolean) => void }) {
  const cost = item.kind === "cache" && item.what ? cacheCost[item.what] : undefined;
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="grid size-11 shrink-0 place-content-center md:size-9">
        <Checkbox checked={checked} onCheckedChange={(next) => onToggle(next === true)} aria-label={`Select ${item.title}`} />
      </span>
      <div className="min-w-0 flex-1 pt-2 md:pt-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <span className="min-w-0 font-medium break-words text-ink">{item.title}</span>
          <span className="tabular shrink-0 text-small font-medium text-ink">
            {item.bytes !== null ? formatBytes(item.bytes) : item.count !== null ? plural(item.count, "record") : "No file"}
          </span>
        </div>
        {item.detail ? <p className="mt-0.5 font-mono text-[0.8125rem] break-all text-ink-muted">{item.detail}</p> : null}
        <p className="mt-0.5 text-small text-ink-muted">
          {[
            item.locationName ? `On “${item.locationName}”` : null,
            item.bytes !== null && item.count !== null && item.count > 1 ? plural(item.count, "file") : null,
            item.kind === "download" && item.what ? `The download ${item.what === "paused" ? "is paused" : item.what}` : null,
            cost,
          ]
            .filter(Boolean)
            .map((sentence) => (/[.!?]$/.test(sentence as string) ? sentence : `${sentence}.`))
            .join(" ")}
          {item.href ? (
            <>
              {" "}
              <Link to={item.href} className="text-primary underline underline-offset-2">
                {item.kind === "missing"
                  ? "Download it again from Explore"
                  : item.kind === "download"
                    ? "See the download"
                    : "See the list"}
              </Link>
            </>
          ) : null}
        </p>
      </div>
    </li>
  );
}

function Group({
  kind,
  items,
  more,
  onCleared,
}: {
  kind: LeftoverKind;
  items: Leftover[];
  more: { count: number; bytes: number } | undefined;
  onCleared: (result: ClearLeftoversResponse) => void;
}) {
  const words = leftoverWords[kind];
  const clear = useClearLeftovers();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const chosen = items.filter((item) => selected.has(item.id));
  const all = chosen.length === items.length;
  const headingId = `leftovers-${kind}`;

  return (
    <section aria-labelledby={headingId} className="mt-10 first:mt-6">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="text-lead font-semibold text-ink">
          {words.title}
        </h2>
        <p className="tabular text-small text-ink-muted">
          {plural(items.length + (more?.count ?? 0), "item")}
          {sizeOf(items) + (more?.bytes ?? 0) > 0 ? `, ${formatBytes(sizeOf(items) + (more?.bytes ?? 0))}` : ""}
        </p>
      </div>
      <p className="mt-1 max-w-[62ch] text-small text-pretty text-ink-muted">{words.description}</p>

      <div className="mt-3 flex items-center gap-3 border-b border-border pb-1.5">
        <span className="grid size-11 shrink-0 place-content-center md:size-9">
          <Checkbox
            checked={all ? true : chosen.length > 0 ? "indeterminate" : false}
            onCheckedChange={(next) => setSelected(next === true ? new Set(items.map((item) => item.id)) : new Set())}
            aria-label={`Select all: ${words.title}`}
          />
        </span>
        <p className="tabular flex-1 text-small text-ink-muted" aria-live="polite">
          {chosen.length > 0
            ? `${plural(chosen.length, "item")} selected${sizeOf(chosen) > 0 ? `, ${formatBytes(sizeOf(chosen))}` : ""}`
            : `Tick what to ${words.action.toLowerCase()}`}
        </p>
        <Button size="sm" variant="danger" disabled={chosen.length === 0} onClick={() => setConfirming(true)}>
          {words.action} selected
        </Button>
      </div>
      <ul className="divide-y divide-border border-b border-border">
        {items.map((item) => (
          <LeftoverRow
            key={item.id}
            item={item}
            checked={selected.has(item.id)}
            onToggle={(on) =>
              setSelected((current) => {
                const next = new Set(current);
                if (on) next.add(item.id);
                else next.delete(item.id);
                return next;
              })
            }
          />
        ))}
      </ul>
      {more && more.count > 0 ? (
        <p className="mt-2 text-small text-ink-muted">
          And {plural(more.count, "more item")} ({formatBytes(more.bytes)}), listed once these have been dealt with.
        </p>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${words.action} ${plural(chosen.length, "item")}?`}
        description={
          <>
            <p>{words.confirm}</p>
            {sizeOf(chosen) > 0 ? <p className="tabular mt-2 font-medium text-ink">{formatBytes(sizeOf(chosen))} will be freed.</p> : null}
          </>
        }
        confirmLabel={`${words.action} ${plural(chosen.length, "item")}`}
        loading={clear.isPending}
        onConfirm={() =>
          clear.mutate(
            chosen.map((item) => item.id),
            {
              onSuccess: (result) => {
                setConfirming(false);
                setSelected(new Set());
                onCleared(result);
              },
              onError: (error) => toast.error(errorMessage(error)),
            },
          )
        }
      />
    </section>
  );
}

function Status({ data }: { data: LeftoversResponse }) {
  const measure = useMeasure();
  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
      <p className="flex items-center gap-2 text-small text-pretty text-ink-muted" aria-live="polite">
        {data.measuring ? <Spinner className="size-3.5" label="Looking" /> : null}
        {data.measuring
          ? data.measuredAt
            ? `Looking again. This list is from ${timeAgo(data.measuredAt)}.`
            : "Looking through Outpost's folders for the first time. Files on disk are listed when that is done."
          : data.measuredAt
            ? `Outpost's folders were looked through ${timeAgo(data.measuredAt)}.`
            : "Outpost's folders have not been looked through yet."}
      </p>
      <Button
        size="sm"
        onClick={() => measure.mutate(undefined, { onError: (error) => toast.error(errorMessage(error)) })}
        loading={measure.isPending || data.measuring}
      >
        Look again
      </Button>
    </div>
  );
}

export default function LeftoversView() {
  const leftovers = useLeftovers();
  const [last, setLast] = useState<ClearLeftoversResponse>();

  if (leftovers.isPending) {
    return (
      <div className="mt-6 grid gap-3" aria-busy>
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-16" />
        <Skeleton className="h-16" />
      </div>
    );
  }
  if (leftovers.isError) {
    return (
      <div className="mt-6">
        <ErrorState error={leftovers.error} onRetry={() => leftovers.refetch()} />
      </div>
    );
  }
  const data = leftovers.data;
  const groups = leftoverOrder
    .map((kind) => ({ kind, items: data.items.filter((item) => item.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div>
      <Status data={data} />
      {last ? (
        <Notice
          className="mt-4"
          tone={last.failed.length > 0 ? "warning" : "success"}
          icon={last.failed.length > 0 ? <CircleAlert /> : undefined}
          title={`Cleared ${plural(last.cleared.count, "item")}${last.cleared.bytes > 0 ? `, freeing ${formatBytes(last.cleared.bytes)}` : ""}`}
        >
          {last.failed.length > 0 ? (
            <>
              <p>
                {plural(last.failed.length, "item")} could not be cleared and {last.failed.length === 1 ? "was" : "were"} left as{" "}
                {last.failed.length === 1 ? "it was" : "they were"}:
              </p>
              <ul className="mt-1 grid gap-1">
                {last.failed.map((entry) => (
                  <li key={entry.id}>
                    <span className="font-medium">{entry.title}</span> <span className="text-ink-muted">{entry.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Notice>
      ) : null}
      {groups.length === 0 ? (
        <EmptyState className="mt-6" title={data.measuredAt ? "Nothing is left over" : "Nothing found so far"} compact seed={7}>
          {data.measuredAt
            ? "No unfinished downloads, no records without a file, no stray files in Outpost's folders, and nothing kept that could be cleared."
            : "Outpost is still looking through its folders. Records and history are already checked."}
        </EmptyState>
      ) : (
        groups.map((group) => (
          <Group key={group.kind} kind={group.kind} items={group.items} more={data.more[group.kind]} onCleared={setLast} />
        ))
      )}
    </div>
  );
}
