/**
 * What is taking the space: by kind of thing, then by where it is. The figures are a
 * table; the bar beside each is the same number drawn, so sizes can be compared at a
 * glance. One hue, because the bars differ only in length.
 */
import { formatBytes, type StorageUsage, type UsageLocation, type UsageResponse, type UsageRow } from "@outpost/shared";
import { Check, CircleAlert, RefreshCw } from "lucide-react";
import { Link } from "react-router";
import { ErrorState, Notice, Section } from "@/components/page";
import { StorageBar } from "@/components/storage-bar";
import { Button } from "@/components/ui/button";
import { Badge, Skeleton, Spinner, Tooltip } from "@/components/ui/misc";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { cn, plural, timeAgo } from "@/lib/utils";
import { manageLink, useMeasure, useUsage } from "./manage-data";
import { groupRows, standalone, tallyText, usageGroups, usageNames, usageNote, usageTotal } from "./manage-text";

const basisWords: Record<UsageRow["basis"], string> = {
  records: "From Outpost's records of what was installed",
  disk: "Measured from the files",
  estimate: "Worked out from what the database holds",
};

function SizeBar({ row, largest, total }: { row: UsageRow; largest: number; total: number }) {
  if (row.bytes === null || row.bytes <= 0 || largest <= 0) return <div className="h-2" aria-hidden />;
  const away = Math.min(row.disconnectedBytes, row.bytes);
  const share = total > 0 ? (row.bytes / total) * 100 : 0;
  const label = `${row.within ? "Part of the database. " : `${share < 1 ? "Under 1" : Math.round(share)}% of everything Outpost stores. `}${basisWords[row.basis]}.`;
  return (
    <Tooltip label={label} side="top">
      <div aria-hidden className="flex h-2 w-full gap-0.5">
        <div
          className={cn("h-full min-w-0.5 rounded-r-[4px]", row.within ? "bg-(--chart-seq-2)" : "bg-(--chart-seq-4)")}
          style={{ width: `${((row.bytes - away) / largest) * 100}%`, display: row.bytes - away > 0 ? undefined : "none" }}
        />
        {away > 0 ? (
          // Known only from records: the drive is away. Lighter, so it reads as "as last seen".
          <div className="h-full min-w-0.5 rounded-r-[4px] bg-(--chart-seq-2)" style={{ width: `${(away / largest) * 100}%` }} />
        ) : null}
      </div>
    </Tooltip>
  );
}

