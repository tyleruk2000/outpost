/**
 * The second step of "Print or save as PDF": the page itself. A preview of the sheet as
 * it will be made, what to put on it, and the making.
 *
 * The preview is the real thing at low resolution: the same off-screen map, the same
 * layout, one device pixel to each of the map's instead of two and a half. Nothing is
 * made until "Make the PDF" is pressed, and the file is then offered to save or share;
 * a browser will not let a page start a download by itself long after the press that
 * asked for it, so saving is a second, deliberate press.
 */
import { type Bbox, formatBytes, type TrackWithGeometryDto } from "@outpost/shared";
import { type UseQueryResult, useQueries } from "@tanstack/react-query";
import { CircleAlert, Download, Printer, Share2 } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Checkbox, Progress, Segmented, Skeleton } from "@/components/ui/misc";
import { api, errorMessage } from "@/lib/api";
import { mapsKeys, useMapOverview, useMarkers, useTracks } from "../data";
import type { ReadoutFormat } from "../lib/coords";
import { formatBboxSize } from "../lib/geo";
import { FALLBACK_THEME } from "../lib/palette";
import type { StyleInput } from "../lib/style";
import { readStored, STORAGE_KEYS } from "../lib/view";
import { creditsFor } from "../map-footer";
import { coverageWarning, mapCoverage } from "./coverage";
import { printedCredits } from "./credits";
import {
  assemblePdf,
  deviceLimits,
  drawPage,
  drawPieces,
  type MapPicture,
  PREVIEW_PLAN,
  PrintMap,
  PrintMapError,
  pieceView,
} from "./export";
import { graticule } from "./graticule";
import { overlayOn, PRINT_OVERLAYS, type PrintContext, type PrintSelection, partsOn, printStyle } from "./overlays";
import { type PageGeometry, paperName } from "./paper";
import { pdfFileName } from "./pdf";
import { planNote, type RasterPlan, type Resolution } from "./pieces";
import { formatScale, frameOfBox } from "./scale";
import { layoutSheet } from "./sheet";
import { SheetView } from "./sheet-view";

const isStringArray = (value: unknown): value is string[] => Array.isArray(value) && value.every((item) => typeof item === "string");
const overlaps = (a: Bbox, b: Bbox) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });

interface Lines {
  geometries: TrackWithGeometryDto[];
  pending: boolean;
  error: unknown;
}
// Kept outside the component so that its result keeps its identity until a route's data changes.
const combineLines = (results: Array<UseQueryResult<TrackWithGeometryDto>>): Lines => ({
  geometries: results.flatMap((result) => (result.data ? [result.data] : [])),
  pending: results.some((result) => result.isPending),
  error: results.find((result) => result.isError)?.error,
});

/**
 * What the dialog holds outside React's state: the off-screen map of the preview, a
 * making in progress, and the addresses of pictures and files, which a browser keeps
 * in memory until they are given back.
 */
class Holdings {
  previewMap: Promise<PrintMap> | null = null;
  making: AbortController | null = null;
  private readonly urls = new Set<string>();

  hold(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.add(url);
    return url;
  }

  release(url: string | undefined): void {
    if (!url) return;
    URL.revokeObjectURL(url);
    this.urls.delete(url);
  }

  closePreviewMap(): void {
    const open = this.previewMap;
    this.previewMap = null;
    void open?.then((map) => map.destroy()).catch(() => undefined);
  }

  /** Everything, on leaving. */
  dispose(): void {
    this.making?.abort();
    this.closePreviewMap();
    for (const url of this.urls) URL.revokeObjectURL(url);
    this.urls.clear();
  }
}

type Preview = { status: "drawing"; url?: string } | { status: "ready"; url: string } | { status: "error"; message: string };

type Made =
  | { status: "idle" }
  | { status: "making"; done: number; of: number }
  | { status: "error"; message: string }
  | {
      status: "ready";
      url: string;
      file: File;
      plan: RasterPlan;
      pictures: Array<MapPicture & { url: string }>;
      /** Lines of lettering drawn as pictures because the PDF's typeface lacks their characters. */
      drawnAsPictures: number;
    };

