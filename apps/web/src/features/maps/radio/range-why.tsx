/**
 * Why the estimated range has the shape it has: a disc seen from above, north up, with the ground in sight shaded
 * by bearing and distance out to 100 km (a radar's picture of the viewshed), and below it the ground's cross-section
 * along one direction, chosen by pressing or dragging on the disc: the terrain with the Earth's curve, the line of
 * sight from the aerial to the place chosen, what is in the way and what is in sight beyond.
 *
 * The cross-section is the line-of-sight check's own chart (sight-chart.tsx), over the same profile of the ground
 * (`GET /api/maps/terrain-profile`); the disc is drawn from the range's own answer, and asks nothing.
 */
import {
  analyseSight,
  compassWords,
  destinationPoint,
  type RangeGrid,
  rangeGrid,
  type SightRange,
  seenRunsOf,
  sightSamples,
} from "@outpost/shared";
import { type KeyboardEvent, type PointerEvent, useMemo, useState } from "react";
import { Spinner } from "@/components/ui/misc";
import { formatReach, furthestOf, RANGE_RINGS, seenAt } from "@/features/repeaters/map/range";
import { errorMessage } from "@/lib/api";
import { useDebounced } from "@/lib/use-debounced";
import { formatNumber } from "@/lib/utils";
import { useTerrainProfile } from "./data";
import { formatMeters } from "./sight";
import { SightChart } from "./sight-chart";

const SIZE = 240;
const RADIUS = 110;
const CENTRE = SIZE / 2;
/** Any frequency will do: the cross-section draws no Fresnel zone, only the line of sight. */
const ANY_MHZ = 145;
/** The disc is drawn in steps of this many degrees: about 4 px wide at its edge. */
const DISC_STEP_DEG = 2;

/** Distance out from the aerial as a radius on the disc: by its square root, so the nearer ground has room. */
export const discRadius = (meters: number, max: number) => RADIUS * Math.sqrt(Math.min(1, Math.max(0, meters) / max));
const discMeters = (radius: number, max: number) => Math.min(1, Math.max(0, radius) / RADIUS) ** 2 * max;

export interface Look {
  bearingDeg: number;
  meters: number;
}

/**
 * The disc as two SVG paths: the ground in sight, and the ground not known (no terrain). One wedge per
 * `DISC_STEP_DEG` for each stretch, stretches closer than a pixel joined and those under half a pixel left out.
 */
export function discPaths(range: SightRange, grid: RangeGrid): { seen: string; unknown: string } {
  const max = range.maxMeters;
  const per = Math.max(1, Math.round((DISC_STEP_DEG * grid.bearingCount) / 360));
  const point = (bearingDeg: number, radius: number) => {
    const angle = bearingDeg * (Math.PI / 180);
    return `${(CENTRE + radius * Math.sin(angle)).toFixed(1)},${(CENTRE - radius * Math.cos(angle)).toFixed(1)}`;
  };
  const wedge = (left: number, right: number, inner: number, outer: number) =>
    `M${point(left, inner)}L${point(left, outer)}L${point(right, outer)}L${point(right, inner)}Z`;
  let seen = "";
  let unknown = "";
  for (let first = 0; first < grid.bearingCount; first += per) {
    const left = (first * 360) / grid.bearingCount - 180 / grid.bearingCount;
    const right = left + (per * 360) / grid.bearingCount;
    const middle = (left + right) / 2;
    // In sight where most of the bearings in the step are, read at each pixel's distance along the middle one.
    let start: number | null = null;
    let end = 0;
    for (let pixel = 0; pixel <= RADIUS; pixel += 1) {
      const meters = discMeters(pixel + 0.5, max);
      let count = 0;
      for (let offset = 0; offset < per; offset += 1) count += seenAt(range, grid, ((first + offset) * 360) / grid.bearingCount, meters);
      const inSight = count * 2 >= per;
      if (inSight) {
        if (start === null) start = pixel;
        end = pixel + 1;
      } else if (start !== null) {
        seen += wedge(left, right, start, end);
        start = null;
      }
    }
    if (start !== null) seen += wedge(left, right, start, end);
    const bearing = range.bearings[Math.round((middle * grid.bearingCount) / 360 + grid.bearingCount) % grid.bearingCount];
    if (bearing?.unknownFromMeters != null) unknown += wedge(left, right, discRadius(bearing.unknownFromMeters, max), RADIUS);
  }
  return { seen, unknown };
}

