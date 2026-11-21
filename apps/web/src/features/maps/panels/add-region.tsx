/**
 * Adding a map region: choose an area (a ready-made one or a box drawn on the map),
 * choose how much detail and which storage location it goes to, ask the source exactly
 * how large that is, then download it. Terrain, when asked for, goes to the same place.
 */
import { type Bbox, formatBytes, type MapRegionPresetStatus } from "@outpost/shared";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, Check, CircleAlert, Search, SquareDashedMousePointer } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Badge, Checkbox, Progress, Segmented, Skeleton } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { errorMessage } from "@/lib/api";
import { cn, formatNumber } from "@/lib/utils";
import { estimateRegion, useMapRegions, useStartRegion } from "../data";
import { countTiles, formatBbox, formatBboxSize, isValidBbox } from "../lib/geo";
import { fold } from "../lib/search";
import { formatBuild } from "../lib/tracks";
import type { MapEngine } from "../map/engine";
import { Fact } from "../ui";
import { DestinationLine, DestinationPicker, useDestination } from "./destination";

/** The server refuses anything over this many tiles; saying so before asking saves a round trip. */
const MAX_TILES = 20_000_000;
/** Terrain stops at this zoom at the source. */
const TERRAIN_MAX_ZOOM = 12;

const DETAIL_LABELS: Array<[maxZoom: number, label: string]> = [
  [5, "Continents and countries"],
  [7, "Countries and cities"],
  [9, "Main roads and large towns"],
  [11, "Roads and towns"],
  [13, "Villages and tracks"],
  [14, "Footpaths and buildings"],
  [15, "Everything"],
];

/** What a map downloaded to this zoom shows, in plain words. */
export function detailLabel(maxZoom: number): string {
  return DETAIL_LABELS.find(([limit]) => maxZoom <= limit)?.[1] ?? "Everything";
}

/** The detail levels offered: the standard four, plus the area's recommended one when it is not among them. */
export function detailChoices(recommended: number | undefined): number[] {
  const zooms = new Set([10, 12, 14, 15]);
  if (recommended !== undefined) zooms.add(recommended);
  return [...zooms].sort((a, b) => a - b);
}

type Area = { kind: "preset"; preset: MapRegionPresetStatus } | { kind: "custom"; bbox: Bbox | null };

