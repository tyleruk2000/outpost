/**
 * Satellite imagery in the Offline maps tab: what is installed, the world from NASA, and
 * a small area of one's own from Sentinel-2, chosen on the map. Nothing is fetched until
 * the person has seen what it will be: whose picture, of what day, how fine, how large,
 * how much will be transferred, under what licence, and what it costs (nothing, and to
 * nobody: both sources are free and need no account).
 */
import { type Bbox, formatBytes, type ImageryEstimate, type ImagerySet, type ImageryWorldOption, type SceneOption } from "@outpost/shared";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Ellipsis, Satellite, Scan, SquareDashedMousePointer, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { ErrorState, Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { Badge, Checkbox, Progress, Skeleton } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { errorMessage } from "@/lib/api";
import { notify } from "@/lib/notify";
import { formatNumber } from "@/lib/utils";
import { useRemoveRegion } from "../data";
import { formatBboxSize, isValidBbox } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { DestinationLine, DestinationPicker, useDestination } from "../panels/destination";
import { Fact, PanelHeading } from "../ui";
import { estimateArea, searchScenes, useImagery, useStartArea, useStartWorld } from "./data";

/** "2 km", "10 m", "7.5 cm". */
const length = (metres: number) =>
  metres >= 1000
    ? `${formatNumber(metres / 1000)} km`
    : metres >= 1
      ? `${formatNumber(metres)} m`
      : `${formatNumber(Math.round(metres * 1000) / 10)} cm`;
const resolution = (metres: number) => `${length(metres)} a pixel`;
const isAerial = (source: string) => source !== "sentinel-2" && source !== "blue-marble";
const SOURCE_NAMES: Record<string, string> = {
  "blue-marble": "NASA Blue Marble",
  "sentinel-2": "Sentinel-2",
  "linz-aerial": "Aerial photograph, LINZ",
  naip: "Aerial photograph, USDA NAIP",
};
const SHORT_NAMES: Record<string, string> = { "linz-aerial": "LINZ", naip: "USDA NAIP" };
const minutes = (seconds: number) => (seconds < 90 ? `${Math.max(1, Math.round(seconds))} seconds` : `${Math.round(seconds / 60)} minutes`);
const percent = (value: number) => `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}%`;

const link = "text-primary underline decoration-1 underline-offset-2";

function SetRow({ set, onShow }: { set: ImagerySet; onShow: (() => void) | undefined }) {
  const [removing, setRemoving] = useState(false);
  const [choice, setChoice] = useState<"delete" | "keep">();
  const remove = useRemoveRegion();
  const trouble = !set.available
    ? "The drive holding this is not connected"
    : set.status === "missing"
      ? "The file is missing"
      : set.status === "damaged"
        ? "The file is damaged"
        : null;
  const who = SOURCE_NAMES[set.source] ?? set.source;
  return (
    <li className="py-3">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h4 className="font-title text-body text-ink">{set.name}</h4>
          <p className="tabular mt-0.5 text-small text-ink-muted">
            {who}, {isAerial(set.source) ? "flown" : set.source === "blue-marble" ? "taken in" : "taken on"} {set.imageDateText},{" "}
            {resolution(set.resolutionMeters)}
          </p>
          {set.source === "sentinel-2" ? (
            <p className="tabular text-small text-ink-muted">
              {set.areaCloudPercent !== null ? `Cloud or its shadow over the area: ${percent(set.areaCloudPercent)}. ` : ""}
              {set.sceneCloudPercent !== null ? `Whole scene: ${percent(set.sceneCloudPercent)}.` : ""}
            </p>
          ) : null}
          <p className="tabular text-small text-ink-muted">
            {formatBboxSize(set.bounds)}, {formatBytes(set.sizeBytes)}
            {set.transferredBytes !== null ? `, ${formatBytes(set.transferredBytes)} fetched to make it` : ""}
          </p>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-muted">
            Kept on {set.locationName}
            {trouble ? (
              <Badge tone="warning">
                <CircleAlert aria-hidden /> {trouble}
              </Badge>
            ) : null}
          </p>
        </div>
        <Menu>
          <MenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${set.name}`}>
              <Ellipsis />
            </Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem disabled={!onShow} onSelect={() => onShow?.()}>
              <Scan /> Show on map
            </MenuItem>
            <MenuSeparator />
            <MenuItem
              danger
              onSelect={() => {
                setChoice(set.available ? "delete" : "keep");
                setRemoving(true);
              }}
            >
              <Trash2 /> Remove
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ConfirmDialog
        open={removing}
        onOpenChange={setRemoving}
        title={`Remove “${set.name}”?`}
        description="The map will show the next coarser imagery here, or none."
        confirmLabel={choice === "delete" ? "Remove and delete the file" : "Remove, keep the file"}
        loading={remove.isPending}
        onConfirm={() =>
          remove.mutate(
            { id: set.id, deleteFiles: choice === "delete" },
            {
              onSuccess: () => {
                setRemoving(false);
                toast.success(choice === "delete" ? `Removed “${set.name}” and deleted its file.` : `Removed “${set.name}”.`);
              },
            },
          )
        }
      >
        <ChoiceList
          label="What happens to the file"
          value={choice}
          onChange={setChoice}
          choices={[
            {
              value: "delete",
              title: "Delete the file",
              detail: set.available ? `Frees ${formatBytes(set.sizeBytes)} on ${set.locationName}` : `${set.locationName} is not connected`,
              disabled: !set.available,
            },
            { value: "keep", title: "Keep the file", detail: `Outpost stops using it; the file stays on ${set.locationName}` },
          ]}
        />
      </ConfirmDialog>
    </li>
  );
}

function WorldRow({ option }: { option: ImageryWorldOption }) {
  const [confirming, setConfirming] = useState(false);
  const start = useStartWorld();
  const destination = useDestination(confirming ? option.workingBytes : null, "maps");
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="min-w-0 flex-1">
        <h4 className="text-small font-semibold text-ink">{option.name}</h4>
        <p className="mt-0.5 text-small text-ink-muted">{option.description}</p>
        <p className="tabular mt-0.5 text-small text-ink-muted">
          Fetches {formatBytes(option.transferBytes)} from NASA; about {formatBytes(option.estimatedSizeBytes)} kept.
        </p>
      </div>
      {option.installed ? (
        <Badge tone="success">Installed</Badge>
      ) : option.downloadId ? (
        <Badge>Downloading</Badge>
      ) : (
        <Button size="sm" onClick={() => setConfirming(true)}>
          Download
        </Button>
      )}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`${option.name}: ${formatBytes(option.transferBytes)} to fetch`}
        description={`From NASA, free and with no account. Outpost fetches NASA's picture and makes it into map tiles on this computer, which takes a few minutes after the download. About ${formatBytes(option.estimatedSizeBytes)} is kept; ${formatBytes(option.workingBytes)} of room is needed while it is made.`}
        confirmLabel={`Download ${formatBytes(option.transferBytes)}`}
        confirmVariant="primary"
        loading={start.isPending}
        onConfirm={() =>
          destination.locationId &&
          start.mutate(
            { entryId: option.id, locationId: destination.locationId },
            {
              onSuccess: () => {
                destination.remember();
                setConfirming(false);
                toast.success(`Downloading ${option.name.toLowerCase()} to ${destination.location?.name ?? "the chosen location"}.`);
              },
              onError: (error) => notify.error(errorMessage(error)),
            },
          )
        }
      >
        <dl className="mb-3">
          <Fact label="Picture">Blue Marble: Next Generation, July 2004</Fact>
          <Fact label="Detail">
            {resolution(option.resolutionMeters)}, to zoom {option.maxZoom}
          </Fact>
          <Fact label="Credit">NASA Earth Observatory</Fact>
          <Fact label="Cost">Free</Fact>
        </dl>
        <DestinationPicker destination={destination} label="Where to keep it" approximate />
      </ConfirmDialog>
    </li>
  );
}

export function SatelliteSection({
  engine,
  onChooseArea,
  sectionRef,
}: {
  engine: MapEngine | null;
  onChooseArea: () => void;
  sectionRef?: React.RefObject<HTMLElement | null>;
}) {
  const imagery = useImagery();
  return (
    <section ref={sectionRef} className="scroll-mt-4" aria-label="Satellite imagery">
      <PanelHeading
        actions={
          <Button size="sm" onClick={onChooseArea}>
            <Satellite /> Choose an area
          </Button>
        }
      >
        Satellite imagery
      </PanelHeading>
      <p className="mt-1 text-small text-ink-muted">
        Pictures of the ground under the roads and names, with the Satellite button on the map. Each is a picture of one day, which may be
        years ago: the day is written beside it, on the map and on a printed page.
      </p>
      {imagery.isPending ? (
        <div className="mt-3 grid gap-2" aria-busy>
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      ) : imagery.isError ? (
        <div className="mt-3">
          <ErrorState error={imagery.error} onRetry={() => imagery.refetch()} />
        </div>
      ) : (
        <>
          {imagery.data.sets.length > 0 ? (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {imagery.data.sets.map((set) => (
                <SetRow
                  key={set.id}
                  set={set}
                  onShow={engine ? () => engine.fitBounds(set.bounds, { maxZoom: Math.max(3, set.maxZoom - 1) }) : undefined}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-small text-ink-muted">None downloaded yet.</p>
          )}
          <h4 className="mt-4 text-small font-semibold text-ink">The whole world</h4>
          <ul className="mt-1 divide-y divide-border border-y border-border">
            {imagery.data.world.map((option) => (
              <WorldRow key={option.id} option={option} />
            ))}
          </ul>
          <h4 className="mt-4 text-small font-semibold text-ink">A small area in detail</h4>
          <p className="mt-1 text-small text-ink-muted">
            10 m a pixel from the European Union's Sentinel-2 satellites, free and with no account: fields, woods, lakes and the shape of a
            town, not single houses. Choose the area and the day; Outpost fetches only the part of the picture it needs.
          </p>
          <p className="mt-2 text-small text-ink-muted">
            Where a government publishes its aerial photographs openly in a form Outpost can read (New Zealand and the United States so
            far), the photograph of the area is offered beside the satellite's days: 7.5 cm to 1 m a pixel, enough for single houses and
            cars, but a great deal more data, so it is for a town centre or a valley floor, not a county. The Environment Agency's
            photographs of England are published only in a closed format (ECW) that Outpost cannot read.
          </p>
          <Button className="mt-3" onClick={onChooseArea}>
            <SquareDashedMousePointer /> Choose an area
          </Button>
        </>
      )}
    </section>
  );
}

/** Sentences about a source that could not be asked, or had nothing for the area. */
function SearchNotes({ notes }: { notes: string[] | undefined }) {
  if (!notes || notes.length === 0) return null;
  return (
    <ul className="grid gap-1 text-small text-ink-muted" aria-label="About the search">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

/** What an aerial photograph of the area will be, take and cost, before anything is fetched. */
function AerialFacts({ estimated }: { estimated: ImageryEstimate }) {
  const aerial = estimated.aerial!;
  const finer = aerial.readMeters > estimated.source.resolutionMeters * 1.05;
  return (
    <dl aria-label="What it will be">
      <Fact label="Picture">{estimated.scene.title ?? estimated.source.name}</Fact>
      <Fact label="Flown">{estimated.scene.dateText}</Fact>
      <Fact label="Detail">
        {resolution(estimated.source.resolutionMeters)}, to zoom {estimated.maxZoom}
        {finer ? (
          <span className="block text-ink-muted">
            Read from the publisher's own reduced copy at {length(aerial.readMeters)}, as fine as the map shows at zoom {estimated.maxZoom}
          </span>
        ) : null}
      </Fact>
      <Fact label="Area">
        {formatNumber(Math.round(estimated.areaKm2 * 100) / 100)} km²
        {estimated.scene.coveragePercent < 99 ? (
          <span className="block text-ink-muted">The survey covers {estimated.scene.coveragePercent}% of it</span>
        ) : null}
      </Fact>
      <Fact label="To fetch">
        {formatBytes(estimated.transferBytes)}
        <span className="block text-ink-muted">
          {formatNumber(estimated.requests)} requests, from{" "}
          {aerial.files === 1 ? "one of the publisher's files" : `${formatNumber(aerial.files)} of the publisher's files`}
        </span>
      </Fact>
      <Fact label="Kept on disk">
        About {formatBytes(estimated.estimatedSizeBytes)}
        <span className="block text-ink-muted">{formatNumber(estimated.tileCount)} map tiles</span>
      </Fact>
      <Fact label="Time">
        About {minutes(estimated.estimatedSeconds.low)} to {minutes(estimated.estimatedSeconds.high)}
      </Fact>
      <Fact label="Free space">
        {estimated.freeBytes === null ? "Not known" : `${formatBytes(estimated.freeBytes)} on ${estimated.locationName}`}
      </Fact>
      <Fact label="From">{estimated.source.publisher}</Fact>
      <Fact label="Licence">
        <a href={estimated.source.licenceUrl} target="_blank" rel="noopener noreferrer" className={link}>
          {estimated.source.licence}
        </a>
        <span className="block text-ink-muted">Credited on the map as “{aerial.credit}”</span>
      </Fact>
      <Fact label="Cost">
        <span className="font-semibold">Free</span>
        <span className="block text-ink-muted">{estimated.source.cost.replace(/^Free\.\s*/, "")}</span>
      </Fact>
    </dl>
  );
}

type Step = "area" | "date" | "confirm";

/** Choosing a small area, the day of its picture, and confirming what it will take. */
export function ImageryArea({
  engine,
  onClose,
  onNeedMap,
  onNeedRoom,
}: {
  engine: MapEngine | null;
  onClose: () => void;
  onNeedMap: () => void;
  onNeedRoom: () => void;
}) {
  const imagery = useImagery();
  const [step, setStep] = useState<Step>("area");
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [boxError, setBoxError] = useState<string>();
  const [name, setName] = useState("");
  const [scene, setScene] = useState<SceneOption | null>(null);
  const [acceptLarge, setAcceptLarge] = useState(false);
  const acceptId = useId();
  const whereRef = useRef<HTMLDivElement>(null);
  const search = useMutation({ mutationFn: searchScenes });
  const estimate = useMutation({ mutationFn: estimateArea });
  const start = useStartArea();
  const resetSearch = search.reset;
  const resetEstimate = estimate.reset;

  const chooseBox = useCallback(
    (next: Bbox) => {
      setBbox(next);
      setBoxError(undefined);
      setScene(null);
      resetSearch();
      resetEstimate();
    },
    [resetSearch, resetEstimate],
  );

  useEffect(() => {
    if (!engine) return;
    engine.setBox(bbox, step === "area" && !drawing);
  }, [engine, bbox, step, drawing]);
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
      if (result.ok) chooseBox(result.bbox);
      else
        setBoxError(
          result.reason === "antimeridian"
            ? "That box crosses the 180° meridian. Choose an area on one side of it."
            : "That box is too small. Drag a larger one.",
        );
    });
  }, [engine, chooseBox]);
  useEffect(() => {
    if (step !== "area") onNeedRoom();
  }, [step, onNeedRoom]);

  const estimated: ImageryEstimate | undefined = estimate.data;
  const destination = useDestination(estimated ? estimated.transferBytes + estimated.estimatedSizeBytes : null, "maps");
  const limits = imagery.data?.limits;
  const tooLarge = estimated?.warning.level === "refuse";
  const needsAccept = estimated?.warning.level === "warn";
  const canDownload = Boolean(estimated && !tooLarge && (!needsAccept || acceptLarge) && destination.locationId && scene && bbox);

  const back = step === "confirm" ? () => setStep("date") : step === "date" ? () => setStep("area") : onClose;
  const header = (
    <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
      <Button variant="ghost" size="sm" onClick={back}>
        <ArrowLeft /> {step === "confirm" ? "Choose another picture" : step === "date" ? "Change the area" : "Offline maps"}
      </Button>
    </div>
  );

  if (step === "area") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
          <div>
            <h3 className="font-title text-lead text-ink">Satellite imagery of an area</h3>
            <p className="mt-1 text-small text-ink-muted">
              Draw a box round the place that matters: a valley, a stretch of coast, the land round home. Smaller is quicker and smaller on
              disk{limits ? `; up to ${formatNumber(limits.noticeKm2)} km² needs no thought` : ""}.
            </p>
          </div>
          {!engine ? (
            <Notice tone="warning" icon={<CircleAlert />}>
              The map cannot be drawn in this browser, so an area cannot be chosen on it.
            </Notice>
          ) : (
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
                <SquareDashedMousePointer /> {drawing ? "Drawing: drag on the map" : bbox ? "Draw again" : "Draw a box"}
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
                  if (isValidBbox(box)) chooseBox(box);
                  else setBoxError("The view spans more than the whole world. Zoom in, then try again.");
                }}
              >
                Use the current view
              </Button>
            </div>
          )}
          {boxError ? (
            <Notice tone="danger" icon={<CircleAlert />}>
              {boxError}
            </Notice>
          ) : null}
          {bbox ? (
            <>
              <dl aria-label="The area" aria-live="polite">
                <Fact label="Size">{formatBboxSize(bbox)}</Fact>
              </dl>
              <Field label="Name for this area" hint="How it will be listed, for example “Derwentwater”.">
                {(ids) => <Input {...ids} value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />}
              </Field>
            </>
          ) : null}
        </div>
        <footer className="flex justify-end border-t border-border px-4 py-3">
          <Button
            variant="primary"
            disabled={!bbox || !name.trim()}
            onClick={() => {
              setStep("date");
              if (bbox && !search.data) search.mutate(bbox);
            }}
          >
            Find pictures
          </Button>
        </footer>
      </div>
    );
  }

  if (step === "date") {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        {header}
        <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-4 py-4">
          <div>
            <h3 className="font-title text-lead text-ink">Choose the picture</h3>
            <p className="mt-1 text-small text-ink-muted">
              Each satellite day is one moment's picture, with whatever cloud, shadow, snow and season it had; its cloud figure is the
              publisher's, for the whole 110 km scene, and the next step works it out for your area. An aerial photograph, where there is
              one, is far sharper, taken on a clear day of the season it was flown, which may be years ago.
            </p>
          </div>
          {search.isPending ? (
            <div role="status">
              <Progress label="Searching" tone="lamp" />
              <p className="mt-2 text-small text-ink-muted">
                Asking the Sentinel-2 catalogue for pictures of the area from the last year, and, where a government publishes aerial
                photographs of it, its catalogue too.
              </p>
            </div>
          ) : search.isError ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title="The pictures could not be found"
              action={<Button onClick={() => bbox && search.mutate(bbox)}>Try again</Button>}
            >
              {errorMessage(search.error)}
            </Notice>
          ) : search.data && search.data.options.length === 0 ? (
            <>
              <Notice tone="info">No picture of this area in the last year was clear enough to offer. Try a different area.</Notice>
              <SearchNotes notes={search.data.notes} />
            </>
          ) : search.data ? (
            <>
              <ChoiceList
                label="Picture of the area"
                value={scene?.key}
                onChange={(key) => {
                  setScene(search.data!.options.find((option) => option.key === key) ?? null);
                  resetEstimate();
                }}
                choices={search.data.options.map((option) =>
                  isAerial(option.source)
                    ? {
                        value: option.key,
                        title: `Aerial photograph, ${length(option.resolutionMeters)}`,
                        detail: `${option.title ? `${option.title}, flown` : "Flown"} ${option.dateText}${option.coveragePercent < 99 ? `; covers ${option.coveragePercent}% of the area` : ""}`,
                        trailing: SHORT_NAMES[option.source] ?? option.source,
                      }
                    : {
                        value: option.key,
                        title: option.dateText,
                        detail: `Sentinel-2, 10 m; cloud over the scene ${percent(option.sceneCloudPercent)}${option.coveragePercent < 99 ? `; covers ${option.coveragePercent}% of the area` : ""}${option.sceneIds.length > 1 ? `; ${option.sceneIds.length} scenes joined` : ""}`,
                        trailing: option.platform.replace(/^sentinel-2(\w)$/i, (_, letter: string) => `Sentinel-2${letter.toUpperCase()}`),
                      },
                )}
              />
              <SearchNotes notes={search.data.notes} />
            </>
          ) : null}
        </div>
        <footer className="flex justify-end border-t border-border px-4 py-3">
          <Button
            variant="primary"
            disabled={!scene}
            onClick={() => {
              setStep("confirm");
              setAcceptLarge(false);
              if (bbox && scene && !estimate.data) estimate.mutate({ bbox, sceneKey: scene.key, locationId: destination.locationId });
            }}
          >
            Continue
          </Button>
        </footer>
      </div>
    );
  }

  const aerial = scene ? isAerial(scene.source) : false;
  const download = () => {
    if (!bbox || !scene || !destination.location) return;
    const kept = destination.location.name;
    start.mutate(
      { bbox, sceneKey: scene.key, name: name.trim(), locationId: destination.locationId, acceptLarge: acceptLarge || undefined },
      {
        onSuccess: () => {
          destination.remember();
          toast.success(`Fetching “${name.trim()}” to ${kept}. Progress is shown here and under Downloads and tasks.`);
          onClose();
        },
      },
    );
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {header}
      <div className="scroll-quiet grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-4 py-4">
        <div>
          <h3 className="font-title text-lead text-ink">{name.trim()}</h3>
          <p className="tabular mt-1 text-small text-ink-muted">
            {bbox ? formatBboxSize(bbox) : ""},{" "}
            {aerial ? `aerial photograph flown ${scene?.dateText}` : `Sentinel-2 picture of ${scene?.dateText}`}
          </p>
        </div>
        {estimate.isPending ? (
          <div role="status">
            <Progress label="Working out the size" tone="lamp" />
            <p className="mt-2 text-small text-ink-muted">
              {aerial
                ? "Reading the index at the start of each of the photograph's files the area needs: a few kilobytes each."
                : "Reading the index of the scene's files, and its cloud map for the area: a few hundred kilobytes."}
            </p>
          </div>
        ) : estimate.isError ? (
          <Notice
            tone="danger"
            icon={<CircleAlert />}
            title="The size could not be worked out"
            action={<Button onClick={() => bbox && scene && estimate.mutate({ bbox, sceneKey: scene.key })}>Try again</Button>}
          >
            {errorMessage(estimate.error)}
          </Notice>
        ) : estimated ? (
          <>
            {estimated.warning.message ? (
              <Notice
                tone={estimated.warning.level === "warn" || estimated.warning.level === "refuse" ? "warning" : "info"}
                icon={<CircleAlert />}
                title={
                  estimated.warning.level === "refuse"
                    ? "Too large for one area"
                    : estimated.warning.level === "warn"
                      ? aerial
                        ? "A lot of data"
                        : "A large area"
                      : undefined
                }
              >
                {estimated.warning.message}
              </Notice>
            ) : null}
            {estimated.aerial ? (
              <AerialFacts estimated={estimated} />
            ) : (
              <dl aria-label="What it will be">
                <Fact label="Picture">Sentinel-2, Level-2A, {estimated.scene.dateText}</Fact>
                <Fact label="Detail">10 m a pixel, to zoom {estimated.maxZoom}</Fact>
                <Fact label="Cloud over the area">
                  {estimated.areaCloudPercent === null ? "Not known" : percent(estimated.areaCloudPercent)}
                  <span className="block text-ink-muted">Whole scene: {percent(estimated.scene.sceneCloudPercent)}</span>
                </Fact>
                <Fact label="Area">{formatNumber(Math.round(estimated.areaKm2))} km²</Fact>
                <Fact label="To fetch">
                  {formatBytes(estimated.transferBytes)}
                  <span className="block text-ink-muted">{formatNumber(estimated.requests)} requests</span>
                </Fact>
                <Fact label="Kept on disk">About {formatBytes(estimated.estimatedSizeBytes)}</Fact>
                <Fact label="Time">
                  About {minutes(estimated.estimatedSeconds.low)} to {minutes(estimated.estimatedSeconds.high)}
                </Fact>
                <Fact label="Scenes">
                  {estimated.scene.sceneIds.length === 1 ? "One, so no seams" : `${estimated.scene.sceneIds.length}, from the same day`}
                </Fact>
                <Fact label="Free space">
                  {estimated.freeBytes === null ? "Not known" : `${formatBytes(estimated.freeBytes)} on ${estimated.locationName}`}
                </Fact>
                <Fact label="From">European Union Copernicus programme, through AWS Open Data and Element 84's Earth Search</Fact>
                <Fact label="Licence">
                  <a href={estimated.source.licenceUrl} target="_blank" rel="noopener noreferrer" className={link}>
                    Free, full and open
                  </a>
                  <span className="block text-ink-muted">Credited on the map as “Contains modified Copernicus Sentinel data”</span>
                </Fact>
                <Fact label="Cost">
                  <span className="font-semibold">Free</span>
                  <span className="block text-ink-muted">
                    No account and no bill: the files are in a public bucket that is not requester-pays.
                  </span>
                </Fact>
              </dl>
            )}
            {estimated.aerial ? (
              <p className="text-small text-ink-muted">
                This is the photograph as the publisher made it, of the season it was flown ({estimated.scene.dateText}), not of today: new
                buildings and roads since then are not on it. Nothing is sharpened, and no zoom is made finer than the photograph.
              </p>
            ) : (
              <p className="text-small text-ink-muted">
                This is one moment's picture, not a seamless mosaic: it has the cloud, shadow and season of {estimated.scene.dateText}, and
                the colours are the satellite's own, made into an image by one fixed rule. If cloud covers what you care about, go back and
                choose another day.
              </p>
            )}
            {needsAccept ? (
              <div className="flex items-start gap-3">
                <Checkbox
                  id={acceptId}
                  checked={acceptLarge}
                  onCheckedChange={(checked) => setAcceptLarge(checked === true)}
                  className="mt-0.5"
                />
                <label htmlFor={acceptId} className="text-small text-ink">
                  {aerial ? "I have read this and want all of it" : "I have read this and want the whole area"}
                </label>
              </div>
            ) : null}
          </>
        ) : null}
        <div ref={whereRef} className="grid scroll-mt-4 gap-2">
          <h4 className="text-small font-semibold text-ink">Where to keep it</h4>
          <DestinationPicker destination={destination} />
        </div>
        {start.isError ? (
          <Notice tone="danger" icon={<CircleAlert />} title="The download did not start">
            {errorMessage(start.error)}
          </Notice>
        ) : null}
      </div>
      <footer className="grid gap-2.5 border-t border-border px-4 py-3">
        <DestinationLine
          destination={destination}
          onChange={() => {
            whereRef.current?.scrollIntoView({ block: "nearest" });
            whereRef.current?.querySelector<HTMLElement>('[role="radio"]:not([disabled])')?.focus({ preventScroll: true });
          }}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={download} disabled={!canDownload} loading={start.isPending}>
            {estimated ? `Fetch ${formatBytes(estimated.transferBytes)}` : "Fetch"}
          </Button>
        </div>
      </footer>
    </div>
  );
}
