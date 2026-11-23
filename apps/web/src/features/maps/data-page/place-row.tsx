/**
 * One place on Offline maps: a country, a drawn area or the world's basics, in one row. On a
 * phone: its name, its size and its menu, then one line "Map: ready, Routes: 43%, Nearby places: Add". On a
 * wide screen the same row lines up as a table: Place, Map, Routes, Nearby, Walk/cycle, Size, ⋯.
 * The row opens to what is behind each word: the days the data is from, where it is kept, the
 * source file, real progress with Pause and Cancel, and Update and Remove.
 */
import {
  type DownloadDto,
  formatBytes,
  type InstalledRegion,
  type JobDto,
  type ManagedItem,
  type MapDataBundle,
  type MapDataBundleKind,
  type MapDataItem,
  type MapDataPlace,
} from "@outpost/shared";
import { ChevronDown, CircleAlert, Scan } from "lucide-react";
import { useId, useState } from "react";
import { Link } from "react-router";
import { Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Badge, Progress } from "@/components/ui/misc";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { MoveItemsDialog } from "@/features/manage/item-dialogs";
import { cn } from "@/lib/utils";
import { detailLabel } from "../lib/detail";
import { isUnderWay, MapDataMenu, MapDataProgress, StateMark, touchSize } from "./pattern";
import { removable } from "./remove-dialog";
import {
  BUNDLE_COLUMNS,
  BUNDLE_NAMES,
  bundleStateText,
  isHere,
  KIND_NAMES,
  notKeptLine,
  overAYearOld,
  readyFacts,
  stateLine,
  WHILE_AWAY,
} from "./words";

/** What the rows need beside the places themselves, read once for the whole screen. */
export interface RowContext {
  downloads: DownloadDto[];
  jobs: JobDto[];
  regions: InstalledRegion[];
  now?: number;
  /** The home country, said beside its name. */
  home: string | null;
  /** The bundle columns of the screen: map, routes, nearby, and walk where the add-on is installed. */
  columns: MapDataBundleKind[];
  /** Add a place, at this place, with this bundle ticked. */
  onAdd: (place: MapDataPlace, bundle: MapDataBundleKind) => void;
  onUpdate: (place: MapDataPlace) => void;
  onRemove: (place: MapDataPlace) => void;
}

/** The camera that shows a box: its middle, at a zoom where it fills the view. */
export function cameraLink(bounds: [number, number, number, number]): string {
  const [west, south, east, north] = bounds;
  const span = Math.max(east - west, (north - south) * 1.6, 0.0001);
  const zoom = Math.max(1, Math.min(14, Math.floor(Math.log2(360 / span))));
  return `/maps?lat=${((south + north) / 2).toFixed(4)}&lon=${((west + east) / 2).toFixed(4)}&z=${zoom}`;
}

/** A collection as the Move dialog takes it: the key it moves by, its size and where it is now. */
export function asManaged(item: MapDataItem): ManagedItem {
  return {
    key: `collection:${item.collectionId}`,
    type: "collection",
    id: item.collectionId ?? "",
    title: item.title,
    kind: "map",
    origin: "downloaded",
    sizeBytes: item.sizeBytes ?? 0,
    addedAt: 0,
    locationId: item.locationId ?? "",
    locationName: item.locationName ?? "",
    locationAvailable: item.state !== "location-offline",
    relPath: "",
    inOutpostFolder: true,
    state: "ok",
    busyReason: null,
    documents: [],
    catalogEntryId: null,
    href: "/maps/data",
  };
}

/** Moves with its storage location: everything on one, not a road network (kept with Outpost's own data). */
export const movable = (item: MapDataItem) =>
  item.kind !== "roads" && item.collectionId !== null && item.locationId !== null && item.state === "ready" && !item.downloadId;

/** Brought up to date from here. */
export const updatableHere = (item: MapDataItem) => isHere(item) && Boolean(item.update) && item.update?.how !== "elsewhere";