function PresetList({ chosen, onChoose }: { chosen: string | undefined; onChoose: (preset: MapRegionPresetStatus) => void }) {
  const regions = useMapRegions(true);
  const [filter, setFilter] = useState("");
  const groups = useMemo(() => {
    const needle = fold(filter);
    return (regions.data?.groups ?? [])
      .map((group) => ({
        ...group,
        regions: needle ? group.regions.filter((region) => fold(region.name).includes(needle)) : group.regions,
      }))
      .filter((group) => group.regions.length > 0);
  }, [regions.data, filter]);

  if (regions.isPending) {
    return (
      <div className="grid gap-2" aria-busy>
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
        <Skeleton className="h-9" />
      </div>
    );
  }
  if (regions.isError) return <ErrorState error={regions.error} onRetry={() => regions.refetch()} />;

  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-ink-muted" />
        <Input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Find a country or region"
          aria-label="Find a country or region"
          className="pl-8 text-small"
        />
      </div>
      {groups.length === 0 ? (
        <p className="text-small text-ink-muted">
          No region has “{filter}” in its name. Draw a box on the map instead to download any area.
        </p>
      ) : (
        groups.map((group) => (
          <section key={group.name} aria-label={group.name}>
            <h4 className="pb-1 text-micro font-medium text-ink-muted">{group.name}</h4>
            <ul className="divide-y divide-border border-y border-border">
              {group.regions.map((region) => (
                <li key={region.id}>
                  <button
                    type="button"
                    aria-pressed={chosen === region.id}
                    onClick={() => onChoose(region)}
                    className={cn(
                      "flex w-full items-center gap-3 px-2 py-2 text-left text-small hover:bg-surface focus-visible:-outline-offset-2 max-md:py-3",
                      chosen === region.id && "bg-primary-soft hover:bg-primary-soft",
                    )}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-ink">{region.name}</span>
                      <span className="tabular block truncate text-micro text-ink-muted">{formatBboxSize(region.bbox)}</span>
                    </span>
                    {region.downloadId ? (
                      <Badge tone="lamp">Downloading</Badge>
                    ) : region.installed ? (
                      <Badge tone="success">Installed</Badge>
                    ) : null}
                    {chosen === region.id ? <Check aria-hidden className="size-4 shrink-0 text-primary" /> : null}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}

export function AddRegion({
  engine,
  initialPresetId,
  onClose,
  onNeedMap,
  onNeedRoom,
}: {
  engine: MapEngine | null;
  /** A preset to start from, when the person arrived by a "World overview" shortcut. */
  initialPresetId?: string;
  onClose: () => void;
  /** Asks the screen to get out of the map's way (on a phone, lowers the sheet) while a box is drawn. */
  onNeedMap: () => void;
  /** Asks for as much room as the screen can give (on a phone, raises the sheet): the choices before a download are many. */
  onNeedRoom: () => void;
}) {
  const regions = useMapRegions(true);
  const terrainId = useId();
  const whereRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"list" | "draw">("list");
  const [area, setArea] = useState<Area | null>(null);
  const [step, setStep] = useState<"area" | "options">("area");
  const [drawing, setDrawing] = useState(false);
  const [boxError, setBoxError] = useState<string>();
  const [name, setName] = useState("");
  const [maxZoom, setMaxZoom] = useState(14);
  const [includeTerrain, setIncludeTerrain] = useState(false);

  const estimate = useMutation({ mutationFn: estimateRegion });
  const start = useStartRegion();
  const resetEstimate = estimate.reset;

  const bbox = area?.kind === "preset" ? area.preset.bbox : (area?.bbox ?? null);
  const recommended = area?.kind === "preset" ? area.preset.recommendedMaxZoom : undefined;

  const chooseArea = useCallback(
    (next: Area) => {
      setArea(next);
      setBoxError(undefined);
      resetEstimate();
      const box = next.kind === "preset" ? next.preset.bbox : next.bbox;
      if (next.kind === "preset") {
        setMaxZoom(next.preset.recommendedMaxZoom);
      } else if (box) {
        // The deepest standard level that stays a sensible size for the box drawn.
        setMaxZoom([14, 12, 10].find((zoom) => countTiles(box, 0, zoom) <= 1_000_000) ?? 10);
      }
    },
    [resetEstimate],
  );

  // Arriving from a shortcut: start with that preset chosen and go straight to its options.
  const [appliedInitial, setAppliedInitial] = useState(false);
  useEffect(() => {
    if (appliedInitial || !initialPresetId || !regions.data) return;
    setAppliedInitial(true);
    const preset = regions.data.groups.flatMap((group) => group.regions).find((region) => region.id === initialPresetId);
    if (preset) {
      chooseArea({ kind: "preset", preset });
      setStep("options");
    }
  }, [appliedInitial, initialPresetId, regions.data, chooseArea]);

  // The map shows the chosen area; a drawn box keeps handles so it can be adjusted.
  useEffect(() => {
    if (!engine) return;
    engine.setBox(bbox, area?.kind === "custom" && !drawing);
  }, [engine, bbox, area?.kind, drawing]);
  useEffect(() => {
    if (!engine || !bbox || area?.kind !== "preset") return;
    engine.fitBounds(bbox, { maxZoom: 11 });
  }, [engine, bbox, area?.kind]);
  useEffect(() => {
    if (!engine) return;
    engine.setDrawing(drawing);
    return () => engine.setDrawing(false);
  }, [engine, drawing]);
  useEffect(() => () => engine?.setBox(null, false), [engine]);

  useEffect(() => {
    if (!engine) return;
    return engine.on("box", (result) => {
      setDrawing(false);
      if (result.ok) {
        chooseArea({ kind: "custom", bbox: result.bbox });
      } else {
        setBoxError(
          result.reason === "antimeridian"
            ? "That box crosses the 180° meridian. Download the area as two regions, one on each side of it."
            : "That box is too small to be a region. Drag a larger one.",
        );
      }
    });
  }, [engine, chooseArea]);

  // Escape puts the drawing tool down without leaving the panel.
  useEffect(() => {
    if (!drawing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        setDrawing(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [drawing]);

  // The map and its terrain go to the same place unless new terrain is set to go somewhere
  // of its own (Storage); the room needed is for both together either way, which is the safe side.
  const requiredBytes = estimate.data?.totalBytes ?? null;
  const destination = useDestination(requiredBytes, "maps");
  const terrainOwn = destination.locations.find(
    (location) => location.defaultFor.includes("terrain") && location.status === "available" && location.id !== destination.locationId,
  );
  const terrainElsewhere = includeTerrain && !destination.picked ? terrainOwn : undefined;

  // The choices before a download fill more than half a phone's screen.
  useEffect(() => {
    if (step === "options") onNeedRoom();
  }, [step, onNeedRoom]);

  const regionName = area?.kind === "preset" ? area.preset.name : name.trim();
  const zooms = detailChoices(recommended);
  const tooLarge = (zoom: number) => (bbox ? countTiles(bbox, 0, zoom) > MAX_TILES : false);
  const canDownload = Boolean(estimate.data && bbox && regionName && destination.locationId);

  const download = () => {
    if (!bbox || !estimate.data || !destination.location) return;
    const kept = destination.location.name;
    start.mutate(
      {
        name: regionName,
        regionId: area?.kind === "preset" ? area.preset.id : undefined,
        bbox,
        maxZoom,
        includeTerrain,
        locationId: destination.locationId,
        ...(terrainElsewhere ? { terrainLocationId: terrainElsewhere.id } : {}),
      },
      {
        onSuccess: () => {
          destination.remember();
          toast.success(`Downloading “${regionName}” to ${kept}. Progress is shown here and under Downloads.`);
          onClose();
        },
      },
    );
  };

  const header = (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <Button variant="ghost" size="sm" onClick={step === "options" ? () => setStep("area") : onClose}>
        <ArrowLeft /> {step === "options" ? "Choose another area" : "Maps on this device"}
      </Button>
    </div>
  );

  if (step === "area") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
          <div>
            <h3 className="font-title text-lead text-ink">Add a region</h3>
            <p className="mt-1 text-small text-ink-muted">
              Pick a ready-made area, or draw your own box around the hills you are heading for.
            </p>
          </div>
          <Segmented
            label="How to choose the area"
            value={mode}
            onChange={(next) => {
              setMode(next);
              setDrawing(false);
            }}
            options={[
              { value: "list", label: "From the list" },
              { value: "draw", label: "Draw a box" },
            ]}
            className="justify-self-start"
          />
          {mode === "list" ? (
            <PresetList
              chosen={area?.kind === "preset" ? area.preset.id : undefined}
              onChoose={(preset) => {
                chooseArea({ kind: "preset", preset });
                setStep("options");
              }}
            />
          ) : (
            <div className="grid gap-3">
              {!engine ? (
                <Notice tone="warning" icon={<CircleAlert />}>
                  The map cannot be drawn in this browser, so a box cannot be drawn on it. Choose an area from the list instead.
                </Notice>
              ) : (
                <>
                  <p className="text-small text-ink-muted">
                    {drawing ? (
                      "Drag on the map from one corner of the area to the opposite one. Press Escape to stop."
                    ) : (
                      <>
                        Draw a box on the map, then adjust it by dragging its corners and edges.
                        {/* Phones have no Tab key to reach a handle with. */}
                        <span className="max-md:hidden">
                          {" "}
                          From the keyboard, Tab to a handle and use the arrow keys; Shift moves it further.
                        </span>
                      </>
                    )}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant={drawing ? "soft" : "secondary"}
                      aria-pressed={drawing}
                      onClick={() => {
                        setBoxError(undefined);
                        setDrawing((current) => !current);
                        if (!drawing) onNeedMap();
                      }}
                    >
                      <SquareDashedMousePointer />{" "}
                      {drawing ? "Drawing: drag on the map" : area?.kind === "custom" && area.bbox ? "Draw again" : "Draw a box"}
                    </Button>
                    <Button
                      onClick={() => {
                        const view = engine.getBounds();
                        const inset = (low: number, high: number) => (high - low) * 0.12;
                        const box: Bbox = [
                          Number((view[0] + inset(view[0], view[2])).toFixed(5)),
                          Number((view[1] + inset(view[1], view[3])).toFixed(5)),
                          Number((view[2] - inset(view[0], view[2])).toFixed(5)),
                          Number((view[3] - inset(view[1], view[3])).toFixed(5)),
                        ];
                        setDrawing(false);
                        if (isValidBbox(box)) chooseArea({ kind: "custom", bbox: box });
                        else setBoxError("The view spans more than the whole world. Zoom in, then try again.");
                      }}
                    >
                      Use the current view
                    </Button>
                  </div>
                </>
              )}
              {boxError ? (
                <Notice tone="danger" icon={<CircleAlert />}>
                  {boxError}
                </Notice>
              ) : null}
              {area?.kind === "custom" && area.bbox ? (
                <>
                  {/* Read out as the box is adjusted from the keyboard, where there is no handle to watch. */}
                  <dl aria-label="Bounds of the box" aria-live="polite">
                    <Fact label="Size">{formatBboxSize(area.bbox)}</Fact>
                    <Fact label="North" mono>
                      {area.bbox[3].toFixed(4)}°
                    </Fact>
                    <Fact label="South" mono>
                      {area.bbox[1].toFixed(4)}°
                    </Fact>
                    <Fact label="West" mono>
                      {area.bbox[0].toFixed(4)}°
                    </Fact>
                    <Fact label="East" mono>
                      {area.bbox[2].toFixed(4)}°
                    </Fact>
                  </dl>
                  <Field label="Name for this region" hint="How it will be listed, for example “Cairngorms north”.">
                    {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />}
                  </Field>
                </>
              ) : null}
            </div>
          )}
        </div>
        {mode === "draw" ? (
          <footer className="flex justify-end border-t border-border px-4 py-3">
            <Button variant="primary" disabled={!(area?.kind === "custom" && area.bbox && name.trim())} onClick={() => setStep("options")}>
              Continue
            </Button>
          </footer>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-4">
        <div>
          <h3 className="font-title text-lead text-ink">{regionName}</h3>
          {bbox ? (
            <p className="tabular mt-1 text-small text-ink-muted">
              {formatBboxSize(bbox)}
              <span className="block">{formatBbox(bbox)}</span>
            </p>
          ) : null}
          {area?.kind === "preset" && area.preset.note ? <p className="mt-2 text-small text-ink-muted">{area.preset.note}</p> : null}
          {area?.kind === "preset" && area.preset.installed ? (
            <Notice tone="info" className="mt-3">
              This region is already installed. Downloading it again fetches the newest map data, or more detail if you choose a deeper
              level.
            </Notice>
          ) : null}
        </div>

        <div className="grid gap-2">
          <h4 className="text-small font-semibold text-ink">Detail</h4>
          <ChoiceList
            label="Detail"
            value={String(maxZoom)}
            onChange={(value) => {
              setMaxZoom(Number(value));
              resetEstimate();
            }}
            choices={zooms.map((zoom) => {
              const refused = tooLarge(zoom);
              const note = refused
                ? `Too large for one download: about ${formatNumber(Math.round(countTiles(bbox!, 0, zoom) / 1e6))} million map tiles`
                : zoom === recommended
                  ? zoom === 14
                    ? "Recommended for walking"
                    : "Recommended for this area"
                  : zoom === 14 && recommended === undefined
                    ? "Recommended for walking"
                    : undefined;
              return { value: String(zoom), title: detailLabel(zoom), detail: note, trailing: `zoom ${zoom}`, disabled: refused };
            })}
          />
          <div className="mt-1 flex items-start gap-3">
            <Checkbox
              id={terrainId}
              checked={includeTerrain}
              onCheckedChange={(checked) => {
                setIncludeTerrain(checked === true);
                resetEstimate();
              }}
              className="mt-0.5"
            />
            <label htmlFor={terrainId} className="text-small text-ink">
              Include terrain for hill shading and contour lines
              <span className="block text-ink-muted">
                Elevation data for the same area
                {maxZoom > TERRAIN_MAX_ZOOM ? `, to zoom ${TERRAIN_MAX_ZOOM}, the most the terrain source has` : ""}. Shades the hills and
                draws lines of equal height, so their shape can be read.
              </span>
            </label>
          </div>
        </div>

        <div className="grid gap-3">
          <h4 className="text-small font-semibold text-ink">Size</h4>
          {estimate.isPending ? (
            <div role="status">
              <Progress label="Checking the size" tone="lamp" />
              <p className="mt-2 text-small text-ink-muted">
                Asking the map source exactly how large this is. It needs a connection and takes a few seconds.
              </p>
            </div>
          ) : estimate.isError ? (
            <Notice tone="danger" icon={<CircleAlert />} title="The size could not be checked">
              {errorMessage(estimate.error)}
            </Notice>
          ) : estimate.data ? (
            <dl>
              <Fact label={estimate.data.terrain ? "Map" : "Download"}>
                {formatBytes(estimate.data.map.sizeBytes)}
                <span className="block text-ink-muted">{formatNumber(estimate.data.map.tileCount)} map tiles</span>
              </Fact>
              {estimate.data.terrain ? (
                <>
                  <Fact label="Terrain">
                    {formatBytes(estimate.data.terrain.sizeBytes)}
                    <span className="block text-ink-muted">to zoom {estimate.data.terrain.maxZoom}</span>
                  </Fact>
                  <Fact label="Total">
                    <span className="font-semibold">{formatBytes(estimate.data.totalBytes)}</span>
                  </Fact>
                </>
              ) : null}
              {formatBuild(estimate.data.map.sourceBuild) ? (
                <Fact label="Map data from">{formatBuild(estimate.data.map.sourceBuild)}</Fact>
              ) : null}
            </dl>
          ) : (
            <p className="text-small text-ink-muted">
              {bbox ? <>{formatNumber(countTiles(bbox, 0, maxZoom))} map tiles. </> : null}
              How many megabytes that is depends on what is in the area, so Outpost asks the map server. That needs an internet connection;
              nothing is downloaded until you press Download.
            </p>
          )}
          {!estimate.data ? (
            <Button
              className="justify-self-start"
              onClick={() => bbox && estimate.mutate({ bbox, maxZoom, includeTerrain })}
              loading={estimate.isPending}
              disabled={!bbox || tooLarge(maxZoom)}
            >
              {estimate.isError ? "Check the size again" : "Check the size"}
            </Button>
          ) : null}
        </div>

        <div ref={whereRef} className="grid scroll-mt-4 gap-2">
          <h4 className="text-small font-semibold text-ink">Where to keep it</h4>
          <DestinationPicker destination={destination} />
          {includeTerrain ? (
            <p className="text-small text-ink-muted">
              {terrainElsewhere
                ? `The terrain goes to ${terrainElsewhere.name}, where new terrain is set to go.`
                : "The terrain is kept in the same place as the map."}
            </p>
          ) : null}
        </div>

        {start.isError ? (
          <Notice tone="danger" icon={<CircleAlert />} title="The download did not start">
            {errorMessage(start.error)}
          </Notice>
        ) : null}
      </div>
      <footer className="grid gap-2.5 border-t border-border px-4 py-3">
        {/* Beside the button, so where it goes is in view when deciding, however far the list above is scrolled. */}
        <DestinationLine
          destination={destination}
          onChange={() => {
            whereRef.current?.scrollIntoView({ block: "nearest" });
            whereRef.current?.querySelector<HTMLElement>('[role="radio"]:not([disabled])')?.focus({ preventScroll: true });
          }}
        />
        {/* In a row, the main button on the right, as in every other form. */}
        <div className="flex flex-wrap items-center justify-end gap-2">
          {!estimate.data && !estimate.isPending ? <span className="mr-auto text-small text-ink-muted">Check the size first.</span> : null}
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={download} disabled={!canDownload} loading={start.isPending}>
            Download
          </Button>
        </div>
      </footer>
    </div>
  );
}
