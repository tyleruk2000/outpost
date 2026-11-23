import { formatBytes, type StorageLocation, type StorageUsage } from "@outpost/shared";
import { cn } from "@/lib/utils";

/**
 * Content kinds, in the order they are stacked, with their label and pattern-free colour. Everything
 * Offline maps holds (maps, hills, place names, nearby places, source files) is one kind, as it is
 * managed in one place; `kinds` are the server's kinds it adds up.
 */
export const usageKinds: Array<{ kind: string; kinds: string[]; label: string; color: string }> = [
  { kind: "zim", kinds: ["zim"], label: "Reference collections", color: "var(--primary)" },
  { kind: "maps", kinds: ["map", "terrain", "places", "layer", "extract"], label: "Offline maps", color: "oklch(0.62 0.11 150)" },
  { kind: "document", kinds: ["document"], label: "Documents", color: "var(--lamp)" },
  { kind: "file", kinds: ["file"], label: "Books and other files", color: "oklch(0.6 0.09 30)" },
  { kind: "model", kinds: ["model"], label: "Search models", color: "oklch(0.58 0.07 250)" },
  { kind: "dataset", kinds: ["dataset"], label: "Radio data", color: "var(--chart-other)" },
];

/** The bytes and items of one of `usageKinds` in a location's usage. */
export function usageOf(entry: (typeof usageKinds)[number], usage?: Pick<StorageUsage, "byKind">) {
  return entry.kinds.reduce(
    (sum, kind) => ({ bytes: sum.bytes + (usage?.byKind[kind]?.bytes ?? 0), count: sum.count + (usage?.byKind[kind]?.count ?? 0) }),
    { bytes: 0, count: 0 },
  );
}

type BarLocation = Pick<StorageLocation, "totalBytes" | "freeBytes" | "name">;

/** The parts of a location's bar, in order: what Outpost holds by kind, then what else is on the drive. */
export function storageSegments(location: BarLocation, usage?: StorageUsage) {
  const total = location.totalBytes ?? 0;
  const free = location.freeBytes ?? 0;
  const other = Math.max(0, total - free - (usage?.totalBytes ?? 0));
  return [
    ...usageKinds.map((entry) => ({ ...entry, bytes: usageOf(entry, usage).bytes })).filter((entry) => entry.bytes > 0),
    { kind: "other", label: "Other files on this drive", color: "var(--border-strong)", bytes: other },
  ].filter((segment) => segment.bytes > 0);
}

/**
 * The key to a location's bar, in words: each part's name and size, so that what the colours mean does not
 * depend on pointing at them (the parts' names were only in hover titles). Free space is said beside the bar.
 */
export function StorageKey({ location, usage, className }: { location: BarLocation; usage?: StorageUsage; className?: string }) {
  if ((location.totalBytes ?? 0) <= 0) return null;
  const segments = storageSegments(location, usage);
  if (segments.length === 0) return null;
  return (
    <ul aria-label={`What is on ${location.name}`} className={cn("flex flex-wrap gap-x-4 gap-y-0.5 text-micro text-ink-muted", className)}>
      {segments.map((segment) => (
        <li key={segment.kind} className="flex items-center gap-1.5">
          <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: segment.color }} />
          <span>{segment.label}</span>
          <span className="tabular text-ink">{formatBytes(segment.bytes)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Capacity of a location as one bar: what Outpost holds (by kind), what else is on the
 * drive, and what is free. Widths are true proportions; a sliver gets a 2px minimum so
 * it stays visible.
 */
export function StorageBar({ location, usage, className }: { location: BarLocation; usage?: StorageUsage; className?: string }) {
  const total = location.totalBytes ?? 0;
  const free = location.freeBytes ?? 0;
  if (total <= 0) return <div className={cn("h-2 rounded-full bg-surface-strong", className)} aria-hidden />;
  const segments = storageSegments(location, usage);

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
