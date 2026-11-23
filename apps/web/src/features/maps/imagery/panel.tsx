/**
 * Satellite pictures, chosen inside Add a place (Offline maps): for an area, the day of its
 * picture (with its cloud) or a government's aerial photograph, then what it will be, take and
 * cost before anything is fetched; for the whole world, NASA's picture at each detail. Nothing is
 * fetched until the person has seen whose picture, of what day, how fine, how large, how much
 * will be transferred, under what licence, and what it costs (nothing, and to nobody).
 */
import { type Bbox, formatBytes, type ImageryEstimate, type ImageryWorldOption, type SceneOption } from "@outpost/shared";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { DialogBody, DialogFooter } from "@/components/ui/dialog";
import { Checkbox, Progress } from "@/components/ui/misc";
import { ChoiceList } from "@/features/downloads/choice-list";
import { errorMessage } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { formatBboxSize } from "../lib/geo";
import { DestinationLine, DestinationPicker, useDestination } from "../panels/destination";
import { Fact } from "../ui";
import { estimateArea, searchScenes, useStartArea } from "./data";

/** "2 km", "10 m", "7.5 cm". */
const length = (metres: number) =>
  metres >= 1000
    ? `${formatNumber(metres / 1000)} km`
    : metres >= 1
      ? `${formatNumber(metres)} m`
      : `${formatNumber(Math.round(metres * 1000) / 10)} cm`;
const resolution = (metres: number) => `${length(metres)} a pixel`;
const isAerial = (source: string) => source !== "sentinel-2" && source !== "blue-marble";
const SHORT_NAMES: Record<string, string> = { "linz-aerial": "LINZ", naip: "USDA NAIP" };
const minutes = (seconds: number) => (seconds < 90 ? `${Math.max(1, Math.round(seconds))} seconds` : `${Math.round(seconds / 60)} minutes`);
const percent = (value: number) => `${value < 10 ? value.toFixed(1).replace(/\.0$/, "") : Math.round(value)}%`;

const link = "text-primary underline decoration-1 underline-offset-2";

/** The cost line of the Satellite pictures tick, before a picture is chosen. */
export const SATELLITE_AREA_COST =
  "Free, from Sentinel-2 (10 m) or a government's aerial photographs. Choose the day after this step; the size is said then.";

/** What NASA's picture of the world fetches and keeps, in one line. */
export const worldLine = (option: ImageryWorldOption) =>
  `${option.name}: fetches ${formatBytes(option.transferBytes)} from NASA; about ${formatBytes(option.estimatedSizeBytes)} kept`;

