/**
 * Repeaters: the ones this library holds, found and filtered with no connection.
 *
 * The screen is a list (band, mode, distance from a place, and a box that finds by
 * callsign, town or frequency), the lists the entries came from with the date of each
 * one's data, and the ways in and out: import a file, add by hand, export a set for
 * programming a radio. Below the lists are the places a list can be had, by country:
 * a few Outpost can fetch when asked, the rest with their page and the steps to get the
 * file by hand (docs/sources.md says how each was decided). "Find duplicates" shows the
 * repeaters held more than once and makes one of each.
 */
import {
  type Bbox,
  bandName,
  formatMHz,
  MAX_CHIRP_ROWS,
  modeName,
  REPEATER_BANDS,
  REPEATER_LICENCE_LINE,
  REPEATER_MODES,
  REPEATER_STATUS_LINE,
  type RepeaterBand,
  type RepeaterDto,
  type RepeaterExportFormat,
  type RepeaterListDto,
  type RepeaterMode,
  type RepeaterSort,
  type RepeatersOverview,
} from "@outpost/shared";
import {
  ArrowRight,
  CircleAlert,
  Download,
  Ellipsis,
  FileUp,
  List as ListIcon,
  Map as MapIcon,
  MapPin,
  Merge,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Trash2,
  Undo2,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { Disclosure, EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Checkbox, Segmented, Select, Skeleton } from "@/components/ui/misc";
import { FirstUseGuide } from "@/features/help/first-use";
import { useStoredState } from "@/features/maps/hooks";
import { formatBearing } from "@/features/maps/lib/geo";
import type { CameraView } from "@/features/maps/lib/view";
import { LicenceLine } from "@/features/radio/licence";
import { type HeightUnit, useHeightUnit } from "@/lib/heights";
import { useDebounced } from "@/lib/use-debounced";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn, formatDate, formatNumber, plural } from "@/lib/utils";
import {
  exportHref,
  type LatLon,
  type RepeaterFilters,
  useRemoveList,
  useRepeaterList,
  useRepeaterSources,
  useRepeatersOverview,
  useRestoreRemoved,
  useUpdateList,
} from "./data";
import { DuplicatesDialog } from "./duplicates-dialog";
import { ImportDialog } from "./import-dialog";
import { BandMark, bandShape } from "./map/band-shapes";
import { OriginPicker, REPEATERS_ORIGIN_KEY, useOrigin, useStoredOrigin } from "./origin";
import { PrintDialog } from "./print-dialog";
import { RepeaterFormDialog } from "./repeater-form";
import { RepeatersMap } from "./repeaters-map";
import { SourcesSection, useGetList } from "./sources-section";
import { useDistanceText, withinOptions, withinText } from "./units";
import { accessParts, ageWarning, dayText, isApproximate, shiftWords, sourceOf } from "./words";

const ANY = "any";

/**
 * One repeater in the list: what to listen on and how to get in first, then where it is and where it came from.
 * On a phone the row opens the repeater; beside the map it rings the repeater there instead, and offers its details.
 */
