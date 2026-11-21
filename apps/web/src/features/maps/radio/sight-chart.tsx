/**
 * The path profile of a line-of-sight check: the ground between the two antennas with
 * the Earth's curve added to it, the straight ray, and the first Fresnel zone around
 * the ray. Moving along it (pointer, finger or arrow keys) reads out one place on the
 * path and reports it, so the map can show where that is.
 *
 * It follows the elevation profile beside it in the Routes tab: the same size of type,
 * the same slider for the keyboard, drawn by hand as SVG.
 */
import type { SightSample } from "@outpost/shared";
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useId, useMemo, useRef, useState } from "react";
import { formatDistance, formatHeight } from "../lib/geo";
import { columnAt, describeSample, formatMeters, type SightReading, sightChartGeometry } from "./sight";

const HEIGHT = 176;
const PAD = { top: 12, right: 12, bottom: 20, left: 12 };
const TEXT = "tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]";
/** The colour of the mark at the place the answer turns on: a state, so it comes with words beside it. */
const MARK_STROKE: Record<SightReading["tone"], string> = {
  danger: "stroke-danger",
  warning: "stroke-warning",
  success: "stroke-success",
  info: "stroke-ink",
};

function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      <svg aria-hidden width="18" height="10" viewBox="0 0 18 10" className="shrink-0">
        {swatch}
      </svg>
      {children}
    </li>
  );
}

const PATH_NAMES = { from: "A", to: "B", title: "The path from A to B" };

