/**
 * The Routes tab: routes drawn on the map and tracks imported from map files, their
 * visibility on the map, and one of them in detail with its elevation profile.
 */
import type { Bbox, TrackDto } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowLeft, Car, CircleAlert, Download, Ellipsis, FileUp, Mountain, PenLine, Scan, Search, Spline, Trash2 } from "lucide-react";
import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Checkbox, Segmented, Skeleton } from "@/components/ui/misc";
import { KeepTrackButton } from "@/features/kept/keep-controls";
import { ShareCodeButton } from "@/features/qr/share-code";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatDate, formatNumber, plural } from "@/lib/utils";
import { useDeleteTrack, useSaveRoute, useTrack, useUpdateTrack } from "../data";
import { FoundRouteFacts, FoundRouteHeights, FoundRouteNote, foundRouteSource } from "../find-route/source-credit";
import type { LatLon } from "../lib/geo";
import { MAP_FILE_ACCEPT } from "../lib/map-files";
import { MARKER_HEX } from "../lib/palette";
import { buildProfile, routeOrigin } from "../lib/profile";
import { EDITABLE_POINTS, editablePoints } from "../lib/route-edit";
import { trackFacts, trackSummary } from "../lib/tracks";
import { ColorPicker, Fact, PANEL_ROWS, ShowMoreRow } from "../ui";
import { ElevationProfile } from "./elevation-profile";
import { terrainCover } from "./route-editor";

/** A short stroke in the track's colour, as it is drawn on the map. */
function TrackSwatch({ track }: { track: Pick<TrackDto, "color"> }) {
  return <span aria-hidden className="mt-2.5 h-1 w-5 shrink-0 rounded-full" style={{ background: MARKER_HEX[track.color] }} />;
}

