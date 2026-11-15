/** What a removal will do, shown before it is confirmed: by kind, by location, and what stays. */
import { type CleanupPlan, formatBytes, type NamedFile } from "@outpost/shared";
import { CircleAlert } from "lucide-react";
import { Notice } from "@/components/page";
import { Skeleton } from "@/components/ui/misc";
import { plural } from "@/lib/utils";
import { kindNames, kindOrder, tallyText } from "./manage-text";

export function FileList({ files, more }: { files: NamedFile[]; more: number }) {
  return (
    <>
      <ul className="mt-1.5 grid gap-1.5">
        {files.map((file) => (
          <li key={`${file.path}:${file.title}`} className="text-small">
            <span className="font-medium text-ink">{file.title}</span>{" "}
            <span className="tabular text-ink-muted">
              {formatBytes(file.bytes)}, on “{file.locationName}”
            </span>
            <span className="block font-mono text-[0.8125rem] break-all text-ink-muted">{file.path}</span>
          </li>
        ))}
      </ul>
      {more > 0 ? <p className="mt-1.5 text-small text-ink-muted">And {plural(more, "more item")}.</p> : null}
    </>
  );
}

export function PlanSkeleton() {
  return (
    <div className="grid gap-2" aria-busy>
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-20" />
    </div>
  );
}

/** The two small tables every summary has: what goes, by kind, and where it goes from. */
export function PlanTables({ plan }: { plan: CleanupPlan }) {
  const kinds = [...plan.byKind].sort((a, b) => kindOrder.indexOf(a.kind) - kindOrder.indexOf(b.kind));
  return (
    <div className="grid gap-4">
      {kinds.length > 0 ? (
        <table className="w-full text-small">
          <caption className="mb-1 text-left font-semibold text-ink">What will be deleted</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Kind</th>
              <th scope="col">Items</th>
              <th scope="col">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-y border-border">
            {kinds.map((bucket) => (
              <tr key={bucket.kind}>
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                  {bucket.count === 1 ? kindNames[bucket.kind].one : kindNames[bucket.kind].many}
                </th>
                <td className="tabular py-1.5 pr-3 text-right text-ink-muted">{bucket.count}</td>
                <td className="tabular py-1.5 text-right font-medium whitespace-nowrap text-ink">{formatBytes(bucket.bytes)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {plan.byLocation.length > 0 ? (
        <table className="w-full text-small">
          <caption className="mb-1 text-left font-semibold text-ink">Where</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Location</th>
              <th scope="col">Deleted</th>
              <th scope="col">Stays</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border border-y border-border">
            {plan.byLocation.map((location) => (
              <tr key={location.locationId} className="align-top">
                <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink">
                  {location.name}
                  {location.available ? null : <span className="block text-warning">Not connected</span>}
                </th>
                <td className="tabular py-1.5 text-right text-ink">
                  {location.remove.count > 0 ? `${tallyText(location.remove)} deleted` : null}
                  {location.stays.count > 0 ? <span className="block text-ink-muted">{tallyText(location.stays)} stay on it</span> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

export function RefusedNotice({ refused }: { refused: CleanupPlan["refused"] }) {
  if (refused.length === 0) return null;
  return (
    <Notice tone="warning" icon={<CircleAlert />} title={`${plural(refused.length, "item")} will be left alone`}>
      <ul className="grid gap-1">
        {refused.slice(0, 8).map((entry) => (
          <li key={entry.key}>
            <span className="font-medium">{entry.title}</span> <span className="text-ink-muted">{entry.reason}</span>
          </li>
        ))}
      </ul>
      {refused.length > 8 ? <p className="mt-1 text-ink-muted">And {refused.length - 8} more.</p> : null}
    </Notice>
  );
}
