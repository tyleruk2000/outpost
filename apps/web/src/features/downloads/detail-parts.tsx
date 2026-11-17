/** The pieces a download's details are built from: titled parts, lists of facts, the history, the region drawing. */
import type { DownloadDetail, DownloadEvent } from "@outpost/shared";
import { useQuery } from "@tanstack/react-query";
import { Check, Copy } from "lucide-react";
import { type ReactNode, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { copyText } from "@/lib/clipboard";
import { cn, timeAgo } from "@/lib/utils";
import { clockTimeWithSeconds, shortDate } from "./charts/time-axis";
import { describeEvents, regionDetail, regionExtent, type Tone } from "./plan-text";

/**
 * One titled part of the record. On a wide screen the title stands in its own column,
 * as on a printed data sheet; on a narrow one it sits above.
 */
export function Part({ title, note, children }: { title: string; note?: ReactNode; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="grid gap-x-10 gap-y-3 border-t border-border py-7 lg:grid-cols-[13rem_minmax(0,1fr)]">
      <div>
        <h2 id={id} className="text-lead font-semibold text-ink">
          {title}
        </h2>
        {note ? <p className="mt-1 text-small text-ink-muted">{note}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}

/** Facts as terms and their values. The term stands beside the value where there is room. */
export function Facts({ children, className }: { children: ReactNode; className?: string }) {
  return <dl className={cn("grid gap-x-6 gap-y-3.5 sm:grid-cols-[10.5rem_minmax(0,1fr)]", className)}>{children}</dl>;
}

export function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="contents">
      <dt className="text-small text-ink-muted max-sm:-mb-3">{term}</dt>
      <dd className="min-w-0 text-small text-ink">{children}</dd>
    </div>
  );
}

/** Text that has to be exact: an address, a path, a checksum. Wraps anywhere rather than overflow. */
export function Exact({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn("font-mono text-[0.8125rem] leading-5 break-all text-ink", className)}>{children}</span>;
}

/** A checksum with a button that copies it. */
export function Checksum({ value, name }: { value: string; name: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  return (
    <span className="flex items-start gap-2">
      <Exact className="min-w-0 flex-1 pt-1">{value}</Exact>
      <Button
        variant="ghost"
        size="icon-sm"
        className="-mt-0.5 shrink-0"
        aria-label={copied ? `Copied ${name}` : `Copy ${name}`}
        onClick={async () => {
          if (await copyText(value)) setCopied(true);
          else toast.error("The browser would not copy it. Select the checksum and copy it by hand.");
        }}
      >
        {copied ? <Check className="text-success" /> : <Copy />}
      </Button>
    </span>
  );
}

// ── What happened ───────────────────────────────────────────────────────────

// A step that went wrong but mended itself is a solid grey dot: amber is kept for the one step that is alive now.
const dot: Record<Tone, string> = {
  normal: "border-border-strong bg-page",
  alive: "border-lamp bg-lamp",
  success: "border-success bg-success",
  warning: "border-ink-faint bg-ink-faint",
  danger: "border-danger bg-danger",
};

/** "18:42:07" today; "14 Nov, 18:42:07" on any other day. */
function momentOf(at: number, now: number): string {
  const sameDay = new Date(at).toDateString() === new Date(now).toDateString();
  return sameDay ? clockTimeWithSeconds(at) : `${shortDate(at)}, ${clockTimeWithSeconds(at)}`;
}

/** Past this many, the middle of a long history is folded away until asked for. */
const FOLD_OVER = 12;
const KEPT_FIRST = 2;
const KEPT_LAST = 7;

/**
 * A download's history as a connected line of steps, oldest first, so it reads as the
 * story of what happened. The last step is where things stand; it is lit while the
 * download is alive.
 */
export function History({ events, alive, now }: { events: DownloadEvent[]; alive: boolean; now: number }) {
  const [unfolded, setUnfolded] = useState(false);
  const lines = describeEvents(events);
  if (lines.length === 0)
    return (
      <p className="text-small text-ink-muted">
        Nothing was recorded for this download. Downloads started by an older version of Outpost have no history.
      </p>
    );

  const folded = !unfolded && lines.length > FOLD_OVER;
  const hidden = folded ? lines.length - KEPT_FIRST - KEPT_LAST : 0;
  const shown = folded ? [...lines.slice(0, KEPT_FIRST), null, ...lines.slice(-KEPT_LAST)] : lines;
  const lastAt = lines[lines.length - 1]!.at;

  return (
    <ol>
      {shown.map((line, index) => {
        const last = index === shown.length - 1;
        if (line === null) {
          return (
            <li key="fold" className="relative pb-5 pl-7">
              <span aria-hidden className="absolute top-0 bottom-0 left-[4.5px] w-px bg-border" />
              <Button variant="link" size="sm" onClick={() => setUnfolded(true)}>
                Show {hidden} more steps
              </Button>
            </li>
          );
        }
        const tone: Tone = last && alive && line.at === lastAt ? "alive" : line.tone;
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: steps are an ordered record and two can share a millisecond
          <li key={`${line.at}-${index}`} className={cn("relative pl-7", last ? "pb-0" : "pb-5")}>
            {last ? null : <span aria-hidden className="absolute top-3 bottom-[-0.25rem] left-[4.5px] w-px bg-border" />}
            <span aria-hidden className={cn("absolute top-[0.4rem] left-0 size-2.5 rounded-full border-[1.5px]", dot[tone])} />
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className={cn("text-small font-medium", line.tone === "danger" ? "text-danger" : "text-ink")}>{line.title}</span>
              <time dateTime={new Date(line.at).toISOString()} className="tabular text-small text-ink-muted">
                {momentOf(line.at, now)}
                <span aria-hidden className="mx-1.5 text-border-strong">
                  /
                </span>
                {timeAgo(line.at)}
              </time>
            </p>
            {line.detail ? <p className="mt-0.5 max-w-[68ch] text-small text-ink-muted">{line.detail}</p> : null}
          </li>
        );
      })}
    </ol>
  );
}

// ── Map regions ─────────────────────────────────────────────────────────────

interface LandShapes {
  features: Array<{ geometry: { type: "Polygon"; coordinates: number[][][] } | { type: "MultiPolygon"; coordinates: number[][][][] } }>;
}

const MAP_WIDTH = 320;
const MAP_HEIGHT = 160;
const mapX = (longitude: number) => ((longitude + 180) / 360) * MAP_WIDTH;
const mapY = (latitude: number) => ((90 - latitude) / 180) * MAP_HEIGHT;

/** The world's coastlines as one SVG path, plainly projected: longitude across, latitude down. */
export function landPath(land: LandShapes): string {
  const ring = (points: number[][]) =>
    `M${points.map(([longitude, latitude]) => `${mapX(longitude!).toFixed(1)},${mapY(latitude!).toFixed(1)}`).join("L")}Z`;
  return land.features
    .flatMap((feature) => (feature.geometry.type === "Polygon" ? [feature.geometry.coordinates] : feature.geometry.coordinates))
    .map((polygon) => polygon.map(ring).join(""))
    .join("");
}

/** Where the region lies on the world: the box drawn over a plain outline of the land. Drawn only once the outline has loaded. */
function RegionOutline({ bbox }: { bbox: readonly [number, number, number, number] }) {
  // A file the app serves itself; it never changes while the app is open.
  const land = useQuery({
    queryKey: ["world-outline"],
    queryFn: async () => landPath((await (await fetch("/world/land.json")).json()) as LandShapes),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  if (!land.data) return null;
  const [west, south, east, north] = bbox;
  // A valley would be a speck at this scale, so the box is never drawn smaller than it can be seen.
  const width = Math.max(6, mapX(east) - mapX(west));
  const height = Math.max(6, mapY(south) - mapY(north));
  const x = (mapX(west) + mapX(east)) / 2 - width / 2;
  const y = (mapY(north) + mapY(south)) / 2 - height / 2;
  return (
    <svg
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label={`The region on a map of the world: ${regionExtent(bbox)}`}
      className="mt-4 block w-full max-w-[26rem] rounded-control border border-border bg-surface"
    >
      <path d={land.data} className="fill-surface-strong stroke-border-strong" strokeWidth={0.4} />
      <rect x={x} y={y} width={width} height={height} rx={1} className="fill-primary/20 stroke-primary" strokeWidth={1.25} />
    </svg>
  );
}

export function Region({ region }: { region: NonNullable<DownloadDetail["region"]> }) {
  return (
    <>
      <Facts>
        <Fact term="Area">
          <Exact>{regionExtent(region.bbox)}</Exact>
        </Fact>
        <Fact term="Detail">{regionDetail(region)}</Fact>
        {region.sourceBuild ? (
          <Fact term="Map data from">
            <span className="tabular">The source's build of {region.sourceBuild}</span>
          </Fact>
        ) : null}
      </Facts>
      <RegionOutline bbox={region.bbox} />
    </>
  );
}