/** The choice as words: "north-east (45°), 31 km out". */
export function describeLook(look: Look): string {
  return `${compassWords(look.bearingDeg)} (${Math.round(look.bearingDeg)}°), ${formatReach(look.meters)} out`;
}

/** `aerialName` is what the aerial is called in the words: "the aerial", "the repeater". */
export function RangeWhy({ range, aerialName = "the aerial" }: { range: SightRange; aerialName?: string }) {
  const grid = useMemo(() => rangeGrid(range), [range]);
  const paths = useMemo(() => discPaths(range, grid), [range, grid]);
  const [look, setLook] = useState<Look>(() => {
    const far = furthestOf(range);
    return far ? { bearingDeg: far.bearingDeg, meters: far.meters } : { bearingDeg: 0, meters: 10_000 };
  });
  const max = range.maxMeters;
  const chosen = useDebounced(look, 300);
  const end = useMemo(() => destinationPoint(range.at, chosen.bearingDeg, chosen.meters), [range.at, chosen]);
  const profile = useTerrainProfile(range.at, end);

  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons === 0 && event.pointerType === "mouse") return;
    const box = event.currentTarget.getBoundingClientRect();
    const scale = SIZE / Math.max(1, box.width);
    const x = (event.clientX - box.left) * scale - CENTRE;
    const y = (event.clientY - box.top) * scale - CENTRE;
    const bearingDeg = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    setLook({
      bearingDeg: Math.round(bearingDeg * 2) / 2,
      meters: Math.max(200, Math.round(discMeters(Math.hypot(x, y), max) / 100) * 100),
    });
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const turn = { ArrowRight: 2, ArrowLeft: -2, PageDown: 22.5, PageUp: -22.5 }[event.key];
    const reach = { ArrowUp: 1.25, ArrowDown: 0.8 }[event.key];
    if (turn === undefined && reach === undefined) return;
    event.preventDefault();
    setLook((current) => ({
      bearingDeg: (((current.bearingDeg + (turn ?? 0)) % 360) + 360) % 360,
      meters: Math.min(max, Math.max(200, Math.round((current.meters * (reach ?? 1)) / 100) * 100)),
    }));
  };

  const input = useMemo(
    () =>
      profile.data
        ? {
            distanceMeters: profile.data.distanceMeters,
            heights: profile.data.heights,
            antennaFromMeters: range.aerialMeters,
            antennaToMeters: range.stationMeters,
            frequencyMHz: ANY_MHZ,
          }
        : null,
    [profile.data, range.aerialMeters, range.stationMeters],
  );
  const samples = useMemo(() => {
    const all = input ? sightSamples(input) : null;
    return all ? all.map((sample) => ({ ...sample, fresnelRadiusMeters: 0 })) : null;
  }, [input]);
  const result = useMemo(() => (input ? analyseSight(input) : null), [input]);
  // The stretches in sight along the bearing chosen, out to the place chosen: drawn along the ground in the chart.
  const seen = useMemo(() => {
    const index = Math.round((chosen.bearingDeg * grid.bearingCount) / 360) % grid.bearingCount;
    return seenRunsOf(grid, index).flatMap(
      ([from, to]): Array<[number, number]> => (from > chosen.meters ? [] : [[from, Math.min(to, chosen.meters)]]),
    );
  }, [grid, chosen]);

  const blocked = result?.verdict === "blocked" ? result.obstruction : null;
  const verdict = !result
    ? null
    : result.verdict === "no-terrain" || result.verdict === "end-unknown"
      ? "No terrain is held there, so there is no saying."
      : blocked
        ? blocked.depthMeters < 2
          ? "On the edge of sight: the line of sight just grazes the ground on the way."
          : `Hidden: ground ${formatReach(blocked.distanceMeters)} out stands ${formatMeters(blocked.depthMeters)} above the line of sight.`
        : result.verdict === "incomplete"
          ? "Nothing is in the way where terrain is held, but part of the way has none."
          : "In sight: nothing stands in the way.";
  const lookX = CENTRE + discRadius(look.meters, max) * Math.sin((look.bearingDeg * Math.PI) / 180);
  const lookY = CENTRE - discRadius(look.meters, max) * Math.cos((look.bearingDeg * Math.PI) / 180);

  return (
    <div className="grid gap-2">
      <p className="text-small text-ink-muted">
        From above, north up: the ground in sight is shaded, out to {formatReach(max)}. Press or drag on the disc to look along one
        direction.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        {/* A range input cannot hold the drawing, so this is the slider pattern on a div. */}
        <div
          role="slider"
          tabIndex={0}
          aria-label="Direction to look along. Left and right arrows turn; up and down arrows look further or nearer."
          aria-valuemin={0}
          aria-valuemax={359}
          aria-valuenow={Math.round(look.bearingDeg)}
          aria-valuetext={describeLook(look)}
          onPointerDown={fromPointer}
          onPointerMove={fromPointer}
          onKeyDown={onKeyDown}
          className="w-full max-w-60 shrink-0 cursor-crosshair touch-none rounded-full select-none"
        >
          <svg aria-hidden viewBox={`0 0 ${SIZE} ${SIZE}`} className="block h-auto w-full">
            <circle cx={CENTRE} cy={CENTRE} r={RADIUS} className="fill-surface-strong" />
            <path d={paths.unknown} fill="var(--chart-grid)" />
            {/* Edged as on the map, so that a sliver in sight a fraction of a degree wide still shows. */}
            <path
              d={paths.seen}
              fill="var(--map-range)"
              fillOpacity={0.7}
              stroke="var(--map-range)"
              strokeWidth={1.25}
              strokeLinejoin="round"
            />
            {RANGE_RINGS.map((meters) => (
              <g key={meters}>
                <circle cx={CENTRE} cy={CENTRE} r={discRadius(meters, max)} fill="none" stroke="var(--map-range)" strokeOpacity={0.7} />
                <text
                  x={CENTRE + 3}
                  y={CENTRE - discRadius(meters, max) + 11}
                  className="tabular fill-ink-muted stroke-page text-[10px] [paint-order:stroke] [stroke-width:3px]"
                >
                  {formatNumber(meters / 1000)} km
                </text>
              </g>
            ))}
            <text x={CENTRE} y={8} textAnchor="middle" className="fill-ink text-[10px] font-medium">
              N
            </text>
            <line x1={CENTRE} y1={CENTRE} x2={lookX} y2={lookY} className="stroke-ink" strokeWidth={1.5} />
            <circle cx={lookX} cy={lookY} r={4.5} className="fill-page stroke-ink" strokeWidth={2} />
            <circle cx={CENTRE} cy={CENTRE} r={3} className="fill-ink" />
          </svg>
        </div>
        <ul className="grid gap-1 text-micro text-ink-muted" aria-label="What the disc shows">
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm border-2 border-[var(--map-range)] bg-[var(--map-range)]/70" /> In
            sight
          </li>
          <li className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3 rounded-sm bg-surface-strong" /> Hidden by nearer ground
          </li>
          {paths.unknown ? (
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm bg-[var(--chart-grid)]" /> No terrain
            </li>
          ) : null}
        </ul>
      </div>

      <p className="tabular text-small text-ink" aria-live="polite">
        Looking {describeLook(look)}.{verdict && look === chosen ? ` ${verdict}` : ""}
      </p>
      {profile.isPending ? (
        <p className="flex items-center gap-2 text-small text-ink-muted">
          <Spinner label="Reading the ground" /> Reading the ground along it
        </p>
      ) : profile.isError ? (
        <p className="text-small text-danger">{errorMessage(profile.error)}</p>
      ) : samples && result ? (
        <SightChart
          samples={samples}
          names={{ from: aerialName, to: "There", title: `The ground ${compassWords(chosen.bearingDeg)} of ${aerialName}` }}
          seen={seen}
          fresnel={false}
          mark={blocked && blocked.depthMeters >= 2 ? { distanceMeters: blocked.distanceMeters, label: "In the way" } : null}
          tone={blocked && blocked.depthMeters >= 2 ? "danger" : "success"}
          midBulgeMeters={result.midBulgeMeters}
          onScrub={noScrub}
        />
      ) : null}
    </div>
  );
}

const noScrub = () => undefined;