/** The download behind a bundle on its way, for its figures (bytes, time left). */
export function downloadOf(place: MapDataPlace, bundle: MapDataBundle, downloads: DownloadDto[]): DownloadDto | null {
  const ids = place.items.filter((item) => bundle.items.includes(item.key) && item.downloadId).map((item) => item.downloadId!);
  return downloads.find((download) => ids.includes(download.id) && download.state !== "failed") ?? null;
}

/** Where one thing stands, in words, with real progress while something is happening to it. */
export function ItemState({ item, context, title }: { item: MapDataItem; context: RowContext; title?: string | null }) {
  const download = item.downloadId ? context.downloads.find((each) => each.id === item.downloadId) : undefined;
  const job = item.taskId ? context.jobs.find((each) => each.id === item.taskId) : undefined;
  const region = context.regions.find((each) => each.id === item.collectionId);
  const detail = item.kind === "map" && region ? detailLabel(region.maxZoom) : null;
  const line = stateLine(item);
  const heading = title ? <span className="font-medium text-ink">{title}</span> : null;

  if (download && (item.state === "downloading" || item.state === "paused" || item.state === "waiting" || item.state === "failed")) {
    return (
      <div className="grid gap-1">
        {heading ? <p className="text-small">{heading}</p> : null}
        {item.state === "waiting" && line ? <p className="text-small text-ink-muted">{line}</p> : null}
        <DownloadProgress download={download} />
        <DownloadControls download={download} className="-ml-2" />
      </div>
    );
  }
  if (item.state === "processing" || item.state === "moving" || (item.state === "waiting" && !download)) {
    const progress = job ? { current: job.progress.current, total: job.progress.total } : item.progress;
    const value = progress?.total ? progress.current / progress.total : null;
    const message =
      job?.progress.message && item.state === "processing"
        ? { ...item, progress: { ...item.progress!, message: job.progress.message } }
        : item;
    return (
      <div className="grid gap-1.5">
        {heading ? <p className="text-small">{heading}</p> : null}
        <Progress
          value={item.state === "waiting" ? 0 : value}
          tone={item.state === "waiting" ? "muted" : "lamp"}
          label={`Progress of ${item.title}`}
        />
        <p className="text-small text-ink">{stateLine(message as MapDataItem)}</p>
      </div>
    );
  }
  const trouble = item.state === "failed" || item.state === "missing" || item.state === "damaged";
  return (
    <div className="grid gap-1">
      <p className="tabular text-small text-ink-muted">
        <Joined parts={[heading, ...readyFacts(item, detail)]} />
      </p>
      {item.state === "location-offline" ? (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
          <Badge tone="warning">
            <CircleAlert aria-hidden /> Storage not connected: {item.locationName ?? "its storage location"}
          </Badge>
          {WHILE_AWAY[item.kind]}
        </p>
      ) : null}
      {trouble ? (
        <p className="flex items-start gap-1.5 text-small text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          Failed: {line}
        </p>
      ) : null}
      {item.state === "ready" && !item.ageless && overAYearOld(item.dataDate, context.now) ? (
        <p>
          <Badge>Over a year old</Badge>
        </p>
      ) : null}
    </div>
  );
}

/** What a place's name says beside it: home, drawn, everywhere. */
function placeNote(place: MapDataPlace, home: string | null): string | null {
  if (place.type === "country" && place.country === home) return "home";
  if (place.type === "area") return "drawn";
  if (place.type === "world") return "everywhere, less detail";
  return null;
}

/** The columns' names over the rows, on a wide screen only (each cell says its own name to a screen reader). */
export function PlaceHeader({ columns }: { columns: MapDataBundleKind[] }) {
  return (
    <div
      aria-hidden
      className="hidden gap-x-4 border-b border-border pb-2 text-small font-medium text-ink-muted md:grid"
      style={{ gridTemplateColumns: gridColumns(columns.length) }}
    >
      <span>Place</span>
      {columns.map((kind) => (
        <span key={kind}>{BUNDLE_COLUMNS[kind]}</span>
      ))}
      <span className="text-right">Size</span>
      <span />
    </div>
  );
}

