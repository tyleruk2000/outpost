/**
 * "Estimated radio range from here": the outline a repeater's range draws, for any point on the map, chosen from the
 * menu a long press or a right-click opens. For working out what a radio could reach from a hilltop or a planned site.
 *
 * It is the repeaters' estimate and nothing new: the same answer from `/api/maps/sight-range` (how far out a station at
 * a stated height stays in sight of the aerial over the installed terrain, bearing by bearing), drawn by the same
 * layers and read out in the same words (`repeaters/map/range.ts`). Only the aerial is the person's: how high it is
 * above the ground here, a handheld's 1.5 m unless told otherwise. One point at a time; the heights are remembered on
 * this device.
 *
 * A fresh point takes the server a second or two (reading the terrain out to 100 km), so it is asked a line at a time
 * (`use-range-lines.ts`): the card shows how far along it is, and the map draws the near ground first. Other heights
 * at the same point are quick, and while they are worked out the last answer stays on the map, faded.
 */
import {
  RANGE_BEARINGS,
  RANGE_MAX_HEIGHT_METERS,
  RANGE_MAX_METERS,
  RANGE_STATIONS,
  type RangeStationId,
  type SightRange,
} from "@outpost/shared";
import { ChevronDown, ChevronRight, ChevronUp, CircleAlert, Download, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Progress, Segmented } from "@/components/ui/misc";
import { ShareCodeButton } from "@/features/qr/share-code";
import {
  describeRangeTerrain,
  formatHeight,
  formatKm,
  formatReach,
  RANGE_ACCURACY,
  rangeFitBounds,
  readRange,
  stationOf,
} from "@/features/repeaters/map/range";
import { RangeKey } from "@/features/repeaters/map/range-key";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { cn } from "@/lib/utils";
import { useStoredState } from "../hooks";
import type { LatLon } from "../lib/geo";
import type { MapEngine } from "../map/engine";
import { MapCard } from "../map-chrome";
import { mapCard } from "../ui";
import { downloadText, rangeFileName, rangeGpx, rangeKml } from "./range-files";
import { RangeWhy } from "./range-why";
import { NumberField } from "./sight-panel";
import { type RangeWork, useStreamedSightRange } from "./use-range-lines";

/** A radio held in the hand: the height the other end is assumed at too, unless chosen otherwise. */
export const POINT_AERIAL_DEFAULT_METERS = 1.5;
/**
 * Heights are asked about once they have stopped changing for this long: a height typed or stepped through (1, 1.5,
 * 5, 10) or the other station tapped twice asks once, not once for each. What was asked and is no longer wanted is
 * given up, and the server stops working on it.
 */
export const POINT_RANGE_SETTLE_MS = 300;
const PREFS_KEY = "outpost.maps.pointRange";

interface PointRangePrefs {
  aerial: number;
  station: RangeStationId;
}

const isPrefs = (value: unknown): value is PointRangePrefs =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as PointRangePrefs).aerial === "number" &&
  (value as PointRangePrefs).aerial >= 0 &&
  (value as PointRangePrefs).aerial <= RANGE_MAX_HEIGHT_METERS &&
  RANGE_STATIONS.some((station) => station.id === (value as PointRangePrefs).station);

export interface PointRangeAt {
  position: LatLon;
  /** A saved place's name, when the point is one; otherwise the coordinates say where it is. */
  name?: string;
  /** The heights to work it out with, when they come with it (a shared link); otherwise the ones remembered here. */
  heights?: { aerial: number; station: RangeStationId };
}

/** The address that opens the map at a point with its range drawn, worked out with these heights: what the QR code holds. */
export function pointRangePath(at: PointRangeAt, heights: { aerial: number; station: RangeStationId }): string {
  const params = new URLSearchParams({
    lat: at.position.lat.toFixed(5),
    lon: at.position.lon.toFixed(5),
    z: "12",
    range: String(heights.aerial),
    station: heights.station,
  });
  if (at.name) params.set("name", at.name);
  return `/maps?${params.toString()}`;
}