export function PrintDialog({
  geometry,
  bbox,
  scale,
  style,
  format,
  resolution,
  onResolutionChange,
  onBack,
}: {
  geometry: PageGeometry;
  /** The ground on the page. */
  bbox: Bbox;
  /** The 1:n along the middle of the sheet. */
  scale: number;
  /** The style of the map on screen: what is installed, and how the map is set. */
  style: Omit<StyleInput, "overlays">;
  format: ReadoutFormat;
  resolution: Resolution;
  onResolutionChange: (resolution: Resolution) => void;
  /** Back to the map, to change the area or the paper. */
  onBack: () => void;
}) {
  const overview = useMapOverview();
  const markers = useMarkers();
  const tracks = useTracks();
  const here = useMemo(() => (tracks.data ?? []).filter((track) => track.bounds && overlaps(track.bounds, bbox)), [tracks.data, bbox]);
  const lines = useQueries({
    queries: here.map((track) => ({
      queryKey: mapsKeys.track(track.id),
      queryFn: () => api.get<{ track: TrackWithGeometryDto }>(`/api/maps/tracks/${track.id}`).then((data) => data.track),
      staleTime: 5 * 60_000,
    })),
    combine: combineLines,
  });

  const pixels = geometry.mapPixels;
  const frame = useMemo(() => frameOfBox(bbox, pixels), [bbox, pixels]);
  const ticks = useMemo(() => graticule(bbox, geometry.map, format === "dms" ? "dms" : "decimal"), [bbox, geometry, format]);
  const [limits] = useState(deviceLimits);
  // Which routes are hidden on the map on screen, read once: the page starts from what is showing.
  const [hiddenTracks] = useState(() => readStored(STORAGE_KEYS.hiddenTracks, isStringArray, []));

  const loading = overview.isPending || markers.isPending || tracks.isPending || lines.pending;
  const failed = overview.error ?? markers.error ?? tracks.error ?? lines.error;
  const context = useMemo<PrintContext | null>(() => {
    if (!overview.data || !markers.data || !tracks.data || lines.pending) return null;
    return {
      bbox,
      zoom: frame.zoom,
      // Paper is light whatever the screen is set to.
      theme: style.flavour === "light" ? style.theme : FALLBACK_THEME.light,
      sources: style.sources,
      regions: overview.data.regions,
      markers: markers.data,
      tracks: tracks.data,
      geometries: lines.geometries,
      graticule: ticks,
      live: { hillshade: style.hillshade, contours: style.contours ?? false, hiddenTracks },
    };
  }, [overview.data, markers.data, tracks.data, lines, bbox, frame.zoom, style, ticks, hiddenTracks]);

  const [selection, setSelection] = useState<PrintSelection>({ overlays: {}, parts: {} });
  // A page that shows one route is most likely a page about that route.
  const [title, setTitle] = useState<string | null>(null);
  const suggested = here.length === 1 ? here[0]!.name : "";
  const shownTitle = title ?? suggested;

  const printed = useMemo(
    () => (context ? printStyle(context, selection, PRINT_OVERLAYS, { origin: style.origin, cacheKey: style.cacheKey }) : null),
    [context, selection, style.origin, style.cacheKey],
  );
  const hasTiles = style.sources?.hasTiles ?? false;
  const credits = useMemo(() => {
    const attributions = style.sources?.attributions ?? [];
    return printedCredits(creditsFor(attributions, { hasTiles, terrain: printed?.usesTerrain ?? false }), attributions);
  }, [style.sources, hasTiles, printed?.usesTerrain]);

  // ── The preview ──

  const [preview, setPreview] = useState<Preview>({ status: "drawing" });
  const [held] = useState(() => new Holdings());
  useEffect(() => () => held.dispose(), [held]);
  const [attempt, setAttempt] = useState(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` is there to draw again after a failure
  useEffect(() => {
    if (!printed) return;
    const stop = new AbortController();
    setPreview((current) => ({ status: "drawing", url: current.status === "error" ? undefined : current.url }));
    // A moment's pause, so that ticking three boxes draws once.
    const timer = window.setTimeout(async () => {
      try {
        const plan = PREVIEW_PLAN(pixels);
        if (held.previewMap) (await held.previewMap).setStyle(printed.style);
        else held.previewMap = PrintMap.create(printed.style, pieceView(frame, pixels, plan.pieces[0]!, plan.pixelRatio), limits.maxSide);
        const map = await held.previewMap;
        if (stop.signal.aborted) return;
        const [picture] = await drawPieces(map, frame, pixels, plan, undefined, stop.signal);
        if (stop.signal.aborted || !picture) return;
        const url = held.hold(picture.blob);
        setPreview((current) => {
          if (current.status !== "error") held.release(current.url);
          return { status: "ready", url };
        });
      } catch (error) {
        if (stop.signal.aborted || (error instanceof PrintMapError && error.failure === "stopped")) return;
        // A map that has failed is not used again.
        held.closePreviewMap();
        setPreview({ status: "error", message: errorMessage(error) });
      }
    }, 150);
    return () => {
      window.clearTimeout(timer);
      stop.abort();
    };
  }, [held, printed, frame, pixels, limits.maxSide, attempt]);

  // ── The file ──

  const [made, setMade] = useState<Made>({ status: "idle" });
  // Anything that changes the page makes a file already made out of date.
  // biome-ignore lint/correctness/useExhaustiveDependencies: listed because the page is made from them, not because they are read here
  useEffect(() => {
    held.making?.abort();
    setMade((current) => {
      if (current.status === "ready") {
        held.release(current.url);
        for (const picture of current.pictures) held.release(picture.url);
      }
      return { status: "idle" };
    });
  }, [held, printed, frame, pixels, shownTitle, resolution, credits]);

  const date = DATE.format(new Date());
  const sheetOf = (pictures: Array<{ id: string; x: number; y: number; width: number; height: number }>) =>
    layoutSheet({ geometry, bbox, scale, title: shownTitle, date, credits, graticule: ticks, pictures });
  const sheet = sheetOf(made.status === "ready" ? made.pictures : [{ id: "preview", x: 0, y: 0, ...pixels }]);
  const pictureUrls =
    made.status === "ready"
      ? Object.fromEntries(made.pictures.map((picture) => [picture.id, picture.url]))
      : { preview: preview.status === "error" ? undefined : preview.url };

  const make = async () => {
    if (!printed) return;
    const stop = new AbortController();
    held.making = stop;
    setMade({ status: "making", done: 0, of: 0 });
    try {
      // One off-screen map at a time: the preview's is closed first, and opened again if something is changed afterwards.
      held.closePreviewMap();
      const drawn = await drawPage(
        (first, maxSide) => PrintMap.create(printed.style, first, maxSide),
        frame,
        pixels,
        resolution,
        limits,
        (done, of) => !stop.signal.aborted && setMade({ status: "making", done, of }),
        stop.signal,
      );
      const file = await assemblePdf(sheetOf(drawn.pictures), drawn.pictures, shownTitle.trim() || "Map", new Date());
      if (stop.signal.aborted) return;
      setMade({
        status: "ready",
        url: held.hold(file.blob),
        file: new File([file.blob], pdfFileName(shownTitle), { type: "application/pdf" }),
        plan: drawn.plan,
        pictures: drawn.pictures.map((picture) => ({ ...picture, url: held.hold(picture.blob) })),
        drawnAsPictures: file.drawnAsPictures,
      });
    } catch (error) {
      if (stop.signal.aborted || (error instanceof PrintMapError && error.failure === "stopped")) return;
      setMade({ status: "error", message: errorMessage(error) });
    }
  };

  const canShare = made.status === "ready" && typeof navigator.canShare === "function" && navigator.canShare({ files: [made.file] });
  const share = async () => {
    if (made.status !== "ready") return;
    try {
      await navigator.share({ files: [made.file], title: shownTitle.trim() || "Map" });
    } catch (error) {
      // Closing the share sheet without choosing is not a failure.
      if (!(error instanceof DOMException && error.name === "AbortError"))
        toast.error("This device would not share the file. Save it instead.");
    }
  };

  // ── What to say about the page before it is made ──

  const coverage = useMemo(
    () => coverageWarning(mapCoverage(bbox, overview.data?.regions ?? [], frame.zoom), hasTiles),
    [bbox, overview.data, frame.zoom, hasTiles],
  );
  const terrainShare = useMemo(() => {
    if (!printed?.usesTerrain) return 1;
    // Terrain is drawn from whatever zoom there is, so any of it counts.
    const covered = mapCoverage(bbox, overview.data?.regions ?? [], 0, "terrain");
    return covered.full + covered.coarser;
  }, [printed?.usesTerrain, bbox, overview.data]);

  const titleId = useId();
  const summary = `${paperName(geometry.paper, geometry.orientation)}, ${formatScale(scale)}, ${formatBboxSize(bbox)}`;
  const busy = made.status === "making";

  return (
    <Dialog open onOpenChange={(open) => !open && onBack()}>
      <DialogContent
        title="Print or save as PDF"
        description={`One page: ${summary}.`}
        size="xl"
        className="max-md:max-h-[94dvh]"
        // Pressing outside while a page is being drawn would throw the work away.
        onInteractOutside={(event) => busy && event.preventDefault()}
      >
        <DialogBody className="grid gap-5 md:grid-cols-[minmax(0,1fr)_19rem]">
          <div className="grid min-w-0 content-start gap-3">
            <div className="relative grid place-items-center rounded-panel bg-surface-strong p-3 md:p-5">
              {failed ? (
                <ErrorState error={failed} onRetry={() => void Promise.all([overview.refetch(), markers.refetch(), tracks.refetch()])} />
              ) : loading ? (
                <div className="grid w-full gap-2 py-10" aria-busy>
                  <Skeleton className="mx-auto aspect-[3/4] w-2/3 max-w-xs" />
                  <p className="text-center text-small text-ink-muted">Reading your places and routes</p>
                </div>
              ) : (
                <>
                  <SheetView
                    sheet={sheet}
                    pictures={pictureUrls}
                    label={`Preview of the page. ${summary}. ${shownTitle.trim()}`}
                    className="block h-auto max-h-[42dvh] w-auto max-w-full shadow-float md:max-h-[min(62dvh,34rem)]"
                  />
                  {preview.status === "drawing" ? (
                    <p
                      role="status"
                      className="absolute inset-x-0 bottom-1 mx-auto w-fit rounded-control bg-raised px-2.5 py-1 text-micro text-ink shadow-float"
                    >
                      Drawing the preview
                    </p>
                  ) : null}
                </>
              )}
            </div>
            {preview.status === "error" ? (
              <Notice
                tone="danger"
                icon={<CircleAlert />}
                title="The preview could not be drawn"
                action={
                  <Button size="sm" variant="ghost" onClick={() => setAttempt((current) => current + 1)}>
                    Try again
                  </Button>
                }
              >
                {preview.message}
              </Notice>
            ) : null}
            {coverage ? (
              <Notice tone="warning" icon={<CircleAlert />} title={coverage.title}>
                {coverage.detail}
              </Notice>
            ) : null}
            {terrainShare < 0.98 ? (
              <Notice tone="info">
                Terrain is downloaded for {terrainShare < 0.02 ? "none" : `only about ${Math.round(terrainShare * 100)}%`} of this area.
                Contour lines and hill shading stop at its edge.
              </Notice>
            ) : null}
          </div>

          <div className="grid min-w-0 content-start gap-5">
            <Field label="Title" hint="Printed under the map, and used to name the file.">
              {(ids) => (
                <Input
                  {...ids}
                  value={shownTitle}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder="Helvellyn from Glenridding"
                  disabled={busy}
                />
              )}
            </Field>

            <fieldset className="grid gap-1" disabled={busy}>
              <legend className="pb-1 text-small font-medium text-ink">On the map</legend>
              <ul className="divide-y divide-border border-y border-border">
                {PRINT_OVERLAYS.map((overlay) => {
                  const id = `${titleId}-${overlay.id}`;
                  const reason = context ? overlay.unavailable?.(context) : undefined;
                  const on = context ? overlayOn(overlay, context, selection) : false;
                  const parts = context && on ? (overlay.parts?.(context) ?? []) : [];
                  const ticked = context && on ? partsOn(overlay, context, selection) : new Set<string>();
                  const hint = reason ?? (context ? overlay.hint?.(context) : undefined);
                  return (
                    <li key={overlay.id} className="py-2.5">
                      <div className="flex items-start gap-3">
                        <Checkbox
                          id={id}
                          checked={on}
                          disabled={!context || Boolean(reason)}
                          aria-describedby={hint ? `${id}-hint` : undefined}
                          onCheckedChange={(checked) =>
                            setSelection((current) => ({ ...current, overlays: { ...current.overlays, [overlay.id]: checked === true } }))
                          }
                          className="mt-0.5"
                        />
                        <label htmlFor={id} className="min-w-0 text-small text-ink">
                          {overlay.label}
                          {hint ? (
                            <span id={`${id}-hint`} className="block text-ink-muted">
                              {hint}
                            </span>
                          ) : null}
                        </label>
                      </div>
                      {parts.length > 1 ? (
                        <ul className="mt-2 grid gap-2 pl-[30px]" aria-label={overlay.label}>
                          {parts.map((part) => (
                            <li key={part.id} className="flex items-start gap-3">
                              <Checkbox
                                id={`${id}-${part.id}`}
                                checked={ticked.has(part.id)}
                                onCheckedChange={(checked) =>
                                  setSelection((current) => ({
                                    ...current,
                                    parts: {
                                      ...current.parts,
                                      [overlay.id]: { ...current.parts[overlay.id], [part.id]: checked === true },
                                    },
                                  }))
                                }
                                className="mt-0.5"
                              />
                              <label htmlFor={`${id}-${part.id}`} className="min-w-0 truncate text-small text-ink">
                                {part.label}
                              </label>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </fieldset>

            <div className="grid gap-1.5">
              <h3 className="text-small font-medium text-ink">Print quality</h3>
              <Segmented
                label="Print quality"
                value={String(resolution) as "300" | "150"}
                onChange={(next) => !busy && onResolutionChange(Number(next) as Resolution)}
                options={[
                  { value: "300", label: "Best: 300 dpi" },
                  { value: "150", label: "Draft: 150 dpi" },
                ]}
                className="justify-self-start"
              />
              <p className="text-small text-ink-muted">
                300 dots to the inch is sharp on any printer. 150 is quicker to make, and about a quarter of the size to keep or send.
              </p>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="justify-between">
          {made.status === "making" ? (
            <div className="grid min-w-0 flex-1 gap-1.5" role="status">
              <Progress value={made.of ? made.done / made.of : null} tone="lamp" label="Drawing the page" />
              <p className="text-small text-ink-muted">
                {made.of > 1
                  ? `Drawing the map: piece ${Math.min(made.done + 1, made.of)} of ${made.of}.`
                  : "Drawing the map at print resolution."}{" "}
                Keep this tab in front.
              </p>
            </div>
          ) : made.status === "ready" ? (
            <div className="min-w-0 flex-1 text-small" role="status">
              <p className="truncate font-medium text-ink">
                {made.file.name} <span className="tabular font-normal text-ink-muted">· {formatBytes(made.file.size)}</span>
              </p>
              <p className="text-ink-muted">
                {paperName(geometry.paper, geometry.orientation)} at {made.plan.dpi} dots per inch. Print it at 100%, not “fit to page”, for
                the scale to hold.
              </p>
              {planNote(made.plan, resolution) ? <p className="text-ink-muted">{planNote(made.plan, resolution)}</p> : null}
              {made.drawnAsPictures > 0 ? (
                <p className="text-ink-muted">
                  The title has letters the PDF’s built-in typeface lacks, so it is in the file as a picture, not as text.
                </p>
              ) : null}
            </div>
          ) : made.status === "error" ? (
            <Notice tone="danger" icon={<CircleAlert />} title="The page was not made" className="min-w-0 flex-1">
              {made.message}
            </Notice>
          ) : (
            <p className="min-w-0 flex-1 text-small text-ink-muted">
              Made on this device from the maps installed here. Nothing is sent anywhere.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            {made.status === "making" ? (
              <Button
                onClick={() => {
                  held.making?.abort();
                  setMade({ status: "idle" });
                }}
              >
                Stop
              </Button>
            ) : made.status === "ready" ? (
              <>
                <Button onClick={() => window.print()}>
                  <Printer /> Print
                </Button>
                {canShare ? (
                  <Button onClick={share}>
                    <Share2 /> Share
                  </Button>
                ) : null}
                <Button asChild variant="primary">
                  <a href={made.url} download={made.file.name}>
                    <Download /> Save the PDF
                  </a>
                </Button>
              </>
            ) : (
              <>
                <Button onClick={onBack}>Change the area</Button>
                <Button variant="primary" onClick={make} disabled={!printed || preview.status === "error"}>
                  {made.status === "error" ? "Try again" : "Make the PDF"}
                </Button>
              </>
            )}
          </div>
        </DialogFooter>
      </DialogContent>

      {/* What the browser's own Print prints while this is open: the sheet alone, at the size of the paper (see maps.css). */}
      {createPortal(
        <div className="outpost-print-sheet" aria-hidden>
          <style>{`@page { size: ${geometry.width}pt ${geometry.height}pt; margin: 0; }`}</style>
          <SheetView sheet={sheet} pictures={pictureUrls} label="" actualSize />
        </div>,
        document.body,
      )}
    </Dialog>
  );
}
