/**
 * The sky track of one pass, as LogBook73 drew it: the sky seen from below, north at the
 * top, the horizon as the outer ring and straight up at the centre, with rings at 30°
 * and 60°. The track runs from where the satellite rises to where it sets; its highest
 * point is marked and given in words. A table of the same look angles follows for a
 * screen reader.
 */
import { compassPoint } from "@outpost/shared";
import type { SatellitePass, SatelliteState } from "./engine";
import { utcTime } from "./words";

const SIZE = 240;
const C = SIZE / 2;
const R = 100;

/** Where an azimuth and elevation fall on the plot: the centre is 90°, the ring is the horizon. */
export function skyXY(azimuthDeg: number, elevationDeg: number): [number, number] {
  return skyPoint(azimuthDeg, elevationDeg, C, C, R);
}

/** The same for a plot of any size: centre (cx, cy), the horizon `radius` from it. Used by the PDF too. */
export function skyPoint(azimuthDeg: number, elevationDeg: number, cx: number, cy: number, radius: number): [number, number] {
  const r = ((90 - Math.max(0, elevationDeg)) / 90) * radius;
  const angle = (azimuthDeg * Math.PI) / 180;
  return [cx + Math.sin(angle) * r, cy - Math.cos(angle) * r];
}

export function SkyPlot({ pass, path, now }: { pass: SatellitePass; path: SatelliteState[]; now?: Date }) {
  const d = path
    .map((point, index) => {
      const [x, y] = skyXY(point.azimuthDeg, point.elevationDeg);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  const [px, py] = skyXY(pass.tcaAzimuthDeg, pass.maxElevationDeg);
  const [sx, sy] = path[0] ? skyXY(path[0].azimuthDeg, 0) : [C, C];
  const nowPoint =
    now && now >= pass.aos && now <= pass.los
      ? path.reduce((best, point) =>
          Math.abs(point.at.getTime() - now.getTime()) < Math.abs(best.at.getTime() - now.getTime()) ? point : best,
        )
      : null;
  const description = `Rises in the ${compassPoint(pass.aosAzimuthDeg)} at ${utcTime(pass.aos)} UTC, highest ${Math.round(pass.maxElevationDeg)}° in the ${compassPoint(pass.tcaAzimuthDeg)} at ${utcTime(pass.tca)} UTC, sets in the ${compassPoint(pass.losAzimuthDeg)} at ${utcTime(pass.los)} UTC.`;
  return (
    <figure className="grid gap-2">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`Sky track. ${description}`} className="mx-auto w-full max-w-[17rem]">
        <circle cx={C} cy={C} r={R} fill="var(--color-surface)" stroke="var(--color-border-strong)" />
        {[30, 60].map((elevation) => (
          <circle
            key={elevation}
            cx={C}
            cy={C}
            r={((90 - elevation) / 90) * R}
            fill="none"
            stroke="var(--chart-grid)"
            strokeDasharray="3 4"
          />
        ))}
        <path d={`M${C - R} ${C}H${C + R}M${C} ${C - R}V${C + R}`} stroke="var(--chart-grid)" />
        {(
          [
            ["N", C, C - R - 6],
            ["E", C + R + 9, C + 4],
            ["S", C, C + R + 14],
            ["W", C - R - 9, C + 4],
          ] as const
        ).map(([label, x, y]) => (
          <text key={label} x={x} y={y} textAnchor="middle" fontSize="12" fill="var(--color-ink-muted)">
            {label}
          </text>
        ))}
        <text x={C + 3} y={C - ((90 - 30) / 90) * R - 3} fontSize="10" fill="var(--color-ink-muted)">
          30°
        </text>
        <text x={C + 3} y={C - ((90 - 60) / 90) * R - 3} fontSize="10" fill="var(--color-ink-muted)">
          60°
        </text>
        <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx={sx} cy={sy} r="4" fill="var(--color-page)" stroke="var(--chart-1)" strokeWidth="2" />
        <circle cx={px} cy={py} r="5" fill="var(--chart-1)" stroke="var(--color-page)" strokeWidth="2" />
        {nowPoint ? (
          <circle
            cx={skyXY(nowPoint.azimuthDeg, nowPoint.elevationDeg)[0]}
            cy={skyXY(nowPoint.azimuthDeg, nowPoint.elevationDeg)[1]}
            r="6"
            fill="none"
            stroke="var(--color-lamp)"
            strokeWidth="2.5"
          />
        ) : null}
      </svg>
      <figcaption className="text-small text-ink-muted">
        {description} Open ring: where it rises. Filled: its highest point.{nowPoint ? " Amber ring: where it is now." : ""}
      </figcaption>
    </figure>
  );
}