export function SightChart({
  samples,
  mark,
  tone,
  midBulgeMeters,
  onScrub,
  names = PATH_NAMES,
  seen,
  fresnel = true,
}: {
  /**
   * What the two ends are called, and the chart: A and B for the check between two points; the aerial and a place
   * for the cross-section of an estimated range.
   */
  names?: { from: string; to: string; title: string };
  /** Stretches of ground in sight from the first end, [from, to] in metres: drawn along the ground in the range's colour. */
  seen?: Array<[number, number]>;
  /** Draw the first Fresnel zone, and say it: the check between two points does, the range's line-of-sight picture does not. */
  fresnel?: boolean;
  samples: SightSample[];
  /** The place the answer turns on, with a few words for it. */
  mark: SightReading["mark"];
  tone: SightReading["tone"];
  /** How far the Earth's curve lifts the middle of the path, for the line that explains the drawing. */
  midBulgeMeters: number;
  /** The share of the way along the path that is being looked at, 0 to 1, or null when none is. */
  onScrub: (share: number | null) => void;
}) {
  const wrapper = useRef<HTMLElement>(null);
  const clipId = useId();
  const [width, setWidth] = useState(360);
  const [at, setAt] = useState<number | null>(null);
  const total = samples.at(-1)!.distanceMeters;

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(200, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Leaving the chart clears its point from the map.
  useEffect(() => () => onScrub(null), [onScrub]);

  const geometry = useMemo(() => sightChartGeometry(samples, width, HEIGHT, PAD), [samples, width]);
  const column = at === null ? null : columnAt(geometry.columns, at);
  const sample = column ? samples[column.index]! : null;
  const marked = mark ? samples[Math.round((mark.distanceMeters / total) * (samples.length - 1))]! : null;

  const move = (distance: number | null) => {
    setAt(distance);
    onScrub(distance === null ? null : columnAt(geometry.columns, distance).distanceMeters / total);
  };
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const share = (event.clientX - box.left - PAD.left) / Math.max(1, box.width - PAD.left - PAD.right);
    move(Math.max(0, Math.min(1, share)) * total);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = total / 50;
    const current = at ?? 0;
    const next =
      event.key === "ArrowRight"
        ? current + step
        : event.key === "ArrowLeft"
          ? current - step
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? total
              : null;
    if (next === null) return;
    event.preventDefault();
    move(Math.max(0, Math.min(total, next)));
  };

  const baseline = HEIGHT - PAD.bottom;
  const rows = useMemo(() => Array.from({ length: 11 }, (_, row) => samples[Math.round((row * (samples.length - 1)) / 10)]!), [samples]);
  // The mark's words go on whichever side of it has the room.
  const markX = marked ? geometry.x(marked.distanceMeters) : 0;
  // It sits on the ground at that place: the top of what is in the way, or of what comes closest.
  const markY = marked ? geometry.y(marked.rayMeters - (marked.clearanceMeters ?? 0)) : 0;
  const markLeft = markX > width / 2;
  // The ground in sight: a line along the top of the ground for each stretch, through the columns that fall in it.
  const seenLines = useMemo(() => {
    if (!seen) return [];
    return seen.flatMap(([from, to]) => {
      const columns = geometry.columns.filter(
        (column) => column.drawnGround !== null && column.distanceMeters >= from && column.distanceMeters <= to,
      );
      if (columns.length === 0) return [];
      const points = columns.map(
        (column) => `${geometry.x(column.distanceMeters).toFixed(1)},${geometry.y(column.drawnGround!).toFixed(1)}`,
      );
      // A stretch narrower than a column still shows, as a short dash.
      return [`M${points.join("L")}${points.length === 1 ? "h2" : ""}`];
    });
  }, [seen, geometry]);

  return (
    <figure ref={wrapper} className="m-0">
      <figcaption>
        <p className="text-small font-medium text-ink">{names.title}, seen from the side</p>
        <p className="tabular min-h-[2.25rem] text-micro text-ink-muted" aria-live="off">
          {sample
            ? describeSample(sample, names.from)
            : `The Earth's curve is drawn into the ground (${formatMeters(midBulgeMeters)} at the middle), so the ray is straight. It is the curve of an Earth of 4/3 radius, the usual allowance for radio.`}
        </p>
      </figcaption>
      {/* A range input cannot hold the drawing, so this is the slider pattern on a div. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={`Position along ${names.title.charAt(0).toLowerCase()}${names.title.slice(1)}. Arrow keys move along it.`}
        aria-valuemin={0}
        aria-valuemax={Math.round(total)}
        aria-valuenow={Math.round(sample?.distanceMeters ?? 0)}
        aria-valuetext={sample ? describeSample(sample, names.from) : "Not on the path"}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={(event) => event.pointerType === "mouse" && move(null)}
        onBlur={() => move(null)}
        onKeyDown={onKeyDown}
        className="mt-1 cursor-crosshair touch-pan-y rounded-control select-none"
      >
        <svg aria-hidden width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="block">
          <defs>
            <clipPath id={clipId}>
              <rect x={PAD.left} y={0} width={Math.max(0, width - PAD.left - PAD.right)} height={baseline} />
            </clipPath>
          </defs>
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top} y2={PAD.top} stroke="var(--chart-grid)" strokeDasharray="2 3" />
          <g clipPath={`url(#${clipId})`}>
            {geometry.gaps.map((gap) => (
              <rect
                key={gap.x1}
                x={gap.x1}
                width={Math.max(0, gap.x2 - gap.x1)}
                y={PAD.top}
                height={baseline - PAD.top}
                fill="var(--chart-grid)"
              />
            ))}
            {geometry.seaLevel ? (
              <path d={geometry.seaLevel} fill="none" stroke="var(--chart-axis)" strokeWidth={1} strokeDasharray="1 3" />
            ) : null}
            {fresnel ? (
              <path d={geometry.zone} fill="var(--chart-2)" fillOpacity={0.2} stroke="var(--chart-2)" strokeWidth={1} strokeOpacity={0.7} />
            ) : null}
            {geometry.ground.map((run) => (
              <g key={run.line.slice(0, 24)}>
                <path d={run.area} fill="var(--chart-other)" fillOpacity={0.55} />
                <path d={run.line} fill="none" stroke="var(--chart-axis)" strokeWidth={1.5} strokeLinejoin="round" />
              </g>
            ))}
            {seenLines.map((line) => (
              <path key={line.slice(0, 24)} d={line} fill="none" stroke="var(--map-range)" strokeWidth={3.5} strokeLinejoin="round" />
            ))}
            <path d={geometry.ray} fill="none" stroke="var(--chart-1)" strokeWidth={2} strokeLinecap="round" />
          </g>
          <line x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} stroke="var(--chart-axis)" />

          {/* The two antennas: a mast from the ground to where the ray begins and ends. */}
          {[samples[0]!, samples.at(-1)!].map((end) => {
            const x = geometry.x(end.distanceMeters);
            return (
              <g key={end.distanceMeters}>
                <line
                  x1={x}
                  x2={x}
                  y1={geometry.y(end.groundMeters ?? end.rayMeters)}
                  y2={geometry.y(end.rayMeters)}
                  className="stroke-ink"
                  strokeWidth={2}
                />
                <circle cx={x} cy={geometry.y(end.rayMeters)} r={4} className="fill-page stroke-ink" strokeWidth={2} />
              </g>
            );
          })}

          {geometry.gaps.map((gap) =>
            gap.x2 - gap.x1 > 64 ? (
              <text key={gap.x1} x={(gap.x1 + gap.x2) / 2} y={(PAD.top + baseline) / 2} textAnchor="middle" className={TEXT}>
                No terrain
              </text>
            ) : null,
          )}

          {/* Clear of the mast at A, which stands on the left edge. */}
          <text x={PAD.left + 12} y={PAD.top + 12} className={TEXT}>
            {formatHeight(geometry.ceiling)}
          </text>
          <text x={PAD.left + 12} y={baseline - 4} className={TEXT}>
            {formatHeight(geometry.floor)}
          </text>
          <text x={PAD.left} y={HEIGHT - 5} className={TEXT}>
            {names.from.charAt(0).toUpperCase() + names.from.slice(1)}
          </text>
          <text x={width - PAD.right} y={HEIGHT - 5} textAnchor="end" className={TEXT}>
            {names.to}, {formatDistance(total)} from {names.from}
          </text>

          {marked && mark ? (
            <g>
              <circle cx={markX} cy={markY} r={5} className={`fill-page ${MARK_STROKE[tone]}`} strokeWidth={2.5} />
              <text
                x={markX + (markLeft ? -9 : 9)}
                y={Math.max(PAD.top + 22, markY - 8)}
                textAnchor={markLeft ? "end" : "start"}
                className="tabular fill-ink stroke-page text-[11px] font-medium [paint-order:stroke] [stroke-width:3px]"
              >
                {mark.label}
              </text>
            </g>
          ) : null}

          {sample ? (
            <g>
              <line
                x1={geometry.x(sample.distanceMeters)}
                x2={geometry.x(sample.distanceMeters)}
                y1={PAD.top}
                y2={baseline}
                className="stroke-ink"
                strokeWidth={1}
              />
              <circle
                cx={geometry.x(sample.distanceMeters)}
                cy={geometry.y(sample.rayMeters)}
                r={4.5}
                className="fill-page stroke-ink"
                strokeWidth={2}
              />
              {sample.groundMeters !== null ? (
                <circle
                  cx={geometry.x(sample.distanceMeters)}
                  cy={geometry.y(sample.groundMeters + sample.bulgeMeters)}
                  r={4.5}
                  className="fill-page stroke-ink"
                  strokeWidth={2}
                />
              ) : null}
            </g>
          ) : null}
        </svg>
      </div>

      <ul className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-micro text-ink-muted" aria-label="What is drawn">
        <LegendItem swatch={<line x1="1" x2="17" y1="5" y2="5" stroke="var(--chart-1)" strokeWidth="2" strokeLinecap="round" />}>
          Ray
        </LegendItem>
        {fresnel ? (
          <LegendItem
            swatch={
              <rect
                x="1"
                y="1"
                width="16"
                height="8"
                rx="4"
                fill="var(--chart-2)"
                fillOpacity="0.2"
                stroke="var(--chart-2)"
                strokeOpacity="0.7"
              />
            }
          >
            First Fresnel zone
          </LegendItem>
        ) : null}
        {seen ? (
          <LegendItem swatch={<line x1="1" x2="17" y1="5" y2="5" stroke="var(--map-range)" strokeWidth="3.5" />}>
            Ground in sight from {names.from}
          </LegendItem>
        ) : null}
        <LegendItem
          swatch={
            <>
              <rect x="1" y="3" width="16" height="7" fill="var(--chart-other)" fillOpacity="0.55" />
              <line x1="1" x2="17" y1="3" y2="3" stroke="var(--chart-axis)" strokeWidth="1.5" />
            </>
          }
        >
          Ground, with the curve
        </LegendItem>
        {geometry.gaps.length > 0 ? (
          <LegendItem swatch={<rect x="1" y="1" width="16" height="8" fill="var(--chart-grid)" />}>No terrain</LegendItem>
        ) : null}
      </ul>

      {/* The same numbers for a screen reader: eleven places along the path. */}
      <table className="sr-only">
        <caption>{names.title} at eleven places along it</caption>
        <thead>
          <tr>
            <th scope="col">Distance from {names.from}</th>
            <th scope="col">Ground</th>
            <th scope="col">Lift from the Earth's curve</th>
            <th scope="col">Ray</th>
            <th scope="col">Clear between ray and ground</th>
            {fresnel ? <th scope="col">Radius of the first Fresnel zone</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.distanceMeters}>
              <th scope="row">{formatDistance(row.distanceMeters)}</th>
              <td>{row.groundMeters === null ? "No terrain" : formatHeight(row.groundMeters)}</td>
              <td>{formatMeters(row.bulgeMeters)}</td>
              <td>{formatMeters(row.rayMeters)}</td>
              <td>
                {row.clearanceMeters === null
                  ? "Not known"
                  : row.clearanceMeters < 0
                    ? `Ground ${formatMeters(row.clearanceMeters)} above the ray`
                    : formatMeters(row.clearanceMeters)}
              </td>
              {fresnel ? <td>{formatMeters(row.fresnelRadiusMeters)}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
