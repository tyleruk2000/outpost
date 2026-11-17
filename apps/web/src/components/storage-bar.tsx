import { formatBytes, type StorageLocation, type StorageUsage } from "@outpost/shared";
import { cn } from "@/lib/utils";

/** Content kinds, in the order they are stacked, with their label and pattern-free colour. */
export const usageKinds: Array<{ kind: string; label: string; color: string }> = [
  { kind: "zim", label: "Reference collections", color: "var(--primary)" },
  { kind: "map", label: "Maps", color: "oklch(0.62 0.11 150)" },
  { kind: "terrain", label: "Terrain", color: "oklch(0.7 0.08 120)" },
  { kind: "document", label: "Documents", color: "var(--lamp)" },
  { kind: "places", label: "Place names", color: "oklch(0.62 0.1 285)" },
  { kind: "file", label: "Books and other files", color: "oklch(0.6 0.09 30)" },
  { kind: "model", label: "Search models", color: "oklch(0.58 0.07 250)" },
  { kind: "dataset", label: "Radio data", color: "var(--chart-other)" },
];

/**
 * Capacity of a location as one bar: what Outpost holds (by kind), what else is on the
 * drive, and what is free. Widths are true proportions; a sliver gets a 2px minimum so
 * it stays visible.
 */
export function StorageBar({
  location,
  usage,
  className,
}: {
  location: Pick<StorageLocation, "totalBytes" | "freeBytes" | "name">;
  usage?: StorageUsage;
  className?: string;
}) {
  const total = location.totalBytes ?? 0;
  const free = location.freeBytes ?? 0;
  if (total <= 0) return <div className={cn("h-2 rounded-full bg-surface-strong", className)} aria-hidden />;
  const ours = usage?.totalBytes ?? 0;
  const other = Math.max(0, total - free - ours);
  const segments = [
    ...usageKinds.map((entry) => ({ ...entry, bytes: usage?.byKind[entry.kind]?.bytes ?? 0 })).filter((entry) => entry.bytes > 0),
    { kind: "other", label: "Other files on this drive", color: "var(--border-strong)", bytes: other },
  ].filter((segment) => segment.bytes > 0);

  const summary = `${location.name}: ${formatBytes(total - free)} used of ${formatBytes(total)}, ${formatBytes(free)} free`;
  return (
    <div role="img" aria-label={summary} className={cn("flex h-2 w-full gap-px overflow-hidden rounded-full bg-surface-strong", className)}>
      {segments.map((segment) => (
        <div
          key={segment.kind}
          title={`${segment.label}: ${formatBytes(segment.bytes)}`}
          style={{ width: `${(segment.bytes / total) * 100}%`, background: segment.color, minWidth: 2 }}
        />
      ))}
    </div>
  );
}
