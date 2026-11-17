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
  type RepeatersOverview,
} from "@outpost/shared";
import { CircleAlert, Download, Ellipsis, FileUp, Merge, Pencil, Plus, RefreshCw, Search, Trash2, Undo2 } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { toast } from "sonner";
import { EmptyState, ErrorState, Notice, Page, PageHeader, Rows, Section } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Checkbox, Select, Skeleton } from "@/components/ui/misc";
import { formatBearing, formatDistance } from "@/features/maps/lib/geo";
import { useDebounced } from "@/lib/use-debounced";
import { formatDate, formatNumber, plural } from "@/lib/utils";
import {
  exportHref,
  type LatLon,
  NO_FILTERS,
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
import { OriginPicker, useOrigin } from "./origin";
import { RepeaterFormDialog } from "./repeater-form";
import { SourcesSection, useGetList } from "./sources-section";
import { accessParts, ageWarning, dayText, isApproximate, shiftWords, sourceOf } from "./words";

const ANY = "any";
const WITHIN = ["10", "25", "50", "100", "200", "500"] as const;

/** One repeater in the list: what to listen on and how to get in first, then where it is and where it came from. */
function RepeaterRow({ repeater, list, from }: { repeater: RepeaterDto; list: RepeaterListDto | undefined; from: string }) {
  const source = sourceOf(list);
  const access = accessParts(repeater);
  return (
    <li>
      <Link
        to={`/radio/repeaters/${repeater.id}`}
        className="-mx-2 grid gap-x-4 gap-y-0.5 rounded-control px-2 py-2.5 hover:bg-surface focus-visible:-outline-offset-2 sm:grid-cols-[minmax(0,1fr)_auto]"
      >
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <span className="text-body font-semibold text-ink">{repeater.callsign}</span>
          <span className="tabular font-mono text-[0.875rem] text-ink">{formatMHz(repeater.outputHz)}</span>
          <span className="tabular text-small text-ink-muted">{shiftWords(repeater)}</span>
          {access.length > 0 ? <span className="tabular text-small text-ink">{access.join(", ")}</span> : null}
        </span>
        <span className="tabular text-small text-ink sm:text-right">
          {repeater.distanceMeters !== undefined && repeater.bearingDegrees !== undefined ? (
            <>
              {isApproximate(repeater) ? "about " : ""}
              {formatDistance(repeater.distanceMeters)}, {formatBearing(repeater.bearingDegrees)}
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
      </Link>
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
  total,
  from,
}: {
  open: boolean;
  onClose: () => void;
  filters: RepeaterFilters;
  near: LatLon | null;
  withinKm: number | null;
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
            {near ? `, nearest to ${from} first` : ", in callsign order"}. Change the filters behind this box to choose a different set.
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
            hint={near ? "The nearest come first, so a small number is the nearest few." : "Radios hold a limited number of channels."}
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
              <a href={exportHref(format, filters, near, withinKm, count)} download onClick={onClose}>
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
            <Field label="Who publishes it">
              {(ids) => <Input {...ids} value={source} onChange={(event) => setSource(event.target.value)} maxLength={200} />}
            </Field>
            <Field label="Where it is published" hint="A web address, for finding a newer copy. Outpost never opens it itself.">
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

export default function RepeatersPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const overview = useRepeatersOverview();
  // "Open the list" on the map hands over where the map was looking.
  const handed = useMemo(() => {
    const match = /^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(params.get("near") ?? "");
    return match ? { lat: Number(match[1]), lon: Number(match[2]) } : null;
  }, [params]);
  const origin = useOrigin(handed);
  const [filters, setFilters] = useState<RepeaterFilters>(() => ({ ...NO_FILTERS, q: params.get("q") ?? "" }));
  const [within, setWithin] = useState<string>(ANY);
  const typed = useDebounced(filters.q, 250);
  const applied = useMemo(() => ({ ...filters, q: typed }), [filters, typed]);
  const withinKm = origin.position && within !== ANY ? Number(within) : null;
  const list = useRepeaterList(applied, origin.position, withinKm);

  const [importing, setImporting] = useState<{ list: RepeaterListDto | null } | null>(null);
  const [adding, setAdding] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [editing, setEditing] = useState<RepeaterListDto | null>(null);
  const [removing, setRemoving] = useState<RepeaterListDto | null>(null);
  const [finding, setFinding] = useState(false);
  const getList = useGetList();
  const sources = useRepeaterSources();
  const removeList = useRemoveList();
  const hideId = useId();

  const lists = useMemo(() => new Map((overview.data?.lists ?? []).map((item) => [item.id, item])), [overview.data]);
  const pages = list.data?.pages ?? [];
  const repeaters = pages.flatMap((page) => page.repeaters);
  const total = pages[0]?.total ?? 0;
  const unplaced = pages[0]?.withoutPosition ?? 0;
  const set = <K extends keyof RepeaterFilters>(key: K, value: RepeaterFilters[K]) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const filtered = Boolean(applied.q.trim() || applied.band || applied.mode || applied.hideOffAir || applied.list || withinKm);
  const held = overview.data?.total ?? 0;

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

  return (
    <Page>
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
                  spellCheck={false}
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
            <OriginPicker origin={origin} />
            <Field label="Within">
              {(ids) => (
                <Select
                  {...ids}
                  value={origin.position ? within : ANY}
                  onChange={setWithin}
                  disabled={!origin.position}
                  options={[{ value: ANY, label: "Any distance" }, ...WITHIN.map((km) => ({ value: km as string, label: `${km} km` }))]}
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
          {origin.choice === "map" && !origin.position ? (
            <p className="mt-2 text-small text-ink-muted">The map has not been opened in this browser yet, so its middle is not known.</p>
          ) : null}

          <Section
            className="mt-8"
            title={
              list.isPending ? (
                "Repeaters"
              ) : (
                <span className="tabular" aria-live="polite">
                  {filtered ? `${plural(total, "repeater")} of ${formatNumber(held)}` : plural(total, "repeater")}
                  {origin.position ? `, nearest to ${origin.name} first` : ""}
                </span>
              )
            }
            description={
              origin.position && unplaced > 0 && !withinKm
                ? `${plural(unplaced, "entry", "entries")} with no position ${unplaced === 1 ? "comes" : "come"} last.`
                : undefined
            }
            actions={
              <Button size="sm" onClick={() => setExporting(true)} disabled={total === 0}>
                <Download /> Export these
              </Button>
            }
          >
            {list.isPending ? (
              <ListSkeleton />
            ) : list.isError ? (
              <ErrorState error={list.error} onRetry={() => void list.refetch()} />
            ) : repeaters.length === 0 ? (
              <p className="border-y border-border py-6 text-body text-ink-muted">
                No repeater matches. {withinKm ? `None of those held is within ${withinKm} km of ${origin.name}. ` : ""}
                {filtered ? (
                  <Button
                    variant="link"
                    onClick={() => {
                      setFilters(NO_FILTERS);
                      setWithin(ANY);
                    }}
                  >
                    Clear the filters
                  </Button>
                ) : null}
              </p>
            ) : (
              <>
                <Rows aria-label="Repeaters">
                  {repeaters.map((repeater) => (
                    <RepeaterRow
                      key={repeater.id}
                      repeater={repeater}
                      list={repeater.listId ? lists.get(repeater.listId) : undefined}
                      from={origin.position ? origin.name : ""}
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
            <p className="mt-4 max-w-[70ch] text-small text-ink-muted">
              {REPEATER_STATUS_LINE} Distances are from listed positions, which lists write roughly for private sites.{" "}
              {REPEATER_LICENCE_LINE}
            </p>
          </Section>

          <Section
            title="Where these came from"
            description="Each list keeps the date of its data. Bringing one up to date leaves alone what you changed."
            actions={
              <Button size="sm" onClick={() => setFinding(true)} disabled={held < 2}>
                <Merge /> Find duplicates
              </Button>
            }
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
        total={total}
        from={origin.name}
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