const gridColumns = (count: number) => `minmax(0,1.7fr) repeat(${count}, minmax(0,1fr)) 5.5rem 2.75rem`;

export function PlaceRow({ place, context }: { place: MapDataPlace; context: RowContext }) {
  const [open, setOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const detailsId = useId();
  const now = context.now ?? Date.now();
  const byKind = new Map(place.bundles.map((bundle) => [bundle.kind, bundle]));
  const note = placeNote(place, context.home);
  const canUpdate = place.items.some(updatableHere);
  const toMove = place.items.filter(movable);
  const canRemove = place.items.some(removable);
  const imagery = byKind.get("imagery");
  // A drawn area or the world's basics offer only what they can have: no routes for a drawn area.
  const offered = (kind: MapDataBundleKind) =>
    place.type === "country" ? true : place.type === "world" ? kind === "map" || kind === "nearby" : kind === "map";
  return (
    <li data-pattern="row" data-place={place.key} className="py-1">
      <div
        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-0.5 py-2 md:[grid-template-columns:var(--place-grid)] md:gap-x-4"
        style={{ "--place-grid": gridColumns(context.columns.length) } as React.CSSProperties}
      >
        <h3 className="min-w-0 md:col-auto">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detailsId}
            onClick={() => setOpen((current) => !current)}
            className="group flex min-h-11 w-full min-w-0 items-center gap-1.5 rounded-control text-left md:min-h-8 md:pointer-coarse:min-h-11"
          >
            <span className="min-w-0">
              <span className="text-body font-medium text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-2">
                {place.name}
              </span>
              {note ? <span className="text-small text-ink-muted"> · {note}</span> : null}
              {place.parts.length > 0 ? <span className="block text-micro text-ink-muted">{place.parts.join(", ")}</span> : null}
            </span>
            <ChevronDown
              aria-hidden
              className={cn("size-4 shrink-0 text-ink-muted transition-transform duration-(--duration-fast)", open && "rotate-180")}
            />
          </button>
        </h3>
        <div
          data-part="marks"
          className="order-last col-span-3 flex flex-wrap items-center gap-x-4 gap-y-1 md:order-none md:col-span-1 md:contents"
        >
          {context.columns.map((kind) => (
            <span key={kind} className="min-w-0">
              <StateMark
                bundle={offered(kind) ? (byKind.get(kind) ?? null) : null}
                name={BUNDLE_NAMES[kind]}
                place={place.name}
                onAdd={() => context.onAdd(place, kind)}
                now={now}
              />
            </span>
          ))}
          {imagery ? (
            <span className="md:hidden">
              <StateMark bundle={imagery} name={BUNDLE_NAMES.imagery} place={place.name} now={now} />
            </span>
          ) : null}
        </div>
        <span className="tabular text-right text-small text-ink-muted">{place.sizeBytes > 0 ? formatBytes(place.sizeBytes) : "–"}</span>
        <MapDataMenu
          label={`Actions for ${place.name}`}
          onUpdate={canUpdate ? () => context.onUpdate(place) : undefined}
          onMove={toMove.length > 0 ? () => setMoving(true) : undefined}
          onRemove={canRemove ? () => context.onRemove(place) : undefined}
          onDetails={() => setOpen((current) => !current)}
          detailsOpen={open}
        />
      </div>
      {open ? <PlaceDetails id={detailsId} place={place} context={context} /> : <div id={detailsId} hidden />}
      {toMove.length > 0 ? <MoveItemsDialog items={toMove.map(asManaged)} open={moving} onOpenChange={setMoving} /> : null}
    </li>
  );
}

