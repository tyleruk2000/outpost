import { type DownloadPlanLocation, formatBytes } from "@outpost/shared";
import { TriangleAlert } from "lucide-react";
import { memo, useState } from "react";
import { Link } from "react-router";
import { cn } from "@/lib/utils";
import { manageLink } from "../manage/manage-data";
import { ChartTooltip, TooltipValue } from "./charts/chart-tooltip";
import { useWidth } from "./charts/use-width";
import { Swatch } from "./plan-timeline";

interface Part {
  key: "used" | "arriving" | "free";
  label: string;
  bytes: number;
  fill: string;
}

/** How one drive is split once the queue has arrived. Exported for its tests. */
export function driveParts(location: Pick<DownloadPlanLocation, "totalBytes" | "freeBytes" | "pendingBytes">): Part[] | null {
  const { totalBytes: total, freeBytes: free } = location;
  if (total === null || free === null || total <= 0) return null;
  return [
    { key: "used", label: "used now", bytes: Math.max(0, total - free), fill: "bg-chart-other" },
    { key: "arriving", label: "arriving", bytes: Math.min(location.pendingBytes, free), fill: "bg-chart-1" },
    { key: "free", label: "free afterwards", bytes: Math.max(0, free - location.pendingBytes), fill: "bg-surface-strong" },
  ];
}

function Drive({ location }: { location: DownloadPlanLocation }) {
  const [frame, width] = useWidth<HTMLDivElement>();
  const [open, setOpen] = useState(false);
  const parts = driveParts(location);
  const total = location.totalBytes ?? 0;
  const short = location.freeAfterBytes !== null && location.freeAfterBytes < 0 ? -location.freeAfterBytes : 0;
  const words = parts
    ? `${location.name}: ${parts.map((part) => `${formatBytes(part.bytes)} ${part.label}`).join(", ")}`
    : `${location.name}: ${formatBytes(location.pendingBytes)} arriving`;

  return (
    <li className="py-3.5 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h4 className="text-small font-medium text-ink">{location.name}</h4>
        {location.totalBytes !== null ? (
          <p className="tabular text-small text-ink-muted">{formatBytes(location.totalBytes)} in all</p>
        ) : null}
      </div>

      {parts ? (
        <div ref={frame} className="relative mt-2">
          <div
            role="img"
            aria-label={words}
            // biome-ignore lint/a11y/noNoninteractiveTabindex: focus shows the same figures the pointer gets
            tabIndex={0}
            className="flex h-2 w-full gap-0.5 rounded-full outline-offset-4"
            onPointerEnter={() => setOpen(true)}
            onPointerLeave={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
          >
            {parts
              .filter((part) => part.bytes > 0)
              .map((part) => (
                <span
                  key={part.key}
                  className={cn("h-full min-w-[3px] first:rounded-l-full last:rounded-r-full", part.fill)}
                  style={{ flexGrow: part.bytes / total, flexBasis: 0 }}
                />
              ))}
          </div>
          {open ? (
            <ChartTooltip x={0} y={0} frameWidth={width} above>
              {parts.map((part) => (
                <TooltipValue
                  key={part.key}
                  value={formatBytes(part.bytes)}
                  label={
                    <span className="inline-flex items-center gap-1.5">
                      <Swatch className={part.fill} edged={part.key === "free"} /> {part.label}
                    </span>
                  }
                />
              ))}
            </ChartTooltip>
          ) : null}
        </div>
      ) : null}

      {!location.available ? (
        <p className="mt-2 flex items-start gap-2 text-small text-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="text-ink">
            Not connected. <span className="tabular">{formatBytes(location.pendingBytes)}</span> is waiting to go here and will not arrive
            until it is back.
          </span>
        </p>
      ) : parts ? (
        <p className="mt-2 flex flex-wrap gap-x-5 gap-y-0.5 text-small text-ink-muted">
          {parts.map((part) => (
            <span key={part.key} className="inline-flex items-center gap-2">
              <Swatch className={part.fill} edged={part.key === "free"} />
              <span>
                <span className="tabular font-medium text-ink">{formatBytes(part.bytes)}</span> {part.label}
              </span>
            </span>
          ))}
        </p>
      ) : (
        <p className="mt-1 text-small text-ink-muted">
          <span className="tabular font-medium text-ink">{formatBytes(location.pendingBytes)}</span> arriving. The free space here could not
          be measured.
        </p>
      )}

      {location.available && !location.enough ? (
        <p className="mt-2 flex items-start gap-2 text-small text-warning">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span className="text-ink">
            <span className="font-semibold text-warning">This will not fit.</span> The queue needs{" "}
            <span className="tabular">{formatBytes(location.pendingBytes)}</span> here and{" "}
            <span className="tabular">{formatBytes(location.freeBytes)}</span> is free:{" "}
            <span className="tabular">{formatBytes(short)}</span> short.{" "}
            <Link to={manageLink()} className="text-primary underline underline-offset-2">
              Free up space
            </Link>
            , or cancel or move something, before the drive fills.
          </span>
        </p>
      ) : null}
    </li>
  );
}

/**
 * Where the queue will land: each storage location that has something on its way, as
 * one bar of the whole drive split into what is used now, what is arriving and what
 * will be left, with the same figures in words.
 */
export const PlanStorage = memo(function PlanStorage({ locations }: { locations: DownloadPlanLocation[] }) {
  const pending = locations.filter((location) => location.pendingBytes > 0);
  if (pending.length === 0) return null;
  return (
    <section aria-labelledby="plan-storage-title" className="min-w-0">
      <h3 id="plan-storage-title" className="mb-3 text-body font-semibold text-ink">
        Where it will go
      </h3>
      <ul className="divide-y divide-border">
        {pending.map((location) => (
          <Drive key={location.locationId} location={location} />
        ))}
      </ul>
    </section>
  );
});
