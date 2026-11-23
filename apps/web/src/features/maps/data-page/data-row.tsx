/**
 * One row of Map data: a kind of data for a place ("Roads for routes"), and each thing of that
 * kind with where it stands. Nothing yet says what it is needed for and offers Add; something on
 * its way shows its real progress with Pause and Details; something here shows its size, where
 * it is and the day its data is from, with a menu to open, update or remove it.
 */
import {
  type DownloadDto,
  formatBytes,
  type InstalledRegion,
  type JobDto,
  type ManagedItem,
  type MapDataItem,
  type MapDataKind,
  type MapDataResponse,
  type ReferenceEstimateRequest,
} from "@outpost/shared";
import { CircleAlert, Ellipsis, ExternalLink, FolderInput, RefreshCw, Scan, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { Joined } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Progress } from "@/components/ui/misc";
import { DownloadControls, DownloadProgress } from "@/features/downloads/download-progress";
import { usePacks } from "@/features/layers/data";
import { MoveItemsDialog } from "@/features/manage/item-dialogs";
import { detailLabel } from "../panels/add-region";
import { useUpdateRoadNetwork } from "../road-route/data";
import { RemoveDialog, removable } from "./remove-dialog";
import { UpdatesDialog } from "./update-dialog";
import { dayText, isHere, KIND_NAMES, overAYearOld, readyFacts, stateLine, WHILE_AWAY } from "./words";

/** What the rows need beside the item itself, read once for the whole screen. */
export interface RowContext {
  downloads: DownloadDto[];
  jobs: JobDto[];
  regions: InstalledRegion[];
  onUpdatePlaces: (request: ReferenceEstimateRequest) => void;
  now?: number;
  /** The whole answer, for what a row's update or removal needs to know of the rest (a kept country file). */
  data?: MapDataResponse;
  /** Kept country files with a newer one for the same region, by key, with that newer one. */
  older?: Map<string, MapDataItem>;
}

/** The camera that shows a box: its middle, at a zoom where it fills the view. */
export function cameraLink(bounds: [number, number, number, number]): string {
  const [west, south, east, north] = bounds;
  const span = Math.max(east - west, (north - south) * 1.6, 0.0001);
  const zoom = Math.max(1, Math.min(14, Math.floor(Math.log2(360 / span))));
  return `/maps?lat=${((south + north) / 2).toFixed(4)}&lon=${((west + east) / 2).toFixed(4)}&z=${zoom}`;
}

const touch = "max-md:size-11 md:pointer-coarse:size-11";

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

/** Brought up to date from here: everything that says how, except what is updated from its own place. */
const updatableHere = (item: MapDataItem) => isHere(item) && Boolean(item.update) && item.update?.how !== "elsewhere";

