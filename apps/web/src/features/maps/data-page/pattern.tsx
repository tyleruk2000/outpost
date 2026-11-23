/**
 * The one pattern every kind of offline map data follows (docs/development/design-quality.md,
 * "Map data pattern"): a row is a name, a state line, a size and a ⋯ menu; a state is said
 * with the same words and marks for a map, routes, nearby places, walking and cycling,
 * satellite pictures, a drawn area, the world's basics and what is kept on this phone; the
 * ⋯ menu has the same actions in the same order; progress is one bar with one line of words.
 *
 * Each part carries `data-pattern` so a test can tell that a row was built from these.
 */
import type { MapDataBundle } from "@outpost/shared";
import {
  ArrowDown,
  Check,
  CircleAlert,
  Clock,
  Ellipsis,
  FolderInput,
  Hammer,
  ListCollapse,
  Pause,
  RefreshCw,
  Trash2,
  Unplug,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Progress } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { bundleMark, bundleStateText, type DownloadFigures, overAYearOld } from "./words";

export const touchSize = "max-md:min-h-11 md:pointer-coarse:min-h-11";

const UNDER_WAY: MapDataBundle["state"][] = ["downloading", "paused", "building", "waiting", "moving"];

export const isUnderWay = (bundle: MapDataBundle) => UNDER_WAY.includes(bundle.state);

function markIcon(bundle: MapDataBundle, now: number): ReactNode {
  switch (bundle.state) {
    case "ready":
      return bundle.dataDate && overAYearOld(bundle.dataDate, now) ? <Clock /> : <Check />;
    case "downloading":
      return <ArrowDown />;
    case "building":
      return <Hammer />;
    case "paused":
      return <Pause />;
    case "waiting":
      return <Clock />;
    case "moving":
      return <FolderInput />;
    case "failed":
      return <CircleAlert />;
    case "location-offline":
      return <Unplug />;
    default:
      return null;
  }
}

const markTone = (bundle: MapDataBundle, now: number) =>
  bundle.state === "ready"
    ? bundle.dataDate && overAYearOld(bundle.dataDate, now)
      ? "text-ink-muted"
      : "text-success"
    : bundle.state === "failed"
      ? "text-danger"
      : bundle.state === "location-offline"
        ? "text-warning"
        : bundle.state === "downloading" || bundle.state === "building"
          ? "text-lamp-ink"
          : "text-ink-muted";

/**
 * A bundle's mark in a row: its name (on a phone, where there are no columns), an icon and a
 * word. Nothing added yet: an Add that starts Add a place with this ticked. Not offered: a dash.
 */
export function StateMark({
  bundle,
  name,
  place,
  onAdd,
  labelled = false,
  now = Date.now(),
}: {
  bundle: MapDataBundle | null;
  /** "Map", "Routes": shown before the mark on a phone, read before it everywhere. */
  name: string;
  /** The place's name, for the Add button's label. */
  place: string;
  onAdd?: (() => void) | undefined;
  /** Its name shown at every width, where no column names it (Storage, the map's cards). */
  labelled?: boolean;
  now?: number;
}) {
  const named = labelled ? "" : "md:sr-only";
  if (!bundle) {
    return (
      <span data-pattern="state" data-state="not-offered" className="text-small text-ink-faint max-md:hidden">
        <span className={named}>{name} </span>
        <span aria-hidden>–</span>
        <span className="sr-only">not offered</span>
      </span>
    );
  }
  if (bundle.state === "none") {
    return (
      <span data-pattern="state" data-state="none" className="inline-flex items-center gap-1 text-small">
        <span className={cn("text-ink-muted", named)}>{name}:</span>
        {onAdd ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={onAdd}
            aria-label={`Add ${name.toLowerCase()} for ${place}`}
            className={cn("-mx-2 px-2 text-primary underline decoration-1 underline-offset-2", touchSize)}
          >
            Add
          </Button>
        ) : (
          <span className="text-ink-muted">Not added</span>
        )}
      </span>
    );
  }
  return (
    <span
      data-pattern="state"
      data-state={bundle.state}
      title={bundleStateText(bundle, null, now)}
      className={cn("inline-flex min-w-0 items-center gap-1 text-small [&_svg]:size-4 [&_svg]:shrink-0", markTone(bundle, now))}
    >
      <span className={cn("text-ink", named)}>{name}</span>
      <span aria-hidden className="inline-flex">
        {markIcon(bundle, now)}
      </span>
      <span className={cn(bundle.state === "ready" && !(bundle.dataDate && overAYearOld(bundle.dataDate, now)) && "sr-only")}>
        {bundleMark(bundle, now)}
      </span>
    </span>
  );
}

/** The one progress shown for anything on its way: a bar from real figures, and its line of words. */
export function MapDataProgress({
  bundle,
  download,
  label,
  children,
}: {
  bundle: MapDataBundle;
  download?: DownloadFigures | null;
  /** What it is, for the bar's name: "Routes for France". */
  label: string;
  /** Controls under the words (Pause, Cancel, Retry). */
  children?: ReactNode;
}) {
  const value = download?.totalBytes && bundle.state !== "building" ? download.receivedBytes / download.totalBytes : bundle.fraction;
  return (
    <div data-pattern="progress" className="grid gap-1.5">
      <Progress
        value={bundle.state === "waiting" ? 0 : value}
        tone={bundle.state === "waiting" || bundle.state === "paused" ? "muted" : "lamp"}
        label={`Progress of ${label}`}
      />
      <p className="tabular text-small text-ink">{bundleStateText(bundle, download)}</p>
      {children}
    </div>
  );
}

/**
 * The ⋯ menu, the same actions in the same order for every kind: Update, Move…, Remove…,
 * Details. An action that does not apply is left out, never reordered.
 */
export function MapDataMenu({
  label,
  onUpdate,
  onMove,
  onRemove,
  onDetails,
  detailsOpen,
}: {
  /** "Actions for France". */
  label: string;
  onUpdate?: (() => void) | undefined;
  onMove?: (() => void) | undefined;
  onRemove?: (() => void) | undefined;
  onDetails?: (() => void) | undefined;
  detailsOpen?: boolean;
}) {
  if (!onUpdate && !onMove && !onRemove && !onDetails) return <span aria-hidden className="size-8" />;
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={label} data-pattern="menu" className="max-md:size-11 md:pointer-coarse:size-11">
          <Ellipsis />
        </Button>
      </MenuTrigger>
      <MenuContent align="end">
        {onUpdate ? (
          <MenuItem onSelect={onUpdate}>
            <RefreshCw /> Update
          </MenuItem>
        ) : null}
        {onMove ? (
          <MenuItem onSelect={onMove}>
            <FolderInput /> Move…
          </MenuItem>
        ) : null}
        {onRemove ? (
          <MenuItem danger onSelect={onRemove}>
            <Trash2 /> Remove…
          </MenuItem>
        ) : null}
        {onDetails ? (
          <>
            {onUpdate || onMove || onRemove ? <MenuSeparator /> : null}
            <MenuItem onSelect={onDetails}>
              <ListCollapse /> {detailsOpen ? "Hide details" : "Details"}
            </MenuItem>
          </>
        ) : null}
      </MenuContent>
    </Menu>
  );
}
