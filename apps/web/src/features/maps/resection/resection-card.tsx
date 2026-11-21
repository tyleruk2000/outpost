/**
 * The resection tool: where you are, from compass bearings to two or three landmarks you
 * can see and find on the map. The card holds the landmarks (chosen by a press on the map,
 * or on a saved place) and the bearing to each, typed or taken from the phone's own
 * compass; the map shows the back-bearings, where they cross, the triangle of error and
 * the point found. All of it is worked out on this device (resection.ts), with nothing
 * fetched.
 */
import { angleInWords, haversineMeters, type MarkerDto } from "@outpost/shared";
import { Compass, Crosshair, MapPin, Plus, RotateCcw, X } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Notice } from "@/components/page";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/misc";
import { useLiveHeading } from "@/features/compass/live-heading";
import { useStoredState } from "../hooks";
import { formatDistance, type LatLon } from "../lib/geo";
import { pressWord } from "../lib/press";
import type { MapEngine } from "../map/engine";
import { EMPTY } from "../map/overlays";
import { MapCard } from "../map-chrome";
import { LANDMARK_LETTERS, RESECTION_SOURCE, resectionData } from "./layers";
import { type BearingNorth, errorPerDegree, NARROW_CUT, type Resection, resect } from "./resection";

export interface Landmark {
  position: LatLon | null;
  name?: string;
  /** The bearing as typed. */
  bearing: string;
}

const NORTH_KEY = "outpost.maps.resection.north";
const isNorth = (value: unknown): value is BearingNorth => value === "magnetic" || value === "true";

