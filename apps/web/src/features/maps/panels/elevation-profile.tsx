/**
 * A track's elevation profile: height against distance, drawn as SVG from the track's
 * own points. Moving along it (pointer, finger or arrow keys) reports the matching
 * position so the map can show where on the route that is.
 */
import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { formatDistance, formatHeight, type LatLon } from "../lib/geo";
import { type Profile, profileGeometry, sampleAt } from "../lib/profile";

const HEIGHT = 136;
const PAD = { top: 10, right: 8, bottom: 20, left: 8 };

export function ElevationProfile({
  profile,
  color,
  onScrub,
}: {
  profile: Profile;
  color: string;
  onScrub: (position: LatLon | null) => void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(320);
  const [at, setAt] = useState<number | null>(null);

  useEffect(() => {
    const element = wrapper.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(160, Math.round(entry.contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Leaving the profile (or the track) clears the point from the map.
  useEffect(() => () => onScrub(null), [onScrub]);

  const geometry = useMemo(() => profileGeometry(profile, width, HEIGHT, PAD), [profile, width]);
  const sample = at === null ? null : sampleAt(profile, at);

  const move = (distance: number | null) => {
    setAt(distance);
    onScrub(distance === null ? null : sampleAt(profile, distance));
  };
  const fromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left - PAD.left) / Math.max(1, box.width - PAD.left - PAD.right);
    move(Math.max(0, Math.min(1, fraction)) * profile.totalMeters);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = profile.totalMeters / 50;
    const current = at ?? 0;
    const next =
      event.key === "ArrowRight"
        ? current + step
        : event.key === "ArrowLeft"
          ? current - step
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? profile.totalMeters
              : null;
    if (next === null) return;
    event.preventDefault();
    move(Math.max(0, Math.min(profile.totalMeters, next)));
  };

  const baseline = HEIGHT - PAD.bottom;
  return (
    <div ref={wrapper}>
      <p className="tabular flex min-h-5 items-baseline justify-between gap-3 text-small" aria-live="off">
        <span className="font-medium text-ink">Elevation</span>
        <span className="text-ink-muted">
          {sample
            ? `${formatDistance(sample.distance)} along, ${formatHeight(sample.elevation)}`
            : `Lowest ${formatHeight(profile.minElevation)}, highest ${formatHeight(profile.maxElevation)}`}
        </span>
      </p>
      {/* A range input cannot hold the drawing, so this is the slider pattern on a div. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label="Position along the route. Arrow keys move along the profile."
        aria-valuemin={0}
        aria-valuemax={Math.round(profile.totalMeters)}
        aria-valuenow={Math.round(sample?.distance ?? 0)}
        aria-valuetext={sample ? `${formatDistance(sample.distance)} along, ${formatHeight(sample.elevation)}` : "Not on the route"}
        onPointerMove={fromPointer}
        onPointerDown={fromPointer}
        onPointerLeave={(event) => event.pointerType === "mouse" && move(null)}
        onBlur={() => move(null)}
        onKeyDown={onKeyDown}
        className="mt-1 cursor-crosshair touch-pan-y rounded-control select-none"
      >
        <svg aria-hidden width={width} height={HEIGHT} viewBox={`0 0 ${width} ${HEIGHT}`} className="block">
          <line x1={PAD.left} x2={width - PAD.right} y1={PAD.top} y2={PAD.top} className="stroke-border" strokeDasharray="2 3" />
          <path d={geometry.area} fill={color} fillOpacity={0.16} />
          <path d={geometry.line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          <line x1={PAD.left} x2={width - PAD.right} y1={baseline} y2={baseline} className="stroke-border-strong" />
          <text
            x={PAD.left + 2}
            y={PAD.top + 12}
            className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
          >
            {formatHeight(profile.maxElevation)}
          </text>
          <text
            x={PAD.left + 2}
            y={baseline - 4}
            className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
          >
            {formatHeight(profile.minElevation)}
          </text>
          <text
            x={PAD.left}
            y={HEIGHT - 5}
            className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
          >
            0
          </text>
          <text
            x={width - PAD.right}
            y={HEIGHT - 5}
            textAnchor="end"
            className="tabular fill-ink-muted stroke-page text-[11px] [paint-order:stroke] [stroke-width:3px]"
          >
            {formatDistance(profile.totalMeters)}
          </text>
          {sample ? (
            <g>
              <line
                x1={geometry.x(sample.distance)}
                x2={geometry.x(sample.distance)}
                y1={PAD.top}
                y2={baseline}
                className="stroke-ink"
                strokeWidth={1}
              />
              <circle
                cx={geometry.x(sample.distance)}
                cy={geometry.y(sample.elevation)}
                r={4.5}
                className="fill-page stroke-ink"
                strokeWidth={2}
              />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}