function RepeaterRow({
  repeater,
  list,
  from,
  distance,
  selected,
  onSelect,
}: {
  repeater: RepeaterDto;
  list: RepeaterListDto | undefined;
  from: string;
  distance: (meters: number) => string;
  selected: boolean;
  onSelect?: () => void;
}) {
  const source = sourceOf(list);
  const access = accessParts(repeater);
  const body = (
    <>
      <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="flex items-center gap-1.5 self-center">
          <BandMark shape={bandShape(repeater.band)} hollow={repeater.status === "off-air"} className="size-3 shrink-0" />
          <span className="text-body font-semibold text-ink">{repeater.callsign}</span>
        </span>
        <span className="tabular font-mono text-[0.875rem] text-ink">{formatMHz(repeater.outputHz)} MHz</span>
        <span className="tabular text-small text-ink-muted">{shiftWords(repeater)}</span>
        {access.length > 0 ? <span className="tabular text-small text-ink">{access.join(", ")}</span> : null}
      </span>
      <span className="tabular text-small text-ink sm:text-right">
        {repeater.distanceMeters !== undefined && repeater.bearingDegrees !== undefined ? (
          <>
            {isApproximate(repeater) ? "about " : ""}
            {distance(repeater.distanceMeters)}, {formatBearing(repeater.bearingDegrees)}
            <span className="sr-only"> from {from}</span>
          </>
        ) : from && repeater.lat === null ? (
          <span className="text-ink-muted">No position listed</span>
        ) : null}
      </span>
      <span className="min-w-0 text-small text-ink-muted sm:col-span-2">
        {[repeater.place, repeater.locator, repeater.modes.map(modeName).join(", "), bandName(repeater.band)].filter(Boolean).join(" · ")}
        {repeater.status === "off-air" ? (
          <Badge tone="warning" className="ml-2 whitespace-normal">
            Listed as not operational
          </Badge>
        ) : repeater.status === "reduced" ? (
          <Badge className="ml-2 whitespace-normal">Listed as on reduced output</Badge>
        ) : null}
        {repeater.edited ? <Badge className="ml-2">Changed by you</Badge> : null}
        <span className="block">
          {source.text}
          {source.age ? <span className="text-warning">, {source.age}</span> : null}
        </span>
      </span>
    </>
  );
  const row =
    "-mx-2 grid w-[calc(100%+1rem)] gap-x-4 gap-y-0.5 rounded-control px-2 py-2.5 text-left transition-colors duration-(--duration-fast) hover:bg-surface focus-visible:-outline-offset-2 sm:grid-cols-[minmax(0,1fr)_auto]";
  if (!onSelect) {
    return (
      <li id={`repeater-${repeater.id}`}>
        <Link to={`/radio/repeaters/${repeater.id}`} className={row}>
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li id={`repeater-${repeater.id}`} className={cn(selected && "bg-surface")}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        className={cn(row, "cursor-default", selected && "shadow-[inset_3px_0_0_var(--primary)] hover:bg-surface-strong")}
      >
        {body}
      </button>
      {selected ? (
        <div className="flex flex-wrap gap-2 pb-3">
          <Button asChild size="sm" variant="primary">
            <Link to={`/radio/repeaters/${repeater.id}`}>
              Details of {repeater.callsign} <ArrowRight />
            </Link>
          </Button>
        </div>
      ) : null}
    </li>
  );
}

function ListSkeleton() {
  return (
    <div className="grid gap-3" aria-busy>
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="grid gap-1.5 border-b border-border pb-3">
          <Skeleton className="h-5 w-3/5" />
          <Skeleton className="h-4 w-2/5" />
        </div>
      ))}
      <span className="sr-only">Loading repeaters</span>
    </div>
  );
}