/** NASA's pictures of the world as choices, the ones held or on their way not offered. */
export function WorldPictureChoice({
  options,
  value,
  onChange,
}: {
  options: ImageryWorldOption[];
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  return (
    <ChoiceList
      label="NASA's picture of the world"
      value={value}
      onChange={onChange}
      choices={options.map((option) => ({
        value: option.id,
        title: option.name,
        detail: `${resolution(option.resolutionMeters)}. Fetches ${formatBytes(option.transferBytes)}; about ${formatBytes(option.estimatedSizeBytes)} kept, ${formatBytes(option.workingBytes)} of room while it is made`,
        disabled: option.installed || option.downloadId !== null,
        ...(option.installed ? { trailing: "Added" } : option.downloadId ? { trailing: "Downloading" } : {}),
      }))}
    />
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
        {resolution(estimated.source.resolutionMeters)}
        {finer ? (
          <span className="block text-ink-muted">Read from the publisher's own reduced copy at {length(aerial.readMeters)}</span>
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

/** What a Sentinel-2 picture of the area will be, take and cost. */
function SatelliteFacts({ estimated }: { estimated: ImageryEstimate }) {
  return (
    <dl aria-label="What it will be">
      <Fact label="Picture">Sentinel-2, Level-2A, {estimated.scene.dateText}</Fact>
      <Fact label="Detail">10 m a pixel</Fact>
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
        <span className="block text-ink-muted">No account and no bill: the files are in a public bucket that is not requester-pays.</span>
      </Fact>
    </dl>
  );
}

/**
 * The satellite step of Add a place for an area: the picture (a day and its cloud, or an aerial
 * photograph), then what it will be and cost, then Fetch. The area and its name come from Add a
 * place's first step. The search is the press of the step before.
 */
export function SatellitePicture({
  area,
  onBack,
  onDone,
  heading,
}: {
  area: { bbox: Bbox; name: string };
  /** Back to "What for …?". */
  onBack: () => void;
  onDone: () => void;
  heading?: React.RefObject<HTMLHeadingElement | null>;
}) {
  const [step, setStep] = useState<"date" | "confirm">("date");
  const [scene, setScene] = useState<SceneOption | null>(null);
  const [acceptLarge, setAcceptLarge] = useState(false);
  const acceptId = useId();
  const whereRef = useRef<HTMLDivElement>(null);
  const search = useMutation({ mutationFn: searchScenes });
  const estimate = useMutation({ mutationFn: estimateArea });
  const start = useStartArea();
  const { bbox, name } = area;
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on arriving from the press that asked for pictures
  useEffect(() => {
    search.mutate(bbox);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once for each step
  useEffect(() => {
    heading?.current?.focus({ preventScroll: true });
  }, [step]);

  const estimated: ImageryEstimate | undefined = estimate.data;
  const destination = useDestination(estimated ? estimated.transferBytes + estimated.estimatedSizeBytes : null, "maps");
  const tooLarge = estimated?.warning.level === "refuse";
  const needsAccept = estimated?.warning.level === "warn";
  const canDownload = Boolean(estimated && !tooLarge && (!needsAccept || acceptLarge) && destination.locationId && scene);

  if (step === "date") {
    return (
      <>
        <DialogBody className="grid content-start gap-4">
          <div>
            <h3 ref={heading} tabIndex={-1} className="font-title text-lead text-ink focus:outline-none">
              Satellite pictures of {name}
            </h3>
            <p className="mt-1 text-small text-ink-muted">
              Each satellite day is one moment's picture, with whatever cloud, shadow, snow and season it had; its cloud figure is the
              publisher's, for the whole 110 km scene, and the next step works it out for your area. An aerial photograph, where there is
              one, is far sharper, taken on a clear day of the season it was flown, which may be years ago.
            </p>
            <p className="mt-1 text-small text-ink-muted">
              Aerial photographs are offered where a government publishes them openly in a form Outpost reads (New Zealand and the United
              States so far). England's aerial photographs are published only in a closed format (ECW) that Outpost cannot read.
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
              action={<Button onClick={() => search.mutate(bbox)}>Try again</Button>}
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
                  estimate.reset();
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
        </DialogBody>
        <DialogFooter>
          <Button onClick={onBack}>
            <ArrowLeft /> Back
          </Button>
          <Button
            variant="primary"
            disabled={!scene}
            onClick={() => {
              setStep("confirm");
              setAcceptLarge(false);
              if (scene && !estimate.data) estimate.mutate({ bbox, sceneKey: scene.key, locationId: destination.locationId });
            }}
          >
            Continue
          </Button>
        </DialogFooter>
      </>
    );
  }

  const aerial = scene ? isAerial(scene.source) : false;
  const download = () => {
    if (!scene || !destination.location) return;
    start.mutate(
      { bbox, sceneKey: scene.key, name, locationId: destination.locationId, acceptLarge: acceptLarge || undefined },
      {
        onSuccess: () => {
          destination.remember();
          toast.success(`Adding satellite pictures of ${name}. Progress is shown on Offline maps.`);
          onDone();
        },
      },
    );
  };

  return (
    <>
      <DialogBody className="grid content-start gap-5">
        <div>
          <h3 ref={heading} tabIndex={-1} className="font-title text-lead text-ink focus:outline-none">
            {name}
          </h3>
          <p className="tabular mt-1 text-small text-ink-muted">
            {formatBboxSize(bbox)}, {aerial ? `aerial photograph flown ${scene?.dateText}` : `Sentinel-2 picture of ${scene?.dateText}`}
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
            action={<Button onClick={() => scene && estimate.mutate({ bbox, sceneKey: scene.key })}>Try again</Button>}
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
            {estimated.aerial ? <AerialFacts estimated={estimated} /> : <SatelliteFacts estimated={estimated} />}
            {estimated.aerial ? (
              <p className="text-small text-ink-muted">
                This is the photograph as the publisher made it, of the season it was flown ({estimated.scene.dateText}), not of today: new
                buildings and roads since then are not on it. Nothing is sharpened, and no detail is made finer than the photograph.
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
      </DialogBody>
      <DialogFooter className="grid gap-2.5">
        <DestinationLine
          destination={destination}
          onChange={() => {
            whereRef.current?.scrollIntoView({ block: "nearest" });
            whereRef.current?.querySelector<HTMLElement>('[role="radio"]:not([disabled])')?.focus({ preventScroll: true });
          }}
        />
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button onClick={() => setStep("date")}>
            <ArrowLeft /> Choose another picture
          </Button>
          <Button variant="primary" onClick={download} disabled={!canDownload} loading={start.isPending}>
            {estimated ? `Download · ${formatBytes(estimated.transferBytes)}` : "Download"}
          </Button>
        </div>
      </DialogFooter>
    </>
  );
}