/** The point, name and heights of a range from an address made by `pointRangePath`, or null if it holds none. */
export function readPointRangePath(params: URLSearchParams): PointRangeAt | null {
  const aerialText = params.get("range");
  if (aerialText === null) return null;
  const lat = Number(params.get("lat"));
  const lon = Number(params.get("lon"));
  const aerial = Number(aerialText);
  const station = params.get("station") ?? "handheld";
  if (!(params.get("lat") && params.get("lon") && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) return null;
  if (!(aerialText !== "" && aerial >= 0 && aerial <= RANGE_MAX_HEIGHT_METERS)) return null;
  if (!RANGE_STATIONS.some((option) => option.id === station)) return null;
  const name = params.get("name")?.trim().slice(0, 120);
  return { position: { lat, lon }, ...(name ? { name } : {}), heights: { aerial, station: station as RangeStationId } };
}

export interface PointRange {
  /** Takes the range away. */
  stop(): void;
  /** Shows the range from this point (one at a time). */
  start(at: PointRangeAt): void;
  /** The card while a range is shown, or null. */
  card: ReactNode | null;
  /**
   * The outline to draw with the repeaters' outlines, once it is known: the near part while the rest is worked out,
   * and the last answer, faded (`dim`), while other heights are.
   */
  outline: { range: SightRange; name: string; dim?: boolean } | null;
}

export function usePointRange({
  engine,
  where,
  onOpenOffline,
}: {
  engine: MapEngine | null;
  /** The point's coordinates in the readout's format, for the card. */
  where: (position: LatLon) => string;
  onOpenOffline?: () => void;
}): PointRange {
  const [at, setAt] = useState<PointRangeAt | null>(null);
  // The card is short unless asked: where it is from and the answer, so that the outline has the map. The heights
  // and what the estimate is are a press away.
  const [details, setDetails] = useState(false);
  const [why, setWhy] = useState(false);
  // Folded to two short lines once taken up, as a repeater's range is: the shading is what was asked for, and on a
  // phone the whole card took three fifths of the screen. The answer in full is a press away.
  const [folded, setFolded] = useState(true);
  // Opened, the drawing of why the shape is as it is is brought into view: it was below the fold of the card.
  const whyDrawing = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (why) whyDrawing.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [why]);
  const [prefs, setPrefs] = useStoredState<PointRangePrefs>(PREFS_KEY, isPrefs, {
    aerial: POINT_AERIAL_DEFAULT_METERS,
    station: "handheld",
  });
  // Heights being typed or tapped through are asked about once they settle; ones that came with a shared range, at once.
  const settled = useDebounced(prefs, POINT_RANGE_SETTLE_MS);
  const [given, setGiven] = useState<PointRangePrefs | null>(null);
  const asked = given !== null && given.aerial === prefs.aerial && given.station === prefs.station ? given : settled;
  const station = stationOf(prefs.station);
  const range = useStreamedSightRange(at?.position ?? null, asked.aerial, stationOf(asked.station).meters);
  // The answer for the heights asked, not one kept on the map while they are worked out.
  const answer = range.stale ? undefined : range.data;

  // Once the outline is known, all of it is brought into view, clear of the card.
  const card = useRef<HTMLDivElement>(null);
  const fitted = useRef<string | null>(null);
  useEffect(() => {
    if (!engine || !answer || !at) return;
    const key = `${at.position.lat},${at.position.lon}`;
    if (fitted.current === key) return;
    fitted.current = key;
    const clearBottom = (card.current?.closest(".outpost-map-card")?.getBoundingClientRect().height ?? 0) + 16;
    engine.fitBounds(rangeFitBounds(answer), { clearBottom, maxZoom: 13 });
  }, [engine, answer, at]);

  const name = at?.name ?? "Estimated range";
  // What the map draws: the near part while the rest is read, else the answer, or the last one faded while other
  // heights are worked out. The same object until that or the name changes, so it is not drawn again on every render.
  const part = range.working?.part ?? null;
  const drawn = part ?? range.data;
  const dim = !part && range.stale;
  const outline = useMemo(() => (at && drawn ? { range: drawn, name, dim } : null), [at, drawn, name, dim]);
  const reading = answer ? readRange(answer, "here") : null;
  const terrain = answer ? describeRangeTerrain(answer) : null;
  const ground = (answer ?? drawn)?.groundMeters;
  // Worked out with the answer, not on each render: the outline has one corner per bearing.
  const files = useMemo(() => {
    if (!answer) return null;
    const input = {
      range: answer,
      name,
      aerialMeters: answer.aerialMeters,
      station: `${station.name.toLowerCase()}, ${formatHeight(answer.stationMeters)}`,
    };
    const gpx = rangeGpx(input);
    const kml = rangeKml(input);
    return gpx && kml ? { gpx, kml } : null;
  }, [answer, name, station.name]);

  const close = () => {
    setAt(null);
    fitted.current = null;
  };
  const short = range.isError
    ? "The range could not be worked out"
    : range.working
      ? workingWords(range.working)
      : (reading?.short ?? "Working out the range");
  const content = !at ? null : folded ? (
    <section aria-label="Estimated radio range" className={cn(mapCard, "py-1.5")}>
      <div ref={card} className="flex items-center gap-2">
        <h2 className="min-w-0 flex-1 text-body font-semibold text-ink">Estimated radio range</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Show the details" aria-expanded={false} onClick={() => setFolded(false)}>
          <ChevronUp />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Stop showing this range" onClick={close} className="-mr-1.5 max-w-none">
          <X />
        </Button>
      </div>
      <p className="tabular text-small text-ink-muted" aria-live="polite">
        {short}
      </p>
      {range.working ? (
        <Progress value={range.working.done} label="Working out the range" className="mt-1 mb-0.5 h-1 animate-reveal" />
      ) : null}
    </section>
  ) : (
    <MapCard
      title="Estimated radio range"
      onClose={close}
      closeLabel="Stop showing this range"
      action={
        <Button variant="ghost" size="icon-sm" aria-label="Show less" aria-expanded onClick={() => setFolded(true)} className="-mt-1">
          <ChevronDown />
        </Button>
      }
    >
      <div ref={card} className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-2.5">
        <p className="tabular text-small text-ink-muted">
          From {at.name ? `“${at.name}”, ` : ""}
          {where(at.position)}
          {ground !== null && ground !== undefined ? `, ground ${formatHeight(ground)} above sea level` : ""}
        </p>

        <div aria-live="polite">
          {range.working ? (
            <RangeWorking work={range.working} stale={range.stale} />
          ) : range.isError ? (
            <Notice
              tone="danger"
              icon={<CircleAlert />}
              title="The range could not be worked out"
              action={
                <Button size="sm" variant="ghost" onClick={() => range.refetch()}>
                  Try again
                </Button>
              }
            >
              {errorMessage(range.error)}
            </Notice>
          ) : reading ? (
            <div className="grid gap-1 text-small">
              <p className="font-medium text-ink">{reading.title}</p>
              {reading.furthest ? <p className="text-ink">{reading.furthest}</p> : null}
              {reading.typicalMeans ? <p className="text-ink-muted">{reading.typicalMeans}</p> : null}
              {answer && answer.coverage !== "none" ? <RangeKey typical={Boolean(reading.typicalMeans)} /> : null}
              {reading.note ? (
                <p className="text-ink-muted">
                  {reading.note}{" "}
                  {onOpenOffline && reading.needsTerrain ? (
                    <button
                      type="button"
                      onClick={onOpenOffline}
                      className="font-medium text-primary underline underline-offset-2 hover:no-underline max-md:inline-flex md:pointer-coarse:inline-flex max-md:min-h-11 md:pointer-coarse:min-h-11 max-md:items-center md:pointer-coarse:items-center"
                    >
                      Get terrain in Offline maps
                    </button>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        {answer && answer.coverage !== "none" ? (
          <>
            <button
              type="button"
              aria-expanded={why}
              onClick={() => setWhy((open) => !open)}
              className="flex min-h-11 items-center gap-2 text-left text-small font-medium text-ink hover:text-primary"
            >
              <ChevronRight aria-hidden className={cn("size-4 text-ink-muted transition-transform", why && "rotate-90")} />
              Why this shape: look along one direction
            </button>
            {why ? (
              <div ref={whyDrawing} className="scroll-mb-3">
                <RangeWhy range={answer} />
              </div>
            ) : null}
          </>
        ) : null}
        <div className="flex flex-wrap items-center gap-1">
          {/* The link carries the point and the heights; the phone's Outpost works the outline out again and draws it. */}
          <ShareCodeButton
            target={{
              name: name === "Estimated range" ? "this range" : `the range from ${name}`,
              outpostPath: pointRangePath(at, prefs),
              geo: at.position,
              outpostNote: `It opens the map at the point with the range drawn, worked out there for your aerial at ${formatHeight(prefs.aerial)} and ${station.name.toLowerCase()} at the other end.`,
            }}
          />
          {/* The outline itself, for other map apps: made here from the answer on screen. */}
          {files
            ? (
                [
                  ["gpx", "GPX", "application/gpx+xml", files.gpx],
                  ["kml", "KML", "application/vnd.google-earth.kml+xml", files.kml],
                ] as const
              ).map(([extension, label, type, text]) => (
                <Button
                  key={extension}
                  size="sm"
                  variant="ghost"
                  aria-label={`Download the outline as ${label}`}
                  onClick={() => downloadText(rangeFileName(name, extension), text, type)}
                >
                  <Download /> {label}
                </Button>
              ))
            : null}
        </div>

        <button
          type="button"
          aria-expanded={details}
          onClick={() => setDetails((open) => !open)}
          className="flex min-h-11 items-center gap-2 text-left text-small font-medium text-ink hover:text-primary"
        >
          <ChevronRight aria-hidden className={cn("size-4 text-ink-muted transition-transform", details && "rotate-90")} />
          Heights and details: your aerial {formatHeight(prefs.aerial)}, {station.name.toLowerCase()} at the other end
        </button>

        {details ? (
          <>
            <div className="flex flex-wrap items-end gap-2.5">
              <div className="w-40">
                <NumberField
                  label="Your aerial"
                  value={prefs.aerial}
                  min={0}
                  max={RANGE_MAX_HEIGHT_METERS}
                  unit="m"
                  onChange={(next) => setPrefs((current) => ({ ...current, aerial: next }))}
                />
              </div>
              <Segmented
                label="The other station"
                value={prefs.station}
                onChange={(next) => setPrefs((current) => ({ ...current, station: next }))}
                options={RANGE_STATIONS.map((option) => ({ value: option.id, label: option.name }))}
              />
            </div>
            <p className="tabular text-small text-ink-muted">
              Line of sight only. Your aerial {formatHeight(prefs.aerial)} above the ground here (1.5 m is a radio held in the hand; give a
              mast's height if it is on one). {station.name} {formatHeight(station.meters)}: {station.about}. Out to{" "}
              {formatReach(RANGE_MAX_METERS)}.
            </p>

            <details className="group">
              <summary className="flex min-h-11 cursor-default items-center gap-2 py-1 text-small font-medium text-ink marker:content-none hover:text-primary [&::-webkit-details-marker]:hidden">
                <ChevronRight aria-hidden className="size-4 text-ink-muted transition-transform group-open:rotate-90" />
                What this is, and is not
              </summary>
              <div className="scroll-quiet grid max-h-56 gap-1.5 overflow-y-auto pb-1 pl-6 text-small text-ink-muted">
                {reading?.sentences.map((sentence) => (
                  <p key={sentence}>{sentence}</p>
                ))}
                <p>
                  The ground a radio here can see over the terrain: along {RANGE_BEARINGS} bearings, which ground the other station would be
                  in sight of your aerial from, on an Earth of 4/3 radius, as the line-of-sight check and the repeaters' range use. It is
                  not a circle, because a hill blocks one side and not another.
                </p>
                <p>
                  It is an estimate, not a promise. It takes no account of power, the band, aerials, woods and buildings, or signals bending
                  over ridges: radio often reaches less than this, and sometimes more.
                </p>
                <p>
                  The shaded ground is in sight of your aerial; ground left clear is hidden by nearer ground, as the slopes just below a
                  summit usually are. The grey rings are 10, 25, 50 and 100 km from here, drawn out to the first beyond the furthest ground
                  in sight. The dashed circle is the typical range: half the directions from here reach further, half not as far. With no
                  terrain it is the smooth-Earth radio horizon, a plain dashed circle, and says so.
                </p>
                {terrain ? <p>{terrain}</p> : null}
                {answer && answer.coverage !== "none" ? <p>{RANGE_ACCURACY}</p> : null}
              </div>
            </details>
          </>
        ) : null}
      </div>
    </MapCard>
  );

  return {
    start(next) {
      fitted.current = null;
      setDetails(false);
      setWhy(false);
      setFolded(true);
      const { heights, ...point } = next;
      setGiven(heights ?? null);
      if (heights) setPrefs(heights);
      setAt(point);
    },
    stop() {
      setAt(null);
      fitted.current = null;
    },
    card: content,
    outline,
  };
}

/** How long the last fresh answer took on this server, in whole seconds, when it was a second or more. */
const expectSeconds = (work: RangeWork) => (work.expectMs !== null && work.expectMs >= 1000 ? Math.round(work.expectMs / 1000) : null);

/** The work in a few words, for the folded card. */
function workingWords(work: RangeWork): string {
  if (work.part) return `Drawn out to ${formatKm(work.part.maxMeters)}, working out further`;
  const seconds = expectSeconds(work);
  return seconds ? `Working out the range, about ${seconds} s` : "Working out the range";
}

/**
 * How far along the work is: a bar that fills band by band as the server reads the ground (near first), and what it
 * is doing in words. Seen only once it has taken longer than a moment, so a quick answer shows no flicker; the words
 * are read out as they change (politely, by the region round it), the bar's every step is not.
 */
function RangeWorking({ work, stale }: { work: RangeWork; stale: boolean }) {
  const seconds = expectSeconds(work);
  return (
    <div className="grid gap-1.5 animate-reveal">
      <Progress value={work.done} label="Working out the range" />
      <p className="tabular text-small text-ink-muted">
        {work.part
          ? `The ground in sight out to ${formatKm(work.part.maxMeters)} is drawn; working out the ground further out.`
          : `Working out the range from the ground's shape${seconds ? `, about ${seconds} s on this Outpost` : ""}.`}
        {stale && !work.part ? " The last answer stays on the map, faded, until this one is ready." : ""}
      </p>
    </div>
  );
}