export function RouteDetail({
  track,
  visible,
  mapReady,
  onVisibleChange,
  onFit,
  onClose,
  onDeleted,
  onScrub,
  terrain,
  onEditShape,
}: {
  track: TrackDto;
  visible: boolean;
  mapReady: boolean;
  onVisibleChange: (visible: boolean) => void;
  onFit: () => void;
  onClose: () => void;
  onDeleted: () => void;
  onScrub: (position: LatLon | null) => void;
  /** The box installed terrain covers; null when there is none. */
  terrain: Bbox | null;
  /**
   * Opens the drawing tool on this route's line. `asCopy` leaves this route as it is
   * and starts a new one from its line; `replacesRecording` says that saving will
   * replace points recorded in a file.
   */
  onEditShape: (points: LatLon[], options: { asCopy: boolean; replacesRecording: boolean }) => void;
}) {
  const visibleId = useId();
  const geometry = useTrack(track.id);
  const update = useUpdateTrack();
  const remove = useDeleteTrack();
  const heights = useSaveRoute();
  const [name, setName] = useState(track.name);
  const [confirming, setConfirming] = useState(false);
  const [reshaping, setReshaping] = useState(false);
  const origin = useMemo(() => (geometry.data ? routeOrigin(geometry.data.geojson) : null), [geometry.data]);
  // A route found in a route source carries where it came from; one drawn or imported does not.
  const found = useMemo(() => foundRouteSource(geometry.data?.geojson), [geometry.data]);
  const editable = useMemo(() => (geometry.data ? editablePoints(geometry.data.geojson) : null), [geometry.data]);
  // A drawn route saved before terrain was installed can be given its heights now.
  const canFillHeights = Boolean(
    origin?.drawn && origin.elevation !== "terrain" && editable && terrainCover(editable.points, terrain) !== "none",
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset the field when another track is opened or the name is changed elsewhere
  useEffect(() => setName(track.name), [track.id, track.name]);
  const profile = useMemo(() => (geometry.data ? buildProfile(geometry.data.geojson) : null), [geometry.data]);
  const renamed = name.trim() !== track.name && name.trim().length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ArrowLeft /> Routes
        </Button>
      </div>
      <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
        <h3 className="font-title text-lead text-ink">{track.name}</h3>

        {geometry.isPending ? (
          <Skeleton className="h-40" />
        ) : geometry.isError ? (
          <ErrorState error={geometry.error} onRetry={() => geometry.refetch()} />
        ) : (
          <div className="grid gap-2">
            {profile ? (
              <ElevationProfile profile={profile} color={MARKER_HEX[track.color]} onScrub={onScrub} />
            ) : found && !origin?.drawn ? null : (
              <p className="text-small text-ink-muted">
                {origin?.drawn ? (
                  <>
                    No terrain is installed where this route runs, so there are no heights to draw an elevation profile from. Nothing is
                    downloaded to find them.{" "}
                    <Link to="/maps?offline=region" className="font-medium text-primary underline underline-offset-2">
                      Get terrain in Offline maps
                    </Link>
                  </>
                ) : origin?.recorded ? (
                  "The device that recorded this gave no heights, so there is no elevation profile to draw."
                ) : (
                  "This file has no heights, so there is no elevation profile to draw."
                )}
              </p>
            )}
            {found ? (
              <FoundRouteHeights
                track={track}
                geojson={geometry.data.geojson}
                terrain={terrain}
                hasProfile={Boolean(profile)}
                reshaped={Boolean(origin?.drawn)}
              />
            ) : null}
            {origin?.drawn && profile ? (
              <p className="text-small text-ink-muted">
                {origin.elevation === "partial"
                  ? "Terrain is installed for only part of this route. The profile and the ascent cover that part; the rest has no heights."
                  : "Heights are read from the installed terrain, along the straight lines between the points."}
              </p>
            ) : null}
            {canFillHeights && editable ? (
              <div className="grid gap-1.5">
                {!profile ? <p className="text-small text-ink-muted">Terrain has been installed here since it was saved.</p> : null}
                <Button
                  className="justify-self-start"
                  loading={heights.isPending}
                  onClick={() =>
                    heights.mutate(
                      { id: track.id, name: track.name, color: track.color, points: editable.points },
                      {
                        onSuccess: ({ elevation }) =>
                          elevation === "none"
                            ? toast("No heights were found: the installed terrain does not reach this route.")
                            : toast.success(`Heights filled in for “${track.name}”.`),
                        onError: (error) => notify.error(errorMessage(error)),
                      },
                    )
                  }
                >
                  <Mountain /> Fill in heights from terrain
                </Button>
              </div>
            ) : null}
          </div>
        )}

        <dl>
          {trackFacts(track, { drawn: origin?.drawn || Boolean(found), recorded: origin?.recorded }).map((fact) => (
            <Fact key={fact.label} label={fact.label}>
              {fact.value}
            </Fact>
          ))}
          <Fact
            label={found ? "Added" : origin?.recorded ? "Recorded" : track.sourceFilename || origin?.drawn === false ? "Imported" : "Drawn"}
          >
            {formatDate(track.createdAt)}
            {track.sourceFilename ? (
              <span className="block font-mono text-[0.8125rem] break-all text-ink-muted">{track.sourceFilename}</span>
            ) : null}
            {(track.sourceFilename || found) && origin?.drawn ? (
              <span className="block text-ink-muted">Shape redrawn by hand since</span>
            ) : null}
          </Fact>
          {found ? <FoundRouteFacts source={found} /> : null}
        </dl>
        {found ? <FoundRouteNote source={found} /> : null}

        <div className="flex flex-wrap gap-2">
          <Button onClick={onFit} disabled={!mapReady || !track.bounds}>
            <Scan /> Fit to view
          </Button>
          <Button
            disabled={!mapReady || !editable || !origin}
            onClick={() => {
              if (!editable || !origin) return;
              // A drawn line is the person's own points: nothing recorded is at stake.
              if (origin.drawn) onEditShape(editable.points, { asCopy: false, replacesRecording: false });
              else setReshaping(true);
            }}
          >
            <Spline /> Edit shape
          </Button>
          <Button asChild>
            <a href={`/api/maps/tracks/${track.id}/export.gpx`} download>
              <Download /> Export as GPX
            </a>
          </Button>
          <Menu>
            <MenuTrigger asChild>
              <Button>
                <Download /> Other formats
              </Button>
            </MenuTrigger>
            <MenuContent>
              {EXPORT_FORMATS.filter((format) => format.id !== "gpx").map((format) => (
                <MenuItem key={format.id} asChild>
                  <a href={`/api/maps/tracks/${track.id}/export.${format.id}`} download>
                    Export as {format.label}
                  </a>
                </MenuItem>
              ))}
            </MenuContent>
          </Menu>
          <KeepTrackButton track={track} />
          <ShareCodeButton
            size="md"
            target={{ name: track.name, outpostPath: `/maps?track=${track.id}`, gpxPath: `/api/maps/tracks/${track.id}/export.gpx` }}
          />
        </div>

        <div className="flex items-center gap-3">
          <Checkbox id={visibleId} checked={visible} onCheckedChange={(checked) => onVisibleChange(checked === true)} />
          <label htmlFor={visibleId} className="text-small text-ink">
            Show on the map
          </label>
        </div>

        <form
          className="flex items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (renamed) update.mutate({ id: track.id, name: name.trim() });
          }}
        >
          <Field label="Name" className="min-w-0 flex-1">
            {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={200} required />}
          </Field>
          {renamed ? (
            <Button type="submit" variant="primary" loading={update.isPending && update.variables?.name !== undefined}>
              Save name
            </Button>
          ) : null}
        </form>

        <div className="grid gap-1.5">
          <span className="text-small font-medium text-ink">Colour on the map</span>
          <ColorPicker label="Colour on the map" value={track.color} onChange={(color) => update.mutate({ id: track.id, color })} />
        </div>

        <div className="border-t border-border pt-3">
          <Button variant="danger-ghost" className="-ml-3" onClick={() => setConfirming(true)}>
            <Trash2 /> Delete route
          </Button>
        </div>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Delete “${track.name}”?`}
        description="The route is removed from the map and from search. Places saved from its waypoints are kept. Export it first if you want a copy; this cannot be undone."
        confirmLabel="Delete route"
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(track.id, {
            onSuccess: () => {
              setConfirming(false);
              onDeleted();
            },
          })
        }
      />
      {editable && origin ? (
        <ReshapeRecordingDialog
          open={reshaping}
          onOpenChange={setReshaping}
          track={track}
          found={Boolean(found)}
          recorded={editable.recorded}
          editablePoints={editable.points.length}
          parts={editable.parts}
          timed={origin.timed}
          hasHeights={track.ascentMeters !== null}
          terrainCover={terrainCover(editable.points, terrain)}
          onChoose={(asCopy) => {
            setReshaping(false);
            onEditShape(editable.points, { asCopy, replacesRecording: !asCopy });
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Asked before the shape of an imported recording is edited: what was recorded cannot
 * be edited point by point and kept as it was, so this says exactly what goes, and
 * offers to work on a copy instead.
 */
function ReshapeRecordingDialog({
  open,
  onOpenChange,
  track,
  found,
  recorded,
  editablePoints: editableCount,
  parts,
  timed,
  hasHeights,
  terrainCover: cover,
  onChoose,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  track: TrackDto;
  /** The route was found in a route source, not recorded. */
  found?: boolean;
  /** Points in the recording. */
  recorded: number;
  /** Points of the line that will be edited. */
  editablePoints: number;
  parts: number;
  timed: boolean;
  hasHeights: boolean;
  terrainCover: "all" | "some" | "none";
  onChoose: (asCopy: boolean) => void;
}) {
  const thinned = editableCount < recorded;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`Edit the shape of “${track.name}”?`}
        description={
          found
            ? "This route's line came from OpenStreetMap. Saving a new shape replaces that line with yours; its credit is kept."
            : track.sourceFilename
              ? `This route is a recording imported from ${track.sourceFilename}. Saving a new shape replaces what was recorded.`
              : "This route is a recording. Saving a new shape replaces what was recorded."
        }
        size="md"
      >
        <DialogBody className="grid gap-3">
          <ul className="grid list-disc gap-1.5 pl-5 text-small text-ink">
            <li>
              {thinned
                ? `Its ${formatNumber(recorded)} recorded points are replaced by a simpler line of ${plural(editableCount, "point")} that follows the same shape, which you can then move. A recording has too many points to edit one by one (the tool works with about ${EDITABLE_POINTS}).`
                : `Its ${plural(recorded, "recorded point")} become points you can move, add to and remove.`}
            </li>
            {parts > 1 ? <li>Its {parts} separate lines are joined end to end into one.</li> : null}
            {timed ? <li>The time recorded at each point is dropped.</li> : null}
            {hasHeights ? (
              <li>
                {cover === "all"
                  ? "The heights from the file are replaced by heights read from the installed terrain."
                  : cover === "some"
                    ? "The heights from the file are dropped. Terrain is installed for only part of this route, so only that part gets heights back."
                    : "The heights from the file are dropped, and no terrain is installed here to replace them: the route will have no ascent or elevation profile."}
              </li>
            ) : null}
            <li>Its name, colour and waypoints are kept.</li>
          </ul>
          <p className="text-small text-ink-muted">
            Nothing changes until you save. To keep the recording as well, edit a copy, or{" "}
            <a
              href={`/api/maps/tracks/${track.id}/export.gpx`}
              download
              className="text-primary underline decoration-1 underline-offset-2 hover:decoration-2"
            >
              export it as GPX
            </a>{" "}
            first.
          </p>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onChoose(true)}>Edit a copy</Button>
          <Button variant="primary" onClick={() => onChoose(false)}>
            Edit this route
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function RoutesList({
  tracks,
  markerCount,
  hidden,
  onVisibleChange,
  onOpen,
  onImport,
  onDraw,
  onFind,
  onRoadRoute,
  canDraw,
  footer,
}: {
  tracks: UseQueryResult<TrackDto[]>;
  markerCount: number;
  hidden: string[];
  onVisibleChange: (id: string, visible: boolean) => void;
  onOpen: (track: TrackDto) => void;
  /** Hands chosen files to the import dialog. */
  onImport: (files: File[]) => void;
  /** Starts drawing a new route on the map. */
  onDraw: () => void;
  /** Opens "Find a route": looking a known route up in a route source. */
  onFind: () => void;
  /** Opens "Road route": planned road directions from the road networks installed. */
  onRoadRoute: () => void;
  /** False when the map could not be drawn, so there is nothing to draw on. */
  canDraw: boolean;
  /** Under the list: on a phone, the saved routes of Directions. */
  footer?: ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const [rows, setRows] = useState(PANEL_ROWS);
  const all = tracks.data ?? [];

  const chooser = (
    <input
      ref={input}
      type="file"
      accept={MAP_FILE_ACCEPT}
      multiple
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(event) => {
        const files = [...(event.target.files ?? [])];
        event.target.value = "";
        if (files.length > 0) onImport(files);
      }}
    />
  );

  if (tracks.isPending) {
    return (
      <div className="grid gap-3 p-4" aria-busy>
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (tracks.isError) {
    return (
      <div className="p-4">
        <ErrorState error={tracks.error} onRetry={() => tracks.refetch()} />
      </div>
    );
  }

  if (all.length === 0) {
    return (
      <div className="px-4 py-5">
        {chooser}
        <h3 className="font-title text-lead text-ink">No routes yet</h3>
        <p className="mt-1.5 text-small text-ink-muted">
          Draw a route on the map point by point, find a known one by name (a waymarked walk, a cycle route), plan a drive by road, or
          import a file (GPX, KML, KMZ or GeoJSON) from a GPS, a phone app, a route-planning site or a council's open data. Whichever way,
          it is shown on the map with its distance, and can be exported as GPX. You can also drop a file onto the map.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onDraw} disabled={!canDraw}>
            <PenLine /> Draw a route
          </Button>
          <Button onClick={onFind}>
            <Search /> Find a route
          </Button>
          <Button onClick={onRoadRoute}>
            <Car /> Directions
          </Button>
          <Button onClick={() => input.current?.click()}>
            <FileUp /> Import a map file
          </Button>
          {markerCount > 0 ? (
            <Button asChild>
              <a href="/api/maps/export.gpx?markers=1" download>
                <Download /> Export places as GPX
              </a>
            </Button>
          ) : null}
        </div>
        {footer ? <div className="mt-5">{footer}</div> : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {chooser}
      <div className="flex flex-wrap items-center gap-2 px-4 pt-3">
        <Button onClick={onDraw} disabled={!canDraw}>
          <PenLine /> Draw a route
        </Button>
        <Button onClick={onRoadRoute}>
          <Car /> Directions
        </Button>
        <Button onClick={() => input.current?.click()}>
          <FileUp /> Import a map file
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions for routes" className="ml-auto">
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setExporting(true)}>
              <Download /> Export routes and places
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <div className="px-4 pt-2">
        {/* A way in, not a field: the search itself, and the words about where it is sent, are one step on. */}
        <button
          type="button"
          onClick={onFind}
          className="flex h-9 w-full items-center gap-2 rounded-control border border-border-strong bg-page px-3 text-left text-small text-ink-muted transition-colors hover:border-ink-faint hover:text-ink max-md:h-11 md:pointer-coarse:h-11"
        >
          <Search aria-hidden className="size-4 shrink-0" />
          Find a route by name or in this view
        </button>
      </div>
      <p className="tabular px-4 pt-2 pb-2 text-micro text-ink-muted">
        {plural(all.length, "route")}
        {hidden.length > 0 ? `, ${all.filter((track) => hidden.includes(track.id)).length} hidden` : ""}
      </p>
      <ul className="scroll-quiet min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
        {all.slice(0, rows).map((track) => {
          const visible = !hidden.includes(track.id);
          return (
            <li key={track.id} className="flex items-stretch">
              <div className="grid w-11 shrink-0 place-content-center">
                <Checkbox
                  checked={visible}
                  onCheckedChange={(checked) => onVisibleChange(track.id, checked === true)}
                  aria-label={`Show ${track.name} on the map`}
                />
              </div>
              <button
                type="button"
                onClick={() => onOpen(track)}
                className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-4 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3 md:pointer-coarse:py-3"
              >
                <TrackSwatch track={track} />
                <span className="min-w-0">
                  <span className="block truncate text-small font-medium text-ink">{track.name}</span>
                  <span className="tabular block truncate text-small text-ink-muted">{trackSummary(track)}</span>
                </span>
              </button>
            </li>
          );
        })}
        {all.length > rows ? (
          <ShowMoreRow shown={rows} total={all.length} onMore={() => setRows((current) => current + PANEL_ROWS)} />
        ) : null}
        {footer ? <li className="px-4 pb-4">{footer}</li> : null}
      </ul>
      <ExportDialog open={exporting} onOpenChange={setExporting} tracks={all} markerCount={markerCount} />
    </div>
  );
}

/** The server reads the chosen tracks from the address, which has a length limit. */
const MAX_EXPORT_QUERY = 3900;

/** The formats routes and places are exported in, and what reads each. */
const EXPORT_FORMATS = [
  { id: "gpx", label: "GPX", about: "Any GPS or mapping app reads it. Outlines stay closed lines; GPX has no areas." },
  {
    id: "kml",
    label: "KML",
    about: "Google Earth and most mapping apps read it. Each route is a folder in its colour, outlines are areas.",
  },
  { id: "geojson", label: "GeoJSON", about: "GIS programs and web maps read it. Outlines are areas." },
] as const;
type ExportFormatId = (typeof EXPORT_FORMATS)[number]["id"];

function ExportDialog({
  open,
  onOpenChange,
  tracks,
  markerCount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tracks: TrackDto[];
  markerCount: number;
}) {
  const placesId = useId();
  const [withPlaces, setWithPlaces] = useState(true);
  const [format, setFormat] = useState<ExportFormatId>("gpx");
  const [excluded, setExcluded] = useState<string[]>([]);
  const chosen = tracks.filter((track) => !excluded.includes(track.id));
  const includePlaces = withPlaces && markerCount > 0;
  const ids = chosen.map((track) => track.id).join(",");
  const tooMany = ids.length > MAX_EXPORT_QUERY;
  const nothing = chosen.length === 0 && !includePlaces;
  const href = `/api/maps/export.${format}?${new URLSearchParams({ ...(includePlaces ? { markers: "1" } : {}), ...(ids ? { tracks: ids } : {}) }).toString()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Export routes and places"
        description="One file with the routes you choose and, if you like, your saved places."
        size="sm"
      >
        <DialogBody>
          <div className="grid gap-1.5 border-b border-border pb-3">
            <Segmented
              label="Format"
              value={format}
              onChange={setFormat}
              options={EXPORT_FORMATS.map((option) => ({ value: option.id, label: option.label }))}
            />
            <p className="text-small text-ink-muted">{EXPORT_FORMATS.find((option) => option.id === format)?.about}</p>
          </div>
          <div className="flex items-start gap-3 border-b border-border py-3">
            <Checkbox
              id={placesId}
              checked={includePlaces}
              disabled={markerCount === 0}
              onCheckedChange={(checked) => setWithPlaces(checked === true)}
              className="mt-0.5"
            />
            <label htmlFor={placesId} className="text-small text-ink">
              Saved places
              <span className="tabular block text-ink-muted">
                {markerCount === 0 ? "There are none yet" : plural(markerCount, "place")}
              </span>
            </label>
          </div>
          <ul className="divide-y divide-border">
            {tracks.map((track) => {
              const id = `${placesId}-${track.id}`;
              return (
                <li key={track.id} className="flex items-start gap-3 py-2.5">
                  <Checkbox
                    id={id}
                    checked={!excluded.includes(track.id)}
                    onCheckedChange={(checked) =>
                      setExcluded((current) => (checked === true ? current.filter((item) => item !== track.id) : [...current, track.id]))
                    }
                    className="mt-0.5"
                  />
                  <label htmlFor={id} className="min-w-0 text-small text-ink">
                    <span className="block truncate">{track.name}</span>
                    <span className="tabular block text-ink-muted">{trackSummary(track)}</span>
                  </label>
                </li>
              );
            })}
          </ul>
          {tooMany ? (
            <Notice tone="warning" icon={<CircleAlert />} className="mt-3">
              That is more routes than one export can name. Untick some and export the rest in a second file.
            </Notice>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Cancel</Button>
          {nothing || tooMany ? (
            <Button variant="primary" disabled>
              <Download /> Export as {EXPORT_FORMATS.find((option) => option.id === format)?.label}
            </Button>
          ) : (
            <Button asChild variant="primary">
              <a href={href} download onClick={() => onOpenChange(false)}>
                <Download /> Export as {EXPORT_FORMATS.find((option) => option.id === format)?.label}
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