function BundleDetail({ place, bundle, context }: { place: MapDataPlace; bundle: MapDataBundle; context: RowContext }) {
  const items = place.items.filter((item) => bundle.items.includes(item.key));
  const download = downloadOf(place, bundle, context.downloads);
  return (
    <div className="grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-x-6">
      <h4 className="text-small font-semibold text-ink">{BUNDLE_NAMES[bundle.kind]}</h4>
      <div className="grid min-w-0 gap-3">
        {bundle.state === "none" ? (
          <p className="text-small text-ink-muted">
            Not added.{" "}
            <button
              type="button"
              onClick={() => context.onAdd(place, bundle.kind)}
              className="text-primary underline decoration-1 underline-offset-2"
            >
              Add {BUNDLE_NAMES[bundle.kind].toLowerCase()}
            </button>
          </p>
        ) : isUnderWay(bundle) && !download ? (
          <MapDataProgress bundle={bundle} label={`${BUNDLE_NAMES[bundle.kind]} for ${place.name}`} />
        ) : (
          <p className="tabular text-small text-ink">{bundleStateText(bundle, download, context.now)}</p>
        )}
        {items.map((item) => (
          <ItemState key={item.key} item={item} context={context} title={`${item.title} · ${KIND_NAMES[item.kind].toLowerCase()}`} />
        ))}
      </div>
    </div>
  );
}

function PlaceDetails({ id, place, context }: { id: string; place: MapDataPlace; context: RowContext }) {
  const file = place.sourceFile;
  const map = place.items.find((item) => item.kind === "map" && item.collectionId);
  const region = map ? context.regions.find((each) => each.id === map.collectionId) : undefined;
  return (
    <section id={id} aria-label={`${place.name} in detail`} className="mb-3 grid gap-4 rounded-panel bg-surface px-4 py-4">
      {place.bundles.map((bundle) => (
        <BundleDetail key={bundle.kind} place={place} bundle={bundle} context={context} />
      ))}
      {place.type === "country" ? (
        <div className="grid gap-2 md:grid-cols-[10rem_minmax(0,1fr)] md:gap-x-6">
          <h4 className="text-small font-semibold text-ink">Source file</h4>
          <div className="grid gap-2">
            {file ? (
              <ItemState item={file} context={context} title={file.title} />
            ) : (
              <p className="text-small text-ink-muted">{notKeptLine(place.lastRead)}</p>
            )}
            <p className="max-w-[60ch] text-small text-ink-muted">
              OpenStreetMap's whole record of the country. Routes and nearby places are read from it.
            </p>
          </div>
        </div>
      ) : null}
      <p className="text-small text-ink-muted">
        <Joined
          parts={[
            place.locations.length > 0 ? `Kept on ${place.locations.join(" and ")}` : null,
            place.sizeBytes > 0 ? formatBytes(place.sizeBytes) : null,
            place.stale > 0 ? `${place.stale} over a year old` : null,
          ]}
        />
      </p>
      <div className="flex flex-wrap gap-2">
        {place.items.some(updatableHere) ? (
          <Button size="sm" className={touchSize} onClick={() => context.onUpdate(place)}>
            Update
          </Button>
        ) : null}
        {place.items.some(removable) ? (
          <Button size="sm" variant="ghost" className={cn("text-danger", touchSize)} onClick={() => context.onRemove(place)}>
            Remove…
          </Button>
        ) : null}
        {region ? (
          <Button size="sm" variant="ghost" asChild className={touchSize}>
            <Link to={cameraLink(region.bounds)}>
              <Scan /> Show on the map
            </Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** "On this phone": map areas kept in this browser, in the same row as every place. */
export function KeptHereRow({ name, line, bytes }: { name: string; line: string; bytes: number }) {
  return (
    <li data-pattern="row" data-place="on-this-device" className="py-1">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 py-2 md:gap-x-4">
        <h3 className="min-w-0">
          <Link
            to="/kept"
            className="flex min-h-11 items-center text-body font-medium text-ink hover:underline hover:decoration-1 hover:underline-offset-2 md:min-h-8"
          >
            {name}
          </Link>
        </h3>
        <span className="tabular text-right text-small text-ink-muted">{bytes > 0 ? formatBytes(bytes) : "–"}</span>
        <MapDataMenu label={`Actions for ${name}`} />
        <p data-pattern="state" className="col-span-3 text-small text-ink-muted">
          {line}
        </p>
      </div>
    </li>
  );
}