function ItemMenu({ item, context }: { item: MapDataItem; context: RowContext }) {
  const [open, setOpen] = useState<"remove" | "move" | "update" | null>(null);
  const reread = useUpdateRoadNetwork();
  const packs = usePacks(item.kind === "places" && item.packId !== null);
  const pack = packs.data?.find((each) => each.id === item.packId);
  const region = context.regions.find((each) => each.id === item.collectionId);
  const details = item.downloadId ? `/downloads/${item.downloadId}` : item.taskId ? `/downloads/tasks/${item.taskId}` : null;
  const canRemove = removable(item);
  const canMove = movable(item);
  const canUpdate = updatableHere(item) && context.data !== undefined;
  // A network built from a file of the person's own: read that file again.
  const canReread = item.kind === "roads" && item.networkId !== null && item.regionId === null && item.state !== "processing";
  const canUpdatePlaces =
    item.kind === "places" && !canUpdate && pack?.origin === "download" && pack.request !== null && pack.request !== undefined;
  const opens = Boolean(details || region || canUpdate || canReread || canUpdatePlaces || canMove);
  if (!opens && !canRemove) return null;
  return (
    <>
      <Menu>
        <MenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for ${item.title}: ${KIND_NAMES[item.kind].toLowerCase()}`}
            className={touch}
          >
            <Ellipsis />
          </Button>
        </MenuTrigger>
        <MenuContent>
          {details ? (
            <MenuItem asChild>
              <Link to={details}>
                <ExternalLink /> Details
              </Link>
            </MenuItem>
          ) : null}
          {region ? (
            <MenuItem asChild>
              <Link to={cameraLink(region.bounds)}>
                <Scan /> Show on the map
              </Link>
            </MenuItem>
          ) : null}
          {canUpdate ? (
            <MenuItem onSelect={() => setOpen("update")}>
              <RefreshCw /> Update…
            </MenuItem>
          ) : null}
          {canReread ? (
            <MenuItem onSelect={() => reread.mutate(item.networkId!, { onSuccess: () => toast.success(`Reading ${item.title} again.`) })}>
              <RefreshCw /> Read its file again
            </MenuItem>
          ) : null}
          {canUpdatePlaces ? (
            <MenuItem onSelect={() => pack?.request && context.onUpdatePlaces(pack.request)}>
              <RefreshCw /> Check for an update
            </MenuItem>
          ) : null}
          {canMove ? (
            <MenuItem onSelect={() => setOpen("move")}>
              <FolderInput /> Move…
            </MenuItem>
          ) : null}
          {canRemove ? (
            <>
              {opens ? <MenuSeparator /> : null}
              <MenuItem danger onSelect={() => setOpen("remove")}>
                <Trash2 /> Remove
              </MenuItem>
            </>
          ) : null}
        </MenuContent>
      </Menu>
      {canRemove ? <RemoveDialog item={item} open={open === "remove"} onOpenChange={(next) => setOpen(next ? "remove" : null)} /> : null}
      {canMove ? (
        <MoveItemsDialog items={[asManaged(item)]} open={open === "move"} onOpenChange={(next) => setOpen(next ? "move" : null)} />
      ) : null}
      {canUpdate && context.data ? (
        <UpdatesDialog
          items={[item]}
          data={context.data}
          open={open === "update"}
          onOpenChange={(next) => setOpen(next ? "update" : null)}
          onUpdatePlaces={context.onUpdatePlaces}
        />
      ) : null}
    </>
  );
}

/** A kept country file with a newer one for the same region: offered for removal, never removed by itself. */
function OlderFile({ item, newer }: { item: MapDataItem; newer: MapDataItem }) {
  const [removing, setRemoving] = useState(false);
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="text-small text-ink-muted">
        A newer file is kept, from {dayText(newer.dataDate) ?? "a later day"}. This one is from {dayText(item.dataDate) ?? "an earlier day"}{" "}
        and takes {formatBytes(item.sizeBytes)} on {item.locationName ?? "its storage location"}.
      </p>
      <Button size="sm" className="max-md:min-h-11 md:pointer-coarse:min-h-11" onClick={() => setRemoving(true)}>
        Remove the older file
      </Button>
      <RemoveDialog item={item} open={removing} onOpenChange={setRemoving} />
    </div>
  );
}

/** Where one thing stands, in words, with real progress while something is happening to it. */
export function ItemState({ item, context, title }: { item: MapDataItem; context: RowContext; title?: string | null }) {
  const download = item.downloadId ? context.downloads.find((each) => each.id === item.downloadId) : undefined;
  const job = item.taskId ? context.jobs.find((each) => each.id === item.taskId) : undefined;
  const region = context.regions.find((each) => each.id === item.collectionId);
  const detail = item.kind === "map" && region ? `${detailLabel(region.maxZoom)}, to zoom ${region.maxZoom}` : null;
  const line = stateLine(item);
  const heading = title ? <span className="font-medium text-ink">{title}</span> : null;

  // On its way: the download's own bar and words (bytes, speed, time left), and its controls.
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
            <CircleAlert aria-hidden /> {item.locationName ?? "Its storage location"} is not connected
          </Badge>
          {WHILE_AWAY[item.kind]}
        </p>
      ) : null}
      {trouble ? (
        <p className="flex items-start gap-1.5 text-small text-danger">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {line}
        </p>
      ) : null}
      {item.state === "ready" && overAYearOld(item.dataDate, context.now) ? (
        <p>
          <Badge>Over a year old</Badge>
        </p>
      ) : null}
    </div>
  );
}

/**
 * A kind of data for one place. `items` empty: `empty` says so and `onAdd` offers to add it.
 * `titled` shows each item's own name (a region of the country, a drawn area), where it is not
 * the place's own.
 */
export function DataRow({
  kind,
  name = KIND_NAMES[kind],
  items,
  empty,
  onAdd,
  addLabel = "Add",
  titled,
  context,
}: {
  kind: MapDataKind;
  name?: string;
  items: MapDataItem[];
  empty?: ReactNode;
  onAdd?: () => void;
  addLabel?: string;
  /** Show an item's title when it is not this: the place's own name. */
  titled?: (item: MapDataItem) => boolean;
  context: RowContext;
}) {
  return (
    <li className="grid gap-x-6 gap-y-1 py-3 md:grid-cols-[11rem_minmax(0,1fr)]" data-kind={kind}>
      <h4 className="text-small font-semibold text-ink md:pt-[0.3125rem]">{name}</h4>
      <div className="grid min-w-0 gap-3">
        {items.length === 0 ? (
          <div className="flex items-start gap-3">
            <p className="min-w-0 flex-1 text-small text-ink-muted md:pt-[0.3125rem]">{empty}</p>
            {onAdd ? (
              <Button
                size="sm"
                onClick={onAdd}
                aria-label={`${addLabel}: ${name.toLowerCase()}`}
                className="shrink-0 max-md:min-h-11 md:pointer-coarse:min-h-11"
              >
                {addLabel}
              </Button>
            ) : null}
          </div>
        ) : (
          items.map((item) => (
            <div key={item.key} className="flex items-start gap-3">
              <div className="min-w-0 flex-1 md:pt-[0.3125rem]">
                <ItemState item={item} context={context} title={titled?.(item) ? item.title : null} />
                {context.older?.get(item.key) ? <OlderFile item={item} newer={context.older.get(item.key)!} /> : null}
              </div>
              <ItemMenu item={item} context={context} />
            </div>
          ))
        )}
      </div>
    </li>
  );
}
