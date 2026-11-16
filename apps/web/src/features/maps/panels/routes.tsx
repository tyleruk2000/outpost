/**
 * The Routes tab: routes drawn on the map and tracks imported from GPX files, their
 * visibility on the map, and one of them in detail with its elevation profile.
 */
import { type Bbox, formatBytes, type MarkerDto, type TrackDto, type TrackImportResponse } from "@outpost/shared";
import type { UseQueryResult } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, CircleCheck, Download, Ellipsis, FileUp, Mountain, PenLine, Scan, Spline, Trash2 } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { Checkbox, Skeleton, Spinner } from "@/components/ui/misc";
import { KeepTrackButton } from "@/features/kept/keep-controls";
import { errorMessage } from "@/lib/api";
import { formatDate, formatNumber, plural } from "@/lib/utils";
import { importGpx, useDeleteTrack, useSaveRoute, useTrack, useUpdateTrack } from "../data";
import type { LatLon } from "../lib/geo";
import { MARKER_HEX } from "../lib/palette";
import { buildProfile, routeOrigin } from "../lib/profile";
import { EDITABLE_POINTS, editablePoints } from "../lib/route-edit";
import { trackFacts, trackSummary } from "../lib/tracks";
import { ColorPicker, Fact } from "../ui";
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
            ) : (
              <p className="text-small text-ink-muted">
                {origin?.drawn
                  ? "No terrain is installed where this route runs, so there are no heights to draw an elevation profile from. Nothing is downloaded to find them."
                  : "This file has no heights, so there is no elevation profile to draw."}
              </p>
            )}
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
                        onError: (error) => toast.error(errorMessage(error)),
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
          {trackFacts(track, { drawn: origin?.drawn }).map((fact) => (
            <Fact key={fact.label} label={fact.label}>
              {fact.value}
            </Fact>
          ))}
          <Fact label={track.sourceFilename || origin?.drawn === false ? "Imported" : "Drawn"}>
            {formatDate(track.createdAt)}
            {track.sourceFilename ? (
              <span className="block font-mono text-[0.8125rem] break-all text-ink-muted">{track.sourceFilename}</span>
            ) : null}
            {track.sourceFilename && origin?.drawn ? <span className="block text-ink-muted">Shape redrawn by hand since</span> : null}
          </Fact>
        </dl>

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
          <KeepTrackButton track={track} />
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
          track.sourceFilename
            ? `This route is a recording imported from ${track.sourceFilename}. Saving a new shape replaces what was recorded.`
            : "This route is an imported recording. Saving a new shape replaces what was recorded."
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
  canDraw,
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
  /** False when the map could not be drawn, so there is nothing to draw on. */
  canDraw: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const all = tracks.data ?? [];

  const chooser = (
    <input
      ref={input}
      type="file"
      accept=".gpx,application/gpx+xml"
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
          Draw a route on the map point by point, or import a GPX file from a GPS, a phone app or a route-planning site. Either way it is
          shown on the map with its distance, and can be exported as GPX. You can also drop a file onto the map.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="primary" onClick={onDraw} disabled={!canDraw}>
            <PenLine /> Draw a route
          </Button>
          <Button onClick={() => input.current?.click()}>
            <FileUp /> Import GPX
          </Button>
          {markerCount > 0 ? (
            <Button asChild>
              <a href="/api/maps/export.gpx?markers=1" download>
                <Download /> Export places as GPX
              </a>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {chooser}
      <div className="flex items-center gap-2 px-4 pt-3">
        <Button onClick={onDraw} disabled={!canDraw}>
          <PenLine /> Draw a route
        </Button>
        <Button onClick={() => input.current?.click()}>
          <FileUp /> Import GPX
        </Button>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="More actions for routes" className="ml-auto">
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem onSelect={() => setExporting(true)}>
              <Download /> Export everything as GPX
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <p className="tabular px-4 pt-2 pb-2 text-micro text-ink-muted">
        {plural(all.length, "route")}
        {hidden.length > 0 ? `, ${all.filter((track) => hidden.includes(track.id)).length} hidden` : ""}
      </p>
      <ul className="scroll-quiet min-h-0 flex-1 divide-y divide-border overflow-y-auto border-t border-border">
        {all.map((track) => {
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
                className="flex min-w-0 flex-1 items-start gap-3 py-2.5 pr-4 text-left hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3"
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
      </ul>
      <ExportDialog open={exporting} onOpenChange={setExporting} tracks={all} markerCount={markerCount} />
    </div>
  );
}

/** The server reads the chosen tracks from the address, which has a length limit. */
const MAX_EXPORT_QUERY = 3900;

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
  const [excluded, setExcluded] = useState<string[]>([]);
  const chosen = tracks.filter((track) => !excluded.includes(track.id));
  const includePlaces = withPlaces && markerCount > 0;
  const ids = chosen.map((track) => track.id).join(",");
  const tooMany = ids.length > MAX_EXPORT_QUERY;
  const nothing = chosen.length === 0 && !includePlaces;
  const href = `/api/maps/export.gpx?${new URLSearchParams({ ...(includePlaces ? { markers: "1" } : {}), ...(ids ? { tracks: ids } : {}) }).toString()}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Export as GPX"
        description="One file with the routes you choose and, if you like, your saved places as waypoints. Any GPS or mapping app can read it."
        size="sm"
      >
        <DialogBody>
          <div className="flex items-start gap-3 border-b border-border pb-3">
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
              <Download /> Export
            </Button>
          ) : (
            <Button asChild variant="primary">
              <a href={href} download onClick={() => onOpenChange(false)}>
                <Download /> Export
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ImportOutcome =
  | { file: File; state: "waiting" | "working" }
  | { file: File; state: "done"; result: TrackImportResponse }
  | { file: File; state: "failed"; message: string };

/**
 * Importing GPX files, whether chosen with the file picker or dropped on the map. The
 * one question is asked before anything is sent; afterwards the dialog says exactly
 * what came out of each file.
 */
export function ImportGpxDialog({
  files,
  onClose,
  onShow,
}: {
  files: File[] | null;
  onClose: () => void;
  onShow: (track: TrackDto | null, markers: MarkerDto[]) => void;
}) {
  const waypointsId = useId();
  const [waypoints, setWaypoints] = useState(false);
  const [outcomes, setOutcomes] = useState<ImportOutcome[] | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: a new set of files starts a new import
  useEffect(() => {
    setOutcomes(null);
    setWaypoints(false);
  }, [files]);

  const run = async () => {
    if (!files) return;
    let current: ImportOutcome[] = files.map((file) => ({ file, state: "waiting" }));
    const set = (index: number, outcome: ImportOutcome) => {
      current = current.map((item, position) => (position === index ? outcome : item));
      setOutcomes(current);
    };
    setOutcomes(current);
    for (const [index, file] of files.entries()) {
      set(index, { file, state: "working" });
      try {
        set(index, { file, state: "done", result: await importGpx(file, waypoints) });
      } catch (error) {
        set(index, { file, state: "failed", message: errorMessage(error) });
      }
    }
  };

  const working = outcomes?.some((outcome) => outcome.state === "waiting" || outcome.state === "working") ?? false;
  const finished = outcomes !== null && !working;
  const firstDone = outcomes?.find((outcome): outcome is Extract<ImportOutcome, { state: "done" }> => outcome.state === "done");

  return (
    <Dialog open={files !== null} onOpenChange={(open) => !open && !working && onClose()}>
      <DialogContent title={files && files.length > 1 ? `Import ${files.length} GPX files` : "Import a GPX file"} size="md">
        <DialogBody className="grid gap-4">
          {outcomes === null ? (
            <>
              <ul className="divide-y divide-border border-y border-border">
                {files?.map((file) => (
                  <li key={`${file.name}-${file.size}`} className="flex items-baseline justify-between gap-4 py-2 text-small">
                    <span className="min-w-0 font-mono text-[0.8125rem] break-all text-ink">{file.name}</span>
                    <span className="tabular shrink-0 text-ink-muted">{formatBytes(file.size)}</span>
                  </li>
                ))}
              </ul>
              <div className="flex items-start gap-3">
                <Checkbox
                  id={waypointsId}
                  checked={waypoints}
                  onCheckedChange={(checked) => setWaypoints(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor={waypointsId} className="text-small text-ink">
                  Also save its waypoints as places
                  <span className="block text-ink-muted">
                    Named points in the file (a summit, a car park) become saved places you can search for and edit.
                  </span>
                </label>
              </div>
            </>
          ) : (
            <ul className="grid gap-3">
              {outcomes.map((outcome) => (
                <li key={`${outcome.file.name}-${outcome.file.size}`}>
                  {outcome.state === "done" ? (
                    <Notice
                      tone="success"
                      icon={<CircleCheck />}
                      title={outcome.result.track ? outcome.result.track.name : outcome.file.name}
                    >
                      {outcome.result.track ? (
                        <dl className="mt-1">
                          {trackFacts(outcome.result.track).map((fact) => (
                            <Fact key={fact.label} label={fact.label}>
                              {fact.value}
                            </Fact>
                          ))}
                          {outcome.result.markers.length > 0 ? (
                            <Fact label="Places saved">{plural(outcome.result.markers.length, "place")}</Fact>
                          ) : null}
                        </dl>
                      ) : (
                        <p>
                          This file holds no track or route. {plural(outcome.result.markers.length, "waypoint")} from it{" "}
                          {outcome.result.markers.length === 1 ? "was" : "were"} saved as places.
                        </p>
                      )}
                    </Notice>
                  ) : outcome.state === "failed" ? (
                    <Notice tone="danger" icon={<CircleAlert />} title={`${outcome.file.name} was not imported`}>
                      {outcome.message}
                    </Notice>
                  ) : (
                    <p className="flex items-center gap-2.5 text-small text-ink-muted">
                      {outcome.state === "working" ? <Spinner label="Importing" /> : <span className="size-4" />}
                      <span className="font-mono text-[0.8125rem] break-all">{outcome.file.name}</span>
                      {outcome.state === "working" ? "Reading the file" : "Waiting"}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
        <DialogFooter>
          {outcomes === null ? (
            <>
              <Button onClick={onClose}>Cancel</Button>
              <Button variant="primary" onClick={run}>
                Import
              </Button>
            </>
          ) : (
            <>
              <Button onClick={onClose} disabled={working}>
                {finished && firstDone ? "Close" : "Done"}
              </Button>
              {finished && firstDone ? (
                <Button variant="primary" onClick={() => onShow(firstDone.result.track, firstDone.result.markers)}>
                  Show on the map
                </Button>
              ) : null}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