/** A bearing typed by hand: 0 to 360, a decimal point or comma, nothing else. Null while it is not one. */
export function readBearing(text: string): number | null {
  const trimmed = text.trim().replace(",", ".").replace(/°$/, "");
  if (!/^\d{1,3}(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= 0 && value <= 360 ? value % 360 : null;
}

const blank = (): Landmark => ({ position: null, bearing: "" });

export interface ResectionTool {
  card: ReactNode | null;
}

export function useResection({
  engine,
  active,
  markers,
  where,
  onSave,
  onDone,
}: {
  engine: MapEngine | null;
  active: boolean;
  /** Saved places: pressing one while choosing a landmark puts it exactly there. */
  markers: MarkerDto[];
  /** A position in the readout's format. */
  where: (position: LatLon) => string;
  /** Saves the point found as a place. */
  onSave: (position: LatLon) => void;
  onDone: () => void;
}): ResectionTool {
  const [landmarks, setLandmarks] = useState<Landmark[]>(() => [blank(), blank()]);
  const [picking, setPicking] = useState<number | null>(0);
  const [north, setNorth] = useStoredState<BearingNorth>(NORTH_KEY, isNorth, "magnetic");
  const [liveFor, setLiveFor] = useState<number | null>(null);
  const live = useLiveHeading(liveFor !== null);
  // The date the declination is for: today, as the device has it when the tool is taken up.
  const [now, setNow] = useState(() => Date.now());

  // Taken up: start again. Put down: forget, and let go of the compass.
  useEffect(() => {
    setLandmarks([blank(), blank()]);
    setPicking(active ? 0 : null);
    setLiveFor(null);
    setNow(Date.now());
  }, [active]);

  const held = useRef({ landmarks, picking });
  held.current = { landmarks, picking };
  /** Puts the landmark being chosen at a position, then asks for the next one still to be chosen. */
  const place = useCallback((position: LatLon, name?: string) => {
    const { landmarks: current, picking: index } = held.current;
    if (index === null) return;
    const next = current.map((landmark, at) => (at === index ? { ...landmark, position, name } : landmark));
    setLandmarks(next);
    const waiting = next.findIndex((landmark) => !landmark.position);
    held.current = { landmarks: next, picking: waiting === -1 ? null : waiting };
    setPicking(held.current.picking);
  }, []);

  const latest = useRef(markers);
  latest.current = markers;
  useEffect(() => {
    if (!engine || !active) return;
    return engine.on("click", ({ position, hit }) => {
      const marker = hit?.type === "marker" ? latest.current.find((item) => item.id === hit.id) : undefined;
      place(marker ? { lat: marker.lat, lon: marker.lon } : position, marker?.name);
    });
  }, [engine, active, place]);

  // The landmarks with a place and a bearing, and what they give.
  const { ready, result, lineOf } = useMemo(() => {
    const usable = landmarks
      .map((landmark, index) => ({ landmark, index, bearing: readBearing(landmark.bearing) }))
      .filter((entry) => entry.landmark.position && entry.bearing !== null);
    const worked: Resection | null =
      usable.length >= 2
        ? resect(
            usable.map((entry) => ({ position: entry.landmark.position!, bearing: entry.bearing! })),
            north,
            now,
          )
        : null;
    return { ready: usable, result: worked, lineOf: usable.map((entry) => entry.index) };
  }, [landmarks, north, now]);

  useEffect(() => {
    if (!engine) return;
    engine.setOverlay(
      RESECTION_SOURCE,
      active
        ? resectionData(
            landmarks.map((landmark) => landmark.position),
            result,
            lineOf,
          )
        : EMPTY,
    );
  }, [engine, active, landmarks, result, lineOf]);

  if (!active) return { card: null };

  const setBearing = (index: number, bearing: string) =>
    setLandmarks((current) => current.map((landmark, at) => (at === index ? { ...landmark, bearing } : landmark)));
  const secure = typeof window !== "undefined" && window.isSecureContext && typeof DeviceOrientationEvent !== "undefined";

  const card = (
    <MapCard title="Find where you are from bearings" onClose={onDone} closeLabel="Stop finding where you are">
      <div className="mt-1 grid grid-cols-[minmax(0,1fr)] gap-2.5">
        {ready.length < 2 ? (
          <p className="text-small text-ink-muted">
            Take a compass bearing to two or three things you can see and find on the map: a summit, a mast, a church. Choose each on the
            map, then give its bearing.
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-small text-ink-muted">Bearings from</span>
          <Segmented
            label="Bearings measured from"
            value={north}
            onChange={setNorth}
            options={[
              { value: "magnetic", label: "Magnetic north (a compass)" },
              { value: "true", label: "True north" },
            ]}
          />
        </div>

        <ol className="grid gap-2" aria-label="Landmarks">
          {landmarks.map((landmark, index) => {
            const letter = LANDMARK_LETTERS[index]!;
            const typed = landmark.bearing.trim();
            const bad = typed !== "" && readBearing(typed) === null;
            return (
              <li key={letter} className="grid gap-1.5 border-t border-border pt-2">
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className="mt-0.5 grid size-5 shrink-0 place-content-center rounded-full bg-ink text-micro font-semibold text-page"
                  >
                    {letter}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-small text-ink">
                      <span className="sr-only">Landmark {letter}: </span>
                      {picking === index ? (
                        <span aria-live="polite">{pressWord()} the map where it is. Pressing a saved place puts it exactly there.</span>
                      ) : landmark.position ? (
                        <>
                          {landmark.name ? <span className="font-medium">{landmark.name} · </span> : null}
                          <span className="tabular font-mono text-[0.8125rem]">{where(landmark.position)}</span>
                        </>
                      ) : (
                        <span className="text-ink-muted">Not chosen yet</span>
                      )}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {picking === index ? (
                        engine ? (
                          <Button size="sm" onClick={() => place(engine.getCenter())}>
                            <Crosshair /> Use the centre of the map
                          </Button>
                        ) : null
                      ) : (
                        <Button size="sm" variant="ghost" onClick={() => setPicking(index)}>
                          <MapPin /> {landmark.position ? "Choose again" : "Choose on the map"}
                        </Button>
                      )}
                      {index === 2 ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setLandmarks((current) => current.slice(0, 2));
                            if (picking === 2) setPicking(null);
                            if (liveFor === 2) setLiveFor(null);
                          }}
                        >
                          <X /> Remove C
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-7">
                  <label htmlFor={`resection-bearing-${letter}`} className="flex items-center gap-1.5 text-small text-ink">
                    Bearing to {letter}
                    <Input
                      id={`resection-bearing-${letter}`}
                      inputMode="decimal"
                      value={landmark.bearing}
                      onChange={(event) => setBearing(index, event.target.value)}
                      aria-invalid={bad || undefined}
                      className="tabular w-20"
                      placeholder="0–360"
                    />
                    °
                  </label>
                  {secure ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-pressed={liveFor === index}
                      onClick={async () => {
                        if (liveFor === index) {
                          setLiveFor(null);
                          return;
                        }
                        setLiveFor(index);
                        await live.start();
                      }}
                    >
                      <Compass /> {liveFor === index ? "Stop the compass" : "Phone's compass"}
                    </Button>
                  ) : null}
                </div>
                {bad ? <p className="pl-7 text-small text-danger">A bearing is a figure from 0 to 360.</p> : null}
                {liveFor === index ? (
                  <LiveBearing
                    state={live.state}
                    heading={live.heading?.magnetic ?? null}
                    north={north}
                    declination={result?.declination ?? null}
                    onTake={(value) => {
                      setBearing(index, String(Math.round(value) % 360));
                      setLiveFor(null);
                    }}
                  />
                ) : null}
              </li>
            );
          })}
        </ol>
        {landmarks.length < 3 ? (
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setLandmarks((current) => [...current, blank()]);
                setPicking(2);
              }}
            >
              <Plus /> Add a third landmark
            </Button>
          </div>
        ) : null}

        <ResectionAnswer result={result} ready={ready.length} north={north} where={where} letters={lineOf} />

        <div className="flex flex-wrap gap-2">
          {result?.fix ? (
            <Button size="sm" variant="primary" onClick={() => onSave(result.fix!)}>
              Save this place
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setLandmarks([blank(), blank()]);
              setPicking(0);
              setLiveFor(null);
            }}
          >
            <RotateCcw /> Start again
          </Button>
        </div>
      </div>
    </MapCard>
  );
  return { card };
}

