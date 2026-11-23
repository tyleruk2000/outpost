/**
 * The Offline tab of Maps: only what needs the map in view. What covers the view now, adding
 * an area by drawing it (or from the ready-made list), satellite pictures of an area, and
 * keeping the view on this device. Everything else kept for the map (place names, roads for
 * routes, places to find, country files) is on Map data, one link away.
 */
import { ACTIVE_DOWNLOAD_STATES, type Bbox, type DownloadDto, formatBytes, type InstalledRegion, type MapOverview } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, SquareDashedMousePointer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { ErrorState, Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { useDownloads } from "@/features/downloads/use-downloads";
import { KeepAreaSection } from "@/features/kept/keep-controls";
import { ImageryArea, SatelliteSection } from "../imagery/panel";
import type { MapEngine } from "../map/engine";
import { PanelHeading, PanelLoading } from "../ui";
import { AddRegion, detailLabel } from "./add-region";

/** What the panel was opened to do, when it was opened from elsewhere on the screen. */
export type OfflineIntent = { type: "add"; presetId?: string; draw?: boolean } | { type: "imagery" } | null;

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

function ActiveDownloads({ downloads }: { downloads: DownloadDto[] }) {
  if (downloads.length === 0) return null;
  return (
    <ul className="divide-y divide-border border-y border-border" aria-label="Downloads in progress">
      {downloads.map((download) => (
        <li key={download.id} className="py-3">
          <p className="min-w-0 text-small font-medium text-ink">{download.title}</p>
          <DownloadProgress download={download} className="mt-2" />
          <DownloadControls download={download} className="mt-1 -ml-2" />
        </li>
      ))}
    </ul>
  );
}

function CoverRow({ region }: { region: InstalledRegion }) {
  const terrain = region.tileType === "terrain";
  const trouble = !region.available
    ? "The drive holding this is not connected"
    : region.status === "missing"
      ? "The file is missing"
      : region.status === "damaged"
        ? "The file is damaged"
        : region.status === "moving"
          ? "Being moved"
          : null;
  return (
    <li className="py-2.5">
      <p className="font-title text-body text-ink">{region.name}</p>
      <p className="tabular text-small text-ink-muted">
        <Joined
          parts={[
            terrain ? "Hills and heights" : `${detailLabel(region.maxZoom)}, to zoom ${region.maxZoom}`,
            formatBytes(region.sizeBytes),
          ]}
        />
      </p>
      {trouble ? (
        <Badge tone="warning" className="mt-1">
          <CircleAlert aria-hidden /> {trouble}
        </Badge>
      ) : null}
    </li>
  );
}

/** The maps and terrain whose area meets the view, kept up to date as the map moves. */
function useCovering(engine: MapEngine | null, regions: InstalledRegion[]): InstalledRegion[] {
  const [view, setView] = useState<Bbox | null>(() => engine?.getBounds() ?? null);
  useEffect(() => {
    if (!engine) return;
    setView(engine.getBounds());
    return engine.on("moveend", () => setView(engine.getBounds()));
  }, [engine]);
  if (!view) return regions;
  return regions.filter((region) => overlaps(region.bounds, view));
}

export function OfflinePanel({
  overview,
  engine,
  intent,
  onIntentHandled,
  onNeedMap,
  onNeedRoom,
}: {
  overview: UseQueryResult<MapOverview>;
  engine: MapEngine | null;
  intent: OfflineIntent;
  onIntentHandled: () => void;
  /** Asks the screen to uncover the map (on a phone, lowers the sheet). */
  onNeedMap: () => void;
  /** Asks the screen for as much room as it can give (on a phone, raises the sheet). */
  onNeedRoom: () => void;
}) {
  const downloads = useDownloads();
  const [adding, setAdding] = useState<{ presetId?: string; draw?: boolean } | null>(null);
  const imageryRef = useRef<HTMLElement>(null);
  const [choosingImagery, setChoosingImagery] = useState(false);
  const covering = useCovering(engine, overview.data?.regions ?? []);

  useEffect(() => {
    if (!intent) return;
    if (intent.type === "add") setAdding({ presetId: intent.presetId, draw: intent.draw });
    if (intent.type === "imagery") {
      setAdding(null);
      window.setTimeout(() => imageryRef.current?.scrollIntoView({ block: "start" }), 0);
    }
    onIntentHandled();
  }, [intent, onIntentHandled]);

  if (adding) {
    return (
      <AddRegion
        engine={engine}
        initialPresetId={adding.presetId}
        initialMode={adding.draw ? "draw" : "list"}
        onClose={() => setAdding(null)}
        onNeedMap={onNeedMap}
        onNeedRoom={onNeedRoom}
      />
    );
  }

  if (choosingImagery) {
    return <ImageryArea engine={engine} onClose={() => setChoosingImagery(false)} onNeedMap={onNeedMap} onNeedRoom={onNeedRoom} />;
  }

  if (overview.isPending) return <PanelLoading />;
  if (overview.isError) {
    return (
      <div className="p-4">
        <ErrorState error={overview.error} onRetry={() => overview.refetch()} />
      </div>
    );
  }

  const mapDownloads = (downloads.data ?? []).filter(
    (download) =>
      (download.kind === "map" || download.kind === "terrain") &&
      (ACTIVE_DOWNLOAD_STATES.includes(download.state) || download.state === "failed"),
  );
  const nothingYet = overview.data.regions.length === 0;

  return (
    <div className="scroll-quiet grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-6 overflow-y-auto px-4 py-4">
      <section aria-label="What covers this view">
        <PanelHeading>What covers this view</PanelHeading>
        {covering.length > 0 ? (
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {covering.map((region) => (
              <CoverRow key={region.id} region={region} />
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-small text-ink-muted">
            {nothingYet
              ? "No detailed maps yet. Outpost draws coastlines and borders until an area is added, and it then works with no connection."
              : "No downloaded map covers this view, so only coastlines and borders are drawn here."}
          </p>
        )}
        {mapDownloads.length > 0 ? (
          <div className="mt-3">
            <ActiveDownloads downloads={mapDownloads} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant={nothingYet ? "primary" : "secondary"} onClick={() => setAdding({ draw: true })}>
            <SquareDashedMousePointer /> Add an area by drawing
          </Button>
          <Button variant="ghost" onClick={() => setAdding({})}>
            Choose from a list
          </Button>
        </div>
        {/* Near the top: place names, roads and the rest are one press away, not under three sections. */}
        <p className="mt-4 text-small text-ink-muted">
          <Link
            to="/maps/data"
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline decoration-1 underline-offset-2 hover:decoration-2 md:min-h-8"
          >
            All map data <ArrowRight aria-hidden className="size-4" />
          </Link>
          <span className="block">
            Place names, roads for routes, places to find and country files, by country, with where each is kept.
          </span>
        </p>
      </section>

      <SatelliteSection engine={engine} onChooseArea={() => setChoosingImagery(true)} sectionRef={imageryRef} />
      <KeepAreaSection engine={engine} />
    </div>
  );
}
