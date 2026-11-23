/**
 * The Offline tab of Maps: only what needs the map in view. What covers the view now; "Add this
 * view" (or an area drawn on the map), which opens Add a place on Offline maps with that area,
 * where its map and its satellite pictures are ticks; keeping the view on this device; and one
 * link to Offline maps, the one place map data is managed.
 */
import { ACTIVE_DOWNLOAD_STATES, type Bbox, type DownloadDto, formatBytes, type InstalledRegion, type MapOverview } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowRight, CircleAlert, Scan, SquareDashedMousePointer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { ErrorState, Joined, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { useDownloads } from "@/features/downloads/use-downloads";
import { KeepAreaSection } from "@/features/kept/keep-controls";
import { detailLabel } from "../lib/detail";
import { isValidBbox } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { PanelHeading, PanelLoading } from "../ui";

/** What the panel was opened to do, when it was opened from elsewhere on the screen. */
export type OfflineIntent = { type: "add"; presetId?: string; draw?: boolean } | { type: "imagery" } | null;

const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Add a place, on Offline maps, for an area of the map. */
export function addAreaLink(bbox: Bbox, name = "This area"): string {
  const box = bbox.map((value) => Number(value.toFixed(5))).join(",");
  return `/maps/data?add=1&bbox=${box}&name=${encodeURIComponent(name)}`;
}

/** Add a place for a ready-made area an older link names: the world, or a country (`country-ke`). */
export function addPresetLink(presetId: string | undefined): string {
  if (presetId === "world") return "/maps/data?add=1&world=1";
  const country = /^country-([a-z]{2})$/.exec(presetId ?? "")?.[1];
  return country ? `/maps/data?add=1&country=${country.toUpperCase()}` : "/maps/data?add=1";
}

/** The view, a little inside its edges: the area "Add this view" offers. */
export function viewArea(view: Bbox): Bbox {
  const inset = (low: number, high: number) => (high - low) * 0.06;
  return [
    view[0] + inset(view[0], view[2]),
    view[1] + inset(view[1], view[3]),
    view[2] - inset(view[0], view[2]),
    view[3] - inset(view[1], view[3]),
  ];
}

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
    ? "Storage not connected"
    : region.status === "missing"
      ? "The file is missing"
      : region.status === "damaged"
        ? "The file is damaged"
        : region.status === "moving"
          ? "Moving"
          : null;
  return (
    <li className="py-2.5">
      <p className="text-body font-medium text-ink">{region.name}</p>
      <p className="tabular text-small text-ink-muted">
        <Joined parts={[terrain ? "Hills and heights" : detailLabel(region.maxZoom), formatBytes(region.sizeBytes)]} />
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
function useView(engine: MapEngine | null): Bbox | null {
  const [view, setView] = useState<Bbox | null>(() => engine?.getBounds() ?? null);
  useEffect(() => {
    if (!engine) return;
    setView(engine.getBounds());
    return engine.on("moveend", () => setView(engine.getBounds()));
  }, [engine]);
  return view;
}

/** Drawing an area on the map: drag a box, then Add a place for it. Escape stops. */
function DrawArea({ engine, onDone, onNeedMap }: { engine: MapEngine | null; onDone: () => void; onNeedMap: () => void }) {
  const navigate = useNavigate();
  const [problem, setProblem] = useState<string | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus({ preventScroll: true }), []);
  useEffect(() => {
    if (!engine) return;
    onNeedMap();
    engine.setDrawing(true);
    const off = engine.on("box", (result) => {
      engine.setDrawing(false);
      if (result.ok) navigate(addAreaLink(result.bbox));
      else
        setProblem(
          result.reason === "antimeridian"
            ? "That box crosses the 180° meridian. Draw it on one side, then the other."
            : "That box is too small. Drag a larger one.",
        );
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onDone();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      off();
      engine.setDrawing(false);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [engine, navigate, onDone, onNeedMap]);
  return (
    <div className="grid gap-3 px-4 py-4">
      {/* Takes the place of the button pressed: its heading has the keyboard (WCAG 2.4.3). */}
      <h3 ref={heading} tabIndex={-1} className="text-body font-semibold text-ink focus:outline-none">
        Draw an area
      </h3>
      {engine ? (
        <p className="text-small text-ink">Drag on the map from one corner of the area to the opposite one. Press Escape to stop.</p>
      ) : (
        <Notice tone="warning" icon={<CircleAlert />}>
          The map cannot be drawn in this browser, so an area cannot be drawn on it.
        </Notice>
      )}
      {problem ? <p className="text-small text-danger">{problem}</p> : null}
      <div>
        <Button onClick={onDone}>Stop drawing</Button>
      </div>
    </div>
  );
}

export function OfflinePanel({
  overview,
  engine,
  intent,
  onIntentHandled,
  onNeedMap,
}: {
  overview: UseQueryResult<MapOverview>;
  engine: MapEngine | null;
  intent: OfflineIntent;
  onIntentHandled: () => void;
  /** Asks the screen to uncover the map (on a phone, lowers the sheet). */
  onNeedMap: () => void;
}) {
  const navigate = useNavigate();
  const downloads = useDownloads();
  const [drawing, setDrawing] = useState(false);
  const view = useView(engine);
  const regions = overview.data?.regions ?? [];
  const covering = view ? regions.filter((region) => overlaps(region.bounds, view)) : regions;

  useEffect(() => {
    if (!intent) return;
    if (intent.type === "add") {
      // Adding is done in one place, Add a place on Offline maps; only drawing needs the map.
      if (intent.draw) setDrawing(true);
      else navigate(addPresetLink(intent.presetId));
    }
    // Satellite pictures are added through Add a place, for this view or an area drawn.
    if (intent.type === "imagery") navigate("/maps/data?add=1&kinds=imagery");
    onIntentHandled();
  }, [intent, onIntentHandled, navigate]);

  if (drawing) return <DrawArea engine={engine} onDone={() => setDrawing(false)} onNeedMap={onNeedMap} />;
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
  const nothingYet = regions.length === 0;
  const area = view ? viewArea(view) : null;
  const canAddView = area !== null && isValidBbox(area) && area[2] - area[0] < 300;

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
              ? "No offline maps yet. Outpost draws coastlines and borders until a place is added; it then works with no connection."
              : "No offline map covers this view, so only coastlines and borders are drawn here."}
          </p>
        )}
        {mapDownloads.length > 0 ? (
          <div className="mt-3">
            <ActiveDownloads downloads={mapDownloads} />
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant={nothingYet ? "primary" : "secondary"}
            disabled={!canAddView}
            onClick={() => area && navigate(addAreaLink(area, "This view"))}
          >
            <Scan /> Add this view
          </Button>
          <Button variant="ghost" onClick={() => setDrawing(true)} disabled={!engine}>
            <SquareDashedMousePointer /> Draw an area
          </Button>
        </div>
        {!canAddView && view ? (
          <p className="mt-1 text-small text-ink-muted">Zoom in to add the view: it shows more than one area can hold.</p>
        ) : null}
        <p className="mt-4 text-small">
          <Link
            to="/maps/data"
            className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline decoration-1 underline-offset-2 hover:decoration-2 md:min-h-8"
          >
            All offline maps <ArrowRight aria-hidden className="size-4" />
          </Link>
          <span className="block text-ink-muted">
            Countries, routes, nearby places and satellite pictures: add, update and remove them there.
          </span>
        </p>
      </section>

      <KeepAreaSection engine={engine} />
    </div>
  );
}