function LiveBearing({
  state,
  heading,
  north,
  declination,
  onTake,
}: {
  state: ReturnType<typeof useLiveHeading>["state"];
  heading: number | null;
  north: BearingNorth;
  /** Known once two landmarks give a point; before that a true bearing is worked at the landmarks. */
  declination: number | null;
  onTake: (bearing: number) => void;
}) {
  if (state === "denied") return <p className="pl-7 text-small text-ink-muted">The phone's compass was not allowed for this page.</p>;
  if (state === "none") return <p className="pl-7 text-small text-ink-muted">This device gives no compass heading.</p>;
  if (state === "insecure")
    return <p className="pl-7 text-small text-ink-muted">A live compass needs Outpost opened at an HTTPS address.</p>;
  if (heading === null) return <p className="pl-7 text-small text-ink-muted">Waiting for the phone's compass…</p>;
  // The phone gives a magnetic heading. For true bearings it is turned by the declination, once that is known.
  const shown = north === "magnetic" ? heading : declination === null ? null : (heading + declination + 360) % 360;
  return (
    <div className="flex flex-wrap items-center gap-2 pl-7">
      <p className="tabular text-body font-semibold text-ink" aria-live="polite">
        {String(Math.round(heading) % 360).padStart(3, "0")}° magnetic
      </p>
      {shown !== null ? (
        <Button size="sm" onClick={() => onTake(shown)}>
          Take this bearing
        </Button>
      ) : (
        <p className="text-small text-ink-muted">Set bearings from magnetic north to take this one.</p>
      )}
      <p className="w-full text-small text-ink-muted">
        Hold the phone flat with its top edge at the landmark, or upright with its camera on it, away from iron and cars.
      </p>
    </div>
  );
}

function ResectionAnswer({
  result,
  ready,
  north,
  where,
  letters,
}: {
  result: Resection | null;
  ready: number;
  north: BearingNorth;
  where: (position: LatLon) => string;
  /** The landmark letter of each line. */
  letters: number[];
}) {
  if (!result) {
    return ready === 1 ? <p className="text-small text-ink-muted">One more landmark with its bearing gives a point.</p> : null;
  }
  const name = (index: number) => LANDMARK_LETTERS[letters[index]!]!;
  const behind = result.crossings.filter((crossing) => !crossing.position && crossing.cut > 1);
  const parallel = result.crossings.filter((crossing) => crossing.cut <= 1);
  const narrow = result.crossings.filter((crossing) => crossing.position && crossing.cut < NARROW_CUT && crossing.cut > 1);
  const fix = result.fix;
  // The furthest landmark: the error a degree makes grows with the distance to it.
  const furthest = fix ? Math.max(...result.lines.map((line) => haversineMeters(fix.lat, fix.lon, line.from.lat, line.from.lon))) : 0;

  return (
    <div aria-live="polite" className="grid gap-2">
      {fix ? (
        <div className="rounded-panel bg-surface px-3 py-2">
          <p className="text-small text-ink-muted">You are about here</p>
          <p className="tabular font-mono text-body text-ink">{where(fix)}</p>
          <p className="mt-1 text-small text-ink">
            {result.triangleMeters !== null
              ? `The three lines make a triangle of error ${formatDistance(result.triangleMeters)} across. You are near it, and may be outside it: its size shows how good the bearings were.`
              : result.lines.length === 2
                ? "Two lines cross here. A third bearing would show how good they are."
                : "Two of the lines cross; the point is where all of them come closest."}
          </p>
        </div>
      ) : null}
      {north === "magnetic" ? (
        <p className="text-small text-ink-muted">
          Declination here {angleInWords(result.declination)} (World Magnetic Model), added to each bearing to make it true.
        </p>
      ) : null}
      {behind.map((crossing) => (
        <Notice
          key={crossing.between.join()}
          tone="warning"
          title={`The lines from ${name(crossing.between[0])} and ${name(crossing.between[1])} do not meet`}
        >
          They would cross behind a landmark, so both bearings cannot be right. Check them, and that each landmark is where it is on the
          map.
        </Notice>
      ))}
      {parallel.map((crossing) => (
        <Notice
          key={crossing.between.join()}
          tone="warning"
          title={`${name(crossing.between[0])} and ${name(crossing.between[1])} are in line`}
        >
          Their lines run side by side and give no point between them. Choose a landmark in another direction.
        </Notice>
      ))}
      {narrow.map((crossing) => (
        <p key={crossing.between.join()} className="text-small text-ink">
          {name(crossing.between[0])} and {name(crossing.between[1])} cross at only {Math.round(crossing.cut)}°: each degree a bearing is
          out moves the point about {formatDistance(errorPerDegree(furthest, crossing.cut))}. Landmarks about 60° to 120° apart give a
          better point.
        </p>
      ))}
    </div>
  );
}
