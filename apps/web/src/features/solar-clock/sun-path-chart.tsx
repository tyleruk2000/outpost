/**
 * The sun's height through one day at a place, on the chosen clock, with the horizon
 * marked and where the sun is now: one line, one hue, a readout that answers the pointer
 * and the arrow keys, and the same figures as a table for a screen reader. Drawn by hand
 * as SVG like every chart in Outpost (see features/power/soc-chart.tsx).
 */
import { type KeyboardEvent, type PointerEvent, useId, useState } from "react";
import { formatBearing } from "@/features/maps/lib/geo";
import { sunAt } from "@/features/maps/lib/sun";
import type { ClockStyle } from "@/lib/clock";
import { useWidth } from "@/lib/use-width";
import { clockAt, reading, type ZoneChoice } from "./zone";

const AXIS_TEXT = "tabular fill-ink-muted text-[11px]";
const MINUTE = 60_000;
const STEP = 10;

export interface PathPoint {
  at: number;
  altitude: number;
  azimuth: number;
}

/** The sun every ten minutes through the clock's day that holds `now`. */
export function sunPath(now: number, lat: number, lon: number, zone: ZoneChoice): PathPoint[] {
  const midnight = now - reading(zone, now).minutes * MINUTE;
  return Array.from({ length: (24 * 60) / STEP + 1 }, (_, index) => {
    const at = midnight + index * STEP * MINUTE;
    const sun = sunAt(at, lat, lon);
    return { at, altitude: sun.apparentAltitude, azimuth: sun.azimuth };
  });
}

const heightWords = (altitude: number) =>
  altitude >= 0 ? `${altitude.toFixed(1)}° above the horizon` : `${Math.abs(altitude).toFixed(1)}° below the horizon`;

export function SunPathChart({
  points,
  now,
  current,
  zone,
  style,
  height = 200,
}: {
  points: PathPoint[];
  now: number;
  /** The sun at `now` itself, not at the nearest ten minutes. */
  current: PathPoint;
  zone: ZoneChoice;
  style: ClockStyle;
  height?: number;
}) {
  const [ref, width] = useWidth(640);
  const [at, setAt] = useState<number | null>(null);
  const tableId = useId();
  const left = 40;
  const right = 12;
  const top = 10;
  const bottom = 26;
  const highest = Math.max(10, ...points.map((point) => point.altitude));
  const lowest = Math.min(-10, ...points.map((point) => point.altitude));
  const ceiling = Math.ceil(highest / 10) * 10;
  const floor = Math.floor(lowest / 10) * 10;
  const first = points[0]!.at;
  const span = points.at(-1)!.at - first;
  const x = (ms: number) => left + ((ms - first) / span) * (width - left - right);
  const y = (altitude: number) => top + ((ceiling - altitude) / (ceiling - floor)) * (height - top - bottom);
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${x(point.at).toFixed(1)},${y(point.altitude).toFixed(1)}`).join("");
  const nowIndex = Math.max(0, Math.min(points.length - 1, Math.round((now - first) / (STEP * MINUTE))));
  const shown = at ?? nowIndex;
  const point = points[shown]!;
  const ticks: number[] = [];
  for (let value = floor; value <= ceiling; value += ceiling - floor > 60 ? 20 : 10) ticks.push(value);
  const indexAt = (event: PointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    return Math.min(
      points.length - 1,
      Math.max(0, Math.round(((event.clientX - box.left - left) / (width - left - right)) * (points.length - 1))),
    );
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, PageUp: -6, PageDown: 6, Home: -points.length, End: points.length }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    setAt(Math.min(points.length - 1, Math.max(0, (at ?? nowIndex) + step)));
  };
  const name = "The sun's height above the horizon through today";
  return (
    <div>
      <section
        ref={ref}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the chart is read with the arrow keys
        tabIndex={0}
        aria-label={`${name}. Left and right arrow keys move ten minutes; Page Up and Page Down an hour.`}
        aria-describedby={tableId}
        onKeyDown={onKey}
        className="rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      >
        <svg
          width={width}
          height={height}
          className="block touch-pan-y select-none"
          aria-hidden
          onPointerMove={(event) => setAt(indexAt(event))}
          onPointerDown={(event) => setAt(indexAt(event))}
          onPointerLeave={() => setAt(null)}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={left}
                x2={width - right}
                y1={y(tick)}
                y2={y(tick)}
                style={{ stroke: tick === 0 ? "var(--chart-axis)" : "var(--chart-grid)" }}
              />
              <text x={left - 6} y={y(tick) + 4} textAnchor="end" className={AXIS_TEXT}>
                {tick}°
              </text>
            </g>
          ))}
          <text
            x={width - right}
            y={y(0) - 5}
            textAnchor="end"
            className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
          >
            Horizon
          </text>
          {[0, 6, 12, 18, 24].map((hour) => {
            const atHour = first + hour * 60 * MINUTE;
            if (width < 420 && (hour === 6 || hour === 18)) return null;
            return (
              <text
                key={hour}
                x={x(atHour)}
                y={height - 8}
                textAnchor={hour === 0 ? "start" : hour === 24 ? "end" : "middle"}
                className={AXIS_TEXT}
              >
                {clockAt(atHour, zone, style)}
              </text>
            );
          })}
          <path d={path} fill="none" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" style={{ stroke: "var(--chart-1)" }} />
          <line
            x1={x(at === null ? current.at : point.at)}
            x2={x(at === null ? current.at : point.at)}
            y1={top}
            y2={height - bottom}
            className="stroke-ink"
            strokeWidth={1}
            opacity={at === null ? 0.35 : 1}
          />
          <circle
            cx={x(current.at)}
            cy={y(current.altitude)}
            r={6}
            strokeWidth={2}
            className="stroke-page"
            style={{ fill: "var(--chart-1)" }}
          />
          {at !== null ? <circle cx={x(point.at)} cy={y(point.altitude)} r={4} strokeWidth={2} className="stroke-page fill-ink" /> : null}
        </svg>
        <p aria-live="polite" className="tabular min-h-[1.3125rem] text-small text-ink">
          {at === null
            ? `Now, ${clockAt(current.at, zone, style)}: ${heightWords(current.altitude)}, bearing ${formatBearing(current.azimuth)}`
            : `${clockAt(point.at, zone, style)}: ${heightWords(point.altitude)}, bearing ${formatBearing(point.azimuth)}`}
        </p>
      </section>
      <div id={tableId} className="sr-only">
        <table>
          <caption>{name}, every hour</caption>
          <thead>
            <tr>
              <th scope="col">Time</th>
              <th scope="col">Height</th>
              <th scope="col">Bearing</th>
            </tr>
          </thead>
          <tbody>
            {points
              .filter((_, index) => index % 6 === 0)
              .map((each) => (
                <tr key={each.at}>
                  <th scope="row">{clockAt(each.at, zone, style)}</th>
                  <td>{heightWords(each.altitude)}</td>
                  <td>{formatBearing(each.azimuth)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