/** Choosing a file to take away: for CHIRP, or everything in Outpost's own layout. */
function ExportDialog({
  open,
  onClose,
  filters,
  near,
  withinKm,
  sort,
  total,
  from,
}: {
  open: boolean;
  onClose: () => void;
  filters: RepeaterFilters;
  near: LatLon | null;
  withinKm: number | null;
  sort: RepeaterSort;
  total: number;
  from: string;
}) {
  const [format, setFormat] = useState<RepeaterExportFormat>("chirp");
  const [limit, setLimit] = useState("100");
  const count = Number(limit);
  const limitOk = /^\d{1,5}$/.test(limit.trim()) && count >= 1 && count <= (format === "chirp" ? MAX_CHIRP_ROWS : 100_000);
  const taken = Math.min(total, limitOk ? count : total);
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent title="Export repeaters" size="md">
        <DialogBody className="grid gap-4">
          <p className="text-small text-ink-muted">
            The file holds the repeaters the list is showing now: {plural(total, "repeater")}
            {near && sort === "near" ? `, nearest to ${from} first` : sort === "frequency" ? ", in frequency order" : ", in callsign order"}
            . Change the filters behind this box to choose a different set.
          </p>
          <Field label="For">
            {(ids) => (
              <Select
                {...ids}
                value={format}
                onChange={setFormat}
                options={[
                  { value: "chirp", label: "CHIRP, to program a radio (CSV)" },
                  { value: "outpost", label: "Outpost, every field (CSV)" },
                ]}
              />
            )}
          </Field>
          <Field
            label="At most"
            hint={
              near && sort === "near"
                ? "The nearest come first, so a small number is the nearest few."
                : "Radios hold a limited number of channels."
            }
            error={limitOk ? undefined : `A number from 1 to ${formatNumber(format === "chirp" ? MAX_CHIRP_ROWS : 100_000)}.`}
            className="max-w-[12rem]"
          >
            {(ids) => (
              <Input {...ids} value={limit} onChange={(event) => setLimit(event.target.value)} inputMode="numeric" className="tabular" />
            )}
          </Field>
          {format === "chirp" ? (
            <Notice tone="warning" icon={<CircleAlert />} title="Check it before you transmit">
              <p>
                This file is made from a list, and a list goes out of date: a tone, a shift or a whole repeater may have changed. Check each
                channel against a current listing or on the air. CHIRP has no column for a tone burst, a talkgroup or a colour code, so
                those are written in each channel's comment. A repeater with no input listed is written so that the radio will not transmit
                on it.
              </p>
              <p className="mt-1">{REPEATER_LICENCE_LINE}</p>
            </Notice>
          ) : (
            <p className="text-small text-ink-muted">
              Every field, with where each entry came from and the date of its data. Outpost reads this file back without losing anything.
            </p>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {limitOk && total > 0 ? (
            <Button asChild variant="primary">
              <a href={exportHref(format, filters, near, withinKm, count, sort)} download onClick={onClose}>
                <Download /> Export {plural(taken, "repeater")}
              </a>
            </Button>
          ) : (
            <Button variant="primary" disabled>
              <Download /> Export
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Renaming a list, or correcting who publishes it and the date of its data. */
function ListDetailsDialog({ list, onClose }: { list: RepeaterListDto | null; onClose: () => void }) {
  const update = useUpdateList();
  const [name, setName] = useState("");
  const [source, setSource] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [dataDate, setDataDate] = useState("");
  const [shownFor, setShownFor] = useState<string | null>(null);
  if (list && shownFor !== list.id) {
    setShownFor(list.id);
    setName(list.name);
    setSource(list.source);
    setSourceUrl(list.sourceUrl ?? "");
    setDataDate(new Date(list.dataDate).toISOString().slice(0, 10));
  }
  if (!list && shownFor !== null) setShownFor(null);
  return (
    <Dialog open={list !== null} onOpenChange={(next) => !next && !update.isPending && onClose()}>
      <DialogContent title="List details" size="md">
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            if (list) update.mutate({ id: list.id, name, source, sourceUrl, dataDate }, { onSuccess: onClose });
          }}
        >
          <DialogBody className="grid gap-4">
            <Field label="Name of the list">
              {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required />}
            </Field>
            <Field label="Who publishes it" optional>
              {(ids) => <Input {...ids} value={source} onChange={(event) => setSource(event.target.value)} maxLength={200} />}
            </Field>
            <Field label="Where it is published" optional hint="A web address, for finding a newer copy. Outpost never opens it itself.">
              {(ids) => (
                <Input
                  {...ids}
                  type="url"
                  value={sourceUrl}
                  onChange={(event) => setSourceUrl(event.target.value)}
                  maxLength={500}
                  placeholder="https://"
                />
              )}
            </Field>
            <Field label="Date of the data" hint="The day the file was made or fetched from its publisher." className="max-w-[18rem]">
              {(ids) => (
                <Input
                  {...ids}
                  type="date"
                  value={dataDate}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => setDataDate(event.target.value)}
                  required
                />
              )}
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={onClose} disabled={update.isPending}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ListRow({
  list,
  onUpdate,
  onGetAgain,
  getting,
  onEdit,
  onRemove,
  onShow,
}: {
  list: RepeaterListDto;
  onUpdate: () => void;
  /** For a list Outpost fetched, from a source it may still fetch: gets it again. */
  onGetAgain?: () => void;
  getting: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onShow: () => void;
}) {
  const restore = useRestoreRemoved();
  const warning = ageWarning(list);
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-body font-semibold text-ink">{list.name}</p>
        <p className="tabular text-small text-ink-muted">
          {[
            plural(list.count, "repeater"),
            list.source,
            `data of ${formatDate(list.dataDate)}`,
            list.editedCount > 0 ? `${formatNumber(list.editedCount)} changed by you` : "",
            list.setAsideCount > 0 ? `${formatNumber(list.setAsideCount)} set aside as duplicates` : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        <p className="text-small text-ink-muted">
          Read as {list.formatName}
          {list.fileName ? (
            <>
              {" "}
              from <span className="font-mono text-[0.8125rem] break-all">{list.fileName}</span>
            </>
          ) : null}
          .
          {list.sourceUrl ? (
            <>
              {" "}
              <a href={list.sourceUrl} target="_blank" rel="noreferrer noopener" className="text-primary underline underline-offset-2">
                Where it is published
              </a>
            </>
          ) : null}
        </p>
        {list.fetched ? (
          <p className="text-small text-ink-muted">
            Fetched by Outpost from <span className="font-mono text-[0.8125rem] break-all">{hostOf(list.fetched.url)}</span> on{" "}
            {formatDate(list.fetched.fetchedAt)}, on {list.fetched.publisher}'s terms as read on {dayText(list.fetched.termsRead)}.
            {list.fetched.attribution ? ` ${list.fetched.attribution}.` : ""}
          </p>
        ) : null}
        {warning ? (
          <p className="mt-1 flex items-start gap-1.5 text-small text-warning">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span className="text-ink">{warning}</span>
          </p>
        ) : null}
      </div>
      <Button size="sm" onClick={onGetAgain ?? onUpdate} loading={getting} className="max-sm:hidden">
        <RefreshCw /> Bring up to date
      </Button>
      <Menu>
        <MenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={`More for “${list.name}”`}>
            <Ellipsis />
          </Button>
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={onShow}>
            <Search /> Show only this list
          </MenuItem>
          {onGetAgain ? (
            <MenuItem onSelect={onGetAgain}>
              <Download /> Get it again from its publisher
            </MenuItem>
          ) : null}
          <MenuItem onSelect={onUpdate}>
            <RefreshCw /> Bring up to date from a newer file
          </MenuItem>
          <MenuItem onSelect={onEdit}>
            <Pencil /> Name, publisher and date
          </MenuItem>
          <MenuItem
            onSelect={() =>
              restore.mutate(list.id, {
                onSuccess: ({ restored }) =>
                  toast(
                    restored > 0
                      ? `${plural(restored, "repeater")} you had removed ${restored === 1 ? "is" : "are"} back.`
                      : "You have removed nothing from this list.",
                  ),
              })
            }
          >
            <Undo2 /> Bring back what I removed
          </MenuItem>
          <MenuSeparator />
          <MenuItem danger onSelect={onRemove}>
            <Trash2 /> Remove this list
          </MenuItem>
        </MenuContent>
      </Menu>
    </li>
  );
}

const hostOf = (address: string) => {
  try {
    return new URL(address).host;
  } catch {
    return address;
  }
};

function summaryOf(overview: RepeatersOverview): string {
  const parts = [`${plural(overview.total, "repeater")} kept in Outpost`];
  if (overview.lists.length > 0) parts.push(`from ${plural(overview.lists.length, "list")}`);
  if (overview.ownCount > 0) parts.push(`${formatNumber(overview.ownCount)} entered by hand`);
  return `${parts.join(", ")}.`;
}

/** "1 list, data of 17 Nov 2026" or "2 lists, the oldest of 1 Mar 2025": what the closed part about lists holds. */
function listsSummary(lists: RepeaterListDto[], ownCount: number): string {
  if (lists.length === 0) return ownCount > 0 ? "Entered by hand; where to get a list" : "Where to get a list";
  const oldest = Math.min(...lists.map((list) => list.dataDate));
  return `${plural(lists.length, "list")}, ${lists.length === 1 ? "data of" : "the oldest of"} ${formatDate(oldest)}; where to get more`;
}

type View = "list" | "map";
const VIEW_KEY = "outpost.repeaters.view";
const isView = (value: unknown): value is View => value === "list" || value === "map";
/** At this width and wider, the list and the map sit side by side. */
const SIDE_BY_SIDE = "(min-width: 64rem)";

/** The screen's state in its address, so that Back from a repeater comes back to the same list, place and map. */
function useAddressState() {
  const [params, setParams] = useSearchParams();
  const update = useCallback(
    (changes: Record<string, string | null>) => {
      // Read from the address as it is now: two changes in one moment (the map at rest, a filter) must not undo each other.
      const next = new URLSearchParams(window.location.search);
      for (const [name, value] of Object.entries(changes)) {
        if (value === null || value === "") next.delete(name);
        else next.set(name, value);
      }
      setParams(next, { replace: true, preventScrollReset: true });
    },
    [setParams],
  );
  return [params, update] as const;
}

const cameraOf = (text: string | null): CameraView | null => {
  const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/.exec(text ?? "");
  if (!match) return null;
  const view = { lat: Number(match[1]), lon: Number(match[2]), zoom: Number(match[3]) };
  return Math.abs(view.lat) <= 90 && Math.abs(view.lon) <= 180 && view.zoom <= 22 ? view : null;
};

/** The words for a filter that is on, for saying what matched nothing. */
function activeFilters(
  applied: RepeaterFilters,
  withinKm: number | null,
  origin: string,
  lists: Map<string, RepeaterListDto>,
  unit: HeightUnit,
): string[] {
  return [
    applied.band ? bandName(applied.band) : "",
    applied.mode ? modeName(applied.mode) : "",
    withinKm ? `within ${withinText(withinKm, unit)} of ${origin}` : "",
    applied.hideOffAir ? "leaving out those not operational" : "",
    applied.list === "own" ? "only those entered by hand" : applied.list ? `only “${lists.get(applied.list)?.name ?? "one list"}”` : "",
  ].filter(Boolean);
}

export default function RepeatersPage() {
  const navigate = useNavigate();
  const [params, update] = useAddressState();
  const overview = useRepeatersOverview();
  const unit = useHeightUnit();
  const sideBySide = useMediaQuery(SIDE_BY_SIDE, true);

  // Where distances are measured from: the address first, then what this browser last chose.
  const [storedOrigin, setStoredOrigin] = useStoredOrigin(REPEATERS_ORIGIN_KEY);
  // "Open the list" on the Maps screen hands over where the map was looking, as a point on the map.
  const handed = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(params.get("near") ?? "");
  const fromText = params.get("from") ?? (handed ? `point:${handed[1]},${handed[2]}` : storedOrigin);
  const origin = useOrigin([
    fromText,
    (next: string) => {
      setStoredOrigin(next);
      update({ from: next, near: null });
    },
  ]);

  const filters: RepeaterFilters = {
    q: params.get("q") ?? "",
    band: (params.get("band") ?? "") as RepeaterBand | "",
    mode: (params.get("mode") ?? "") as RepeaterMode | "",
    hideOffAir: params.get("off") === "1",
    list: params.get("list") ?? "",
  };
  const set = <K extends keyof RepeaterFilters>(key: K, value: RepeaterFilters[K]) => {
    const name = key === "hideOffAir" ? "off" : key;
    update({ [name]: typeof value === "boolean" ? (value ? "1" : null) : (value as string) || null });
  };
  const within = Number(params.get("within")) || null;
  const sortAsked = (params.get("sort") ?? "near") as RepeaterSort;
  const sort: RepeaterSort = sortAsked === "near" && !origin.position ? "callsign" : sortAsked;
  const [storedView, setStoredView] = useStoredState<View>(VIEW_KEY, isView, "list");
  const view: View = isView(params.get("view")) ? (params.get("view") as View) : storedView;
  const setView = (next: View) => {
    setStoredView(next);
    update({ view: next });
    // The map fills the screen below the switch: brought up to it, so the whole map is in reach of a thumb.
    if (next === "map") requestAnimationFrame(() => document.getElementById("repeaters-view")?.scrollIntoView({ block: "start" }));
  };
  const selectedId = params.get("sel");
  const select = (id: string | null) => update({ sel: id });
  const camera = cameraOf(params.get("map"));

  const typed = useDebounced(filters.q, 250);
  const { band, mode, hideOffAir, list: listId } = filters;
  const applied = useMemo<RepeaterFilters>(
    () => ({ q: typed, band, mode, hideOffAir, list: listId }),
    [typed, band, mode, hideOffAir, listId],
  );
  const withinKm = origin.position && within ? within : null;
  const list = useRepeaterList(applied, origin.position, withinKm, sort);

  const [importing, setImporting] = useState<{ list: RepeaterListDto | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState<RepeaterListDto | null>(null);
  const [removing, setRemoving] = useState<RepeaterListDto | null>(null);
  const [finding, setFinding] = useState(false);
  const getList = useGetList();
  const sources = useRepeaterSources();
  const removeList = useRemoveList();
  const hideId = useId();
  const distance = useDistanceText();

  const lists = useMemo(() => new Map((overview.data?.lists ?? []).map((item) => [item.id, item])), [overview.data]);
  const pages = list.data?.pages ?? [];
  const repeaters = pages.flatMap((page) => page.repeaters);
  const total = pages[0]?.total ?? 0;
  const unplaced = pages[0]?.withoutPosition ?? 0;
  const filtered = Boolean(applied.q.trim() || applied.band || applied.mode || applied.hideOffAir || applied.list || withinKm);
  const held = overview.data?.total ?? 0;
  const near = sort === "near" && origin.position;

  // Round what the list shows, for a map with neither a place nor a view of its own to open on.
  const fallbackFit = useMemo<Bbox | null>(() => {
    const placed = repeaters.filter((repeater) => repeater.lat !== null && repeater.lon !== null);
    if (placed.length === 0) return null;
    const lats = placed.map((repeater) => repeater.lat!);
    const lons = placed.map((repeater) => repeater.lon!);
    return [Math.min(...lons), Math.min(...lats), Math.max(...lons), Math.max(...lats)];
  }, [repeaters]);

  // A repeater chosen on the map is brought into view in the list beside it.
  useEffect(() => {
    if (!selectedId || !sideBySide) return;
    document.getElementById(`repeater-${selectedId}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [selectedId, sideBySide]);

  const bandOptions = [
    { value: ANY, label: "Every band" },
    ...REPEATER_BANDS.filter((band) => overview.data?.bands[band.id]).map((band) => ({
      value: band.id as string,
      label: `${band.name} (${formatNumber(overview.data?.bands[band.id] ?? 0)})`,
    })),
    ...(overview.data?.bands.other ? [{ value: "other", label: `Other bands (${formatNumber(overview.data.bands.other)})` }] : []),
  ];
  const modeOptions = [
    { value: ANY, label: "Every mode" },
    ...REPEATER_MODES.filter((mode) => overview.data?.modes[mode.id]).map((mode) => ({
      value: mode.id as string,
      label: `${mode.name} (${formatNumber(overview.data?.modes[mode.id] ?? 0)})`,
    })),
  ];

  // The main action last, as in the header of every other screen with two.
  const actions = (
    <>
      <Button onClick={() => setAdding(true)}>
        <Plus /> Add by hand
      </Button>
      <Button variant="primary" onClick={() => setImporting({ list: null })}>
        <FileUp /> Import a list
      </Button>
    </>
  );
  const clearFilters = () => update({ q: null, band: null, mode: null, off: null, list: null, within: null });
  const orderWords = near ? `, nearest to ${origin.name} first` : sort === "frequency" ? ", by frequency" : ", by callsign";
  const showMap = sideBySide || view === "map";
  const showList = sideBySide || view === "list";
  const empty = filtered ? activeFilters(applied, withinKm, origin.name, lists, unit) : [];

  const results = (
    <>
      {list.isPending ? (
        <ListSkeleton />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      ) : repeaters.length === 0 ? (
        <div className="border-y border-border py-6 text-body text-ink">
          <p>
            {applied.q.trim() ? `Nothing matches “${applied.q.trim()}”.` : "No repeater matches these filters."}
            {empty.length > 0 ? <span className="text-ink-muted"> Filters on: {empty.join("; ")}.</span> : null}
          </p>
          {filtered ? (
            <Button variant="link" onClick={clearFilters} className="mt-1">
              Clear the filters
            </Button>
          ) : null}
        </div>
      ) : (
        <>
          <Rows aria-label="Repeaters">
            {repeaters.map((repeater) => (
              <RepeaterRow
                key={repeater.id}
                repeater={repeater}
                list={repeater.listId ? lists.get(repeater.listId) : undefined}
                from={origin.position ? origin.name : ""}
                distance={distance}
                selected={sideBySide && selectedId === repeater.id}
                onSelect={sideBySide ? () => select(selectedId === repeater.id ? null : repeater.id) : undefined}
              />
            ))}
          </Rows>
          {list.hasNextPage ? (
            <div className="mt-4 flex items-center gap-3">
              <Button onClick={() => void list.fetchNextPage()} loading={list.isFetchingNextPage}>
                Show more
              </Button>
              <span className="tabular text-small text-ink-muted">
                {formatNumber(repeaters.length)} of {formatNumber(total)} shown
              </span>
            </div>
          ) : null}
        </>
      )}
    </>
  );

  return (
    <Page width="full" className="max-w-[90rem]">
      <PageHeader
        title="Repeaters"
        description="Amateur radio repeaters kept in Outpost: found, measured from a place and written out for a radio with no connection."
        actions={held > 0 ? actions : undefined}
      />

      {overview.isPending ? (
        <ListSkeleton />
      ) : overview.isError ? (
        <ErrorState error={overview.error} onRetry={() => void overview.refetch()} />
      ) : held === 0 && overview.data.lists.length === 0 ? (
        <>
          <LicenceLine use="listen-and-transmit" className="mb-6" />
          <FirstUseGuide
            slug="radio-quick-start"
            words="New to radio here? Four short steps: something to listen to, the frequency sheets, repeaters, and a mesh message."
            className="mb-6"
          />
          <EmptyState title="No repeaters yet" action={actions} seed={7}>
            <p>
              Bring in a list you have as a file: one of those the RSGB's ETCC offers at ukrepeater.net, a file saved from CHIRP, or any CSV
              with a row of headings. Or enter repeaters by hand.
            </p>
            <p className="mt-2">
              Below is where lists can be had, by country. Outpost fetches one itself only where its publisher's terms allow a program to;
              for the others it gives the page and the steps to get the file by hand.
            </p>
          </EmptyState>
          <SourcesSection lists={[]} getList={getList} className="mt-10" />
        </>
      ) : (
        <>
          <p className="tabular -mt-4 mb-6 text-small text-ink-muted">{summaryOf(overview.data)}</p>

          <section aria-label="Find and filter" className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
            <Field label="Find" className="col-span-2">
              {(ids) => (
                <Input
                  {...ids}
                  type="search"
                  value={filters.q}
                  onChange={(event) => set("q", event.target.value)}
                  placeholder="Callsign, town or frequency"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  enterKeyHint="search"
                />
              )}
            </Field>
            <Field label="Band">
              {(ids) => (
                <Select
                  {...ids}
                  value={filters.band || ANY}
                  onChange={(band) => set("band", band === ANY ? "" : (band as RepeaterBand))}
                  options={bandOptions}
                />
              )}
            </Field>
            <Field label="Mode">
              {(ids) => (
                <Select
                  {...ids}
                  value={filters.mode || ANY}
                  onChange={(mode) => set("mode", mode === ANY ? "" : (mode as RepeaterMode))}
                  options={modeOptions}
                />
              )}
            </Field>
            <OriginPicker
              origin={origin}
              onPoint={() => (sideBySide ? undefined : setView("map"))}
              className="col-span-2 grid grid-cols-2 gap-x-4 gap-y-3 [&>*:only-child]:col-span-2 max-sm:[&>*]:col-span-2"
            />
            <Field label="Within" hint={origin.position ? undefined : "Choose where to measure from first."}>
              {(ids) => (
                <Select
                  {...ids}
                  value={origin.position && within ? String(within) : ANY}
                  onChange={(value) => update({ within: value === ANY ? null : value })}
                  disabled={!origin.position}
                  options={[{ value: ANY, label: "Any distance" }, ...withinOptions(unit)]}
                />
              )}
            </Field>
            <Field label="Sort">
              {(ids) => (
                <Select<RepeaterSort>
                  {...ids}
                  value={sort}
                  onChange={(value) => update({ sort: value === "near" ? null : value })}
                  options={[
                    {
                      value: "near",
                      label: "Nearest first",
                      disabled: !origin.position,
                      description: origin.position ? undefined : "Choose where to measure from first",
                    },
                    { value: "callsign", label: "Callsign" },
                    { value: "frequency", label: "Frequency" },
                  ]}
                />
              )}
            </Field>
            <div className="col-span-2 flex flex-wrap items-center gap-2.5 lg:col-span-4">
              <Checkbox id={hideId} checked={filters.hideOffAir} onCheckedChange={(checked) => set("hideOffAir", checked === true)} />
              <label htmlFor={hideId} className="text-small text-ink">
                Leave out those listed as not operational
              </label>
              {filters.list ? (
                <Button variant="ghost" size="sm" className="ml-auto" onClick={() => set("list", "")}>
                  Showing one list only. Show all
                </Button>
              ) : null}
            </div>
          </section>
          {!origin.position && !origin.locating ? (
            <p className="mt-3 flex items-start gap-1.5 text-small text-ink">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <span>
                Choose where to measure from to see distances: {origin.home ? "a place above" : "Home is not set, so choose a place above"},
                or tap the map.
              </span>
            </p>
          ) : null}

          <section aria-labelledby="repeaters-results" className="mt-8">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 id="repeaters-results" className="text-lead font-semibold text-ink">
                  {list.isPending || list.isError ? (
                    "Repeaters"
                  ) : (
                    <span className="tabular" aria-live="polite">
                      {filtered ? `${plural(total, "repeater")} of ${formatNumber(held)}` : plural(total, "repeater")}
                      {total > 1 ? orderWords : ""}
                    </span>
                  )}
                </h2>
                {near && unplaced > 0 && !withinKm ? (
                  <p className="mt-0.5 text-small text-ink-muted">
                    {plural(unplaced, "entry", "entries")} with no position {unplaced === 1 ? "comes" : "come"} last.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setPrinting(true)} disabled={total === 0}>
                  <Printer /> Print these
                </Button>
                <Button size="sm" onClick={() => setExporting(true)} disabled={total === 0}>
                  <Download /> Export these
                </Button>
              </div>
            </div>
            {sideBySide ? null : (
              <div id="repeaters-view" className="scroll-mt-4 max-md:scroll-mt-16">
                <Segmented<View>
                  label="Show as"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: "list", label: "List", icon: <ListIcon aria-hidden /> },
                    { value: "map", label: "Map", icon: <MapIcon aria-hidden /> },
                  ]}
                  className="mb-3 w-full sm:w-auto"
                />
              </div>
            )}
            <div className={sideBySide ? "grid grid-cols-[minmax(0,26rem)_minmax(0,1fr)] items-start gap-6" : undefined}>
              {showList ? <div className="min-w-0">{results}</div> : null}
              {showMap ? (
                <RepeatersMap
                  filters={applied}
                  origin={origin}
                  withinKm={withinKm}
                  selectedId={selectedId}
                  onSelect={select}
                  view={camera}
                  onView={(next) => update({ map: `${next.lat.toFixed(4)},${next.lon.toFixed(4)},${next.zoom.toFixed(2)}` })}
                  fallbackFit={fallbackFit}
                  className={
                    sideBySide ? "sticky top-4 h-[calc(100dvh-2rem)] max-h-[56rem] min-h-[28rem]" : "h-[max(20rem,calc(100dvh-17rem))]"
                  }
                />
              ) : null}
            </div>
            <p className="mt-4 max-w-[70ch] text-small text-ink-muted">
              {REPEATER_STATUS_LINE} Distances are from listed positions, which lists write roughly for private sites; bearings are from
              true north. {REPEATER_LICENCE_LINE}
            </p>
          </section>

          <LicenceLine use="listen-and-transmit" className="mt-8" />
          <FirstUseGuide
            slug="radio-quick-start"
            words="New to radio here? Four short steps: something to listen to, the frequency sheets, repeaters, and a mesh message."
            className="mt-4"
          />

          <Disclosure
            summary={`Lists and where to get them: ${listsSummary(overview.data.lists, overview.data.ownCount)}`}
            className="mt-8"
          >
            <Section
              title="Where these came from"
              description="Each list keeps the date of its data. Bringing one up to date leaves alone what you changed."
              actions={
                <Button size="sm" onClick={() => setFinding(true)} disabled={held < 2}>
                  <Merge /> Find duplicates
                </Button>
              }
              className="mt-2"
            >
              {overview.data.lists.length === 0 ? (
                <p className="border-y border-border py-4 text-small text-ink-muted">
                  No list has been imported. Every entry here was entered by hand.
                </p>
              ) : (
                <Rows aria-label="Imported lists">
                  {overview.data.lists.map((item) => {
                    const source = item.fetched ? sources.data?.sources.find((entry) => entry.id === item.fetched?.sourceId) : undefined;
                    return (
                      <ListRow
                        key={item.id}
                        list={item}
                        onUpdate={() => setImporting({ list: item })}
                        onGetAgain={source?.kind === "fetch" ? () => getList.start(source, { aloud: true }) : undefined}
                        getting={source !== undefined && getList.busyId === source.id}
                        onEdit={() => setEditing(item)}
                        onRemove={() => setRemoving(item)}
                        onShow={() => set("list", item.id)}
                      />
                    );
                  })}
                </Rows>
              )}
              {overview.data.ownCount > 0 ? (
                <p className="mt-3 text-small text-ink-muted">
                  {plural(overview.data.ownCount, "entry", "entries")} entered by hand.{" "}
                  <Button variant="link" onClick={() => set("list", "own")}>
                    Show only those
                  </Button>
                </p>
              ) : null}
            </Section>

            <SourcesSection lists={overview.data.lists} getList={getList} />
          </Disclosure>
        </>
      )}

      <ImportDialog open={importing !== null} list={importing?.list} onClose={() => setImporting(null)} />
      <RepeaterFormDialog
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(repeater) => navigate(`/radio/repeaters/${repeater.id}`)}
      />
      <ExportDialog
        open={exporting}
        onClose={() => setExporting(false)}
        filters={applied}
        near={origin.position}
        withinKm={withinKm}
        sort={sort}
        total={total}
        from={origin.name}
      />
      <PrintDialog
        open={printing}
        onClose={() => setPrinting(false)}
        filters={applied}
        near={origin.position}
        withinKm={withinKm}
        sort={sort}
        total={total}
        from={origin.name}
        lists={lists}
      />
      <ListDetailsDialog list={editing} onClose={() => setEditing(null)} />
      <DuplicatesDialog open={finding} onClose={() => setFinding(false)} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={`Remove “${removing?.name ?? ""}”?`}
        description={
          <>
            Its {plural(removing?.count ?? 0, "repeater")} will be removed from this device
            {removing && removing.editedCount > 0 ? `, including the ${formatNumber(removing.editedCount)} you changed` : ""}. Entries from
            other lists and those you entered by hand are not touched. The file you imported it from is not kept by Outpost, so keep your
            own copy if you may want it again.
          </>
        }
        confirmLabel="Remove list"
        loading={removeList.isPending}
        onConfirm={() =>
          removing &&
          removeList.mutate(removing.id, {
            onSuccess: () => {
              toast.success(`Removed “${removing.name}”.`);
              if (filters.list === removing.id) set("list", "");
              setRemoving(null);
            },
          })
        }
      />
    </Page>
  );
}