function KindTable({ usage }: { usage: UsageResponse }) {
  const top = standalone(usage.rows);
  const largest = Math.max(0, ...top.map((row) => row.bytes ?? 0));
  const total = usageTotal(usage).bytes;
  return (
    <table className="w-full text-small">
      <caption className="sr-only">Space used by each kind of thing Outpost stores</caption>
      <thead className="sr-only">
        <tr>
          <th scope="col">Kind</th>
          <th scope="col">Share</th>
          <th scope="col">Size</th>
        </tr>
      </thead>
      {usageGroups.map((group) => {
        const rows = groupRows(group, usage.rows);
        if (rows.length === 0) return null;
        return (
          <tbody key={group.title} className="border-b border-border">
            <tr>
              <th scope="rowgroup" colSpan={3} className="pt-5 pb-1.5 text-left font-normal">
                <span className="font-semibold text-ink">{group.title}</span>{" "}
                <span className="text-ink-muted max-md:block">{group.description}</span>
              </th>
            </tr>
            {rows.map((row) => {
              const note = usageNote(row);
              return (
                <tr key={row.id} className="border-t border-border align-top">
                  <th scope="row" className={cn("py-2.5 pr-4 text-left font-normal md:w-[42%]", row.within && "pl-5")}>
                    <span className="text-ink">{usageNames[row.id]}</span>
                    {note ? <span className="block text-ink-muted">{note}</span> : null}
                    <span className="mt-1.5 block md:hidden">
                      <SizeBar row={row} largest={largest} total={total} />
                    </span>
                  </th>
                  <td className="py-2.5 pr-4 align-middle max-md:hidden">
                    <SizeBar row={row} largest={largest} total={total} />
                  </td>
                  <td className="tabular w-28 py-2.5 text-right font-medium whitespace-nowrap text-ink">
                    {row.bytes === null ? (
                      <span className="inline-flex items-center gap-1.5 font-normal text-ink-muted">
                        <Spinner className="size-3.5" label="Counting" /> Counting
                      </span>
                    ) : (
                      <>
                        {row.basis === "estimate" && row.bytes > 0 ? <span className="font-normal text-ink-muted">about </span> : null}
                        {formatBytes(row.bytes)}
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </table>
  );
}

/** The location's records in the shape the capacity bar already draws. */
function asStorageUsage(location: UsageLocation): StorageUsage {
  const byKind: StorageUsage["byKind"] = {};
  for (const bucket of location.byKind) {
    // A catalogue sheet is a document in the library; it is drawn with the documents.
    const kind = bucket.kind === "sheet" ? "document" : bucket.kind;
    const entry = byKind[kind] ?? { bytes: 0, count: 0 };
    entry.bytes += bucket.bytes;
    entry.count += bucket.count;
    byKind[kind] = entry;
  }
  return { locationId: location.id, byKind, totalBytes: location.recorded.bytes };
}

function LocationRow({ location, measuring }: { location: UsageLocation; measuring: boolean }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="text-body font-semibold text-ink">{location.name}</h3>
        {location.available ? (
          <Badge tone="success">
            <Check aria-hidden /> Connected
          </Badge>
        ) : (
          <Badge tone="warning">
            <CircleAlert aria-hidden /> Disconnected
          </Badge>
        )}
      </div>
      <p className="mt-0.5 font-mono text-[0.8125rem] break-all text-ink-muted">{location.path}</p>
      {location.available ? (
        <>
          <StorageBar location={location} usage={asStorageUsage(location)} className="mt-3" />
          <p className="tabular mt-2 text-small text-ink-muted">
            <span className="font-semibold text-ink">{formatBytes(location.freeBytes)}</span> free of {formatBytes(location.totalBytes)}.
            Outpost has {location.recorded.count === 0 ? "nothing" : tallyText(location.recorded)} here
            {location.measuredBytes !== null
              ? `; its folders hold ${formatBytes(location.measuredBytes)} on disk.`
              : measuring
                ? "; its folders are still being counted."
                : "."}
          </p>
        </>
      ) : (
        <p className="mt-2 max-w-[70ch] text-small text-ink">
          Not connected, so nothing here can be measured or deleted. What Outpost last knew, {timeAgo(location.lastSeenAt)}:{" "}
          <span className="tabular">
            {location.recorded.count === 0 ? "nothing of its own here" : tallyText(location.recorded)}
            {location.totalBytes !== null && location.freeBytes !== null
              ? `, with ${formatBytes(location.freeBytes)} free of ${formatBytes(location.totalBytes)}`
              : ""}
            .
          </span>
        </p>
      )}
    </li>
  );
}

export default function SpaceView() {
  const usage = useUsage();
  const measure = useMeasure();

  if (usage.isPending) {
    return (
      <div className="mt-6 grid gap-3" aria-busy>
        <Skeleton className="h-6 w-2/3" />
        <Skeleton className="h-40" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (usage.isError) {
    return (
      <div className="mt-6">
        <ErrorState error={usage.error} onRetry={() => usage.refetch()} />
      </div>
    );
  }

  const data = usage.data;
  const total = usageTotal(data);
  const content = data.locations.reduce((sum, location) => sum + location.recorded.bytes, 0);
  const away = data.locations.filter((location) => !location.available);
  const leftover = data.rows
    .filter((row) => ["unfinished", "untracked", "previous"].includes(row.id))
    .reduce((sum, row) => sum + (row.bytes ?? 0), 0);

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <p className="max-w-[54ch] text-body text-pretty text-ink">
          Outpost is storing{" "}
          <span className="tabular font-semibold">
            {total.counting ? "at least " : ""}
            {formatBytes(total.bytes)}
          </span>
          : {formatBytes(content)} of content on {plural(data.locations.length, "storage location")}, and the rest in its own folder.
          {leftover > 0 ? (
            <>
              {" "}
              <Link to={manageLink("leftovers")} className="text-primary underline underline-offset-2">
                {formatBytes(leftover)} of it is left over
              </Link>{" "}
              and can be cleared.
            </>
          ) : null}
        </p>
        <div className="flex flex-col gap-1 md:items-end">
          <Button
            onClick={() => measure.mutate(undefined, { onError: (error) => notify.error(errorMessage(error)) })}
            loading={measure.isPending || data.measuring}
          >
            {measure.isPending || data.measuring ? null : <RefreshCw />} Count again
          </Button>
          <p className="text-small text-ink-muted" aria-live="polite">
            {data.measuring
              ? data.measuredAt
                ? `Counting what is on disk. Figures are from ${timeAgo(data.measuredAt)}.`
                : "Counting what is on disk for the first time."
              : data.measuredAt
                ? `Measured ${timeAgo(data.measuredAt)}.`
                : "Not measured yet."}
          </p>
        </div>
      </div>

      {away.length > 0 ? (
        <Notice tone="warning" icon={<CircleAlert />} className="mt-5" title={`${plural(away.length, "storage location")} not connected`}>
          {away.map((location) => `“${location.name}”`).join(", ")}: figures for what is stored there are what Outpost last knew, and are
          drawn lighter in the bars below.
        </Notice>
      ) : null}

      <Section
        title="By kind"
        description="Sizes of installed content come from Outpost's records. The rest is measured from disk, or estimated where it says so."
      >
        <KindTable usage={data} />
      </Section>

      <Section title="By location" description="Where it is, and how much room is left there.">
        <ul className="divide-y divide-border border-y border-border">
          {data.locations.map((location) => (
            <LocationRow key={location.id} location={location} measuring={data.measuring} />
          ))}
          <li className="py-4">
            <h3 className="text-body font-semibold text-ink">Outpost's own folder</h3>
            <p className="mt-0.5 font-mono text-[0.8125rem] break-all text-ink-muted">{data.dataDir.path}</p>
            <p className="tabular mt-2 text-small text-ink-muted">
              {data.dataDir.freeBytes !== null ? (
                <>
                  <span className="font-semibold text-ink">{formatBytes(data.dataDir.freeBytes)}</span> free of{" "}
                  {formatBytes(data.dataDir.totalBytes)} on its disk.{" "}
                </>
              ) : null}
              {data.dataDir.measuredBytes !== null
                ? `The database, extracted text and caches take ${formatBytes(data.dataDir.measuredBytes)}.`
                : "The database, extracted text and caches are still being counted."}
            </p>
          </li>
        </ul>
      </Section>
    </div>
  );
}
