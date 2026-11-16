/**
 * A scenario as a small picture with no map under it: its rings to scale round ground
 * zero, in the hues and lines of the map, and the idealised fallout pattern if there is
 * one. Used where a scenario is shown as an illustration, beside an emergency plan. The
 * caveat is always shown with it.
 */
import { EFFECTS_CAVEAT, type EffectFamily, type EffectsResult, roundDistance } from "@outpost/shared";
import { useId } from "react";
import { cn } from "@/lib/utils";
import { destination, plumePolygon } from "./geometry";
import { DRAWN_FALLOUT_RATES, FAMILY_LINES, familyColour } from "./layers";
import { distanceText } from "./words";

const SIZE = 200;
const CENTRE = { lat: 0, lon: 0 };

/** Metres east and north of ground zero, for a point near the equator where degrees are nearly square. */
const local = ([lon, lat]: [number, number]) => {
  const east = destination(CENTRE, 90, 1).lon;
  const north = destination(CENTRE, 0, 1).lat;
  return [lon / east, lat / north] as const;
};

export function ScenarioPicture({ result, className }: { result: EffectsResult; className?: string }) {
  const id = useId();
  const rings = result.rings.filter((ring) => ring.metres !== null);
  const contours = result.fallout.drawn
    ? result.fallout.contours.filter((contour) => (DRAWN_FALLOUT_RATES as readonly number[]).includes(contour.rate))
    : [];
  const widest = Math.max(1, ...rings.map((ring) => ring.metres!));
  // The plume can run far beyond the rings: it is drawn to the 1,000 rads per hour contour at most, cut at the frame.
  const scale = (SIZE / 2 - 6) / widest;
  const point = (xy: readonly [number, number]) => `${(SIZE / 2 + xy[0] * scale).toFixed(1)},${(SIZE / 2 - xy[1] * scale).toFixed(1)}`;
  const plumes = result.fallout.drawn
    ? contours.map((contour) => plumePolygon(CENTRE, contour, result.fallout.drawn ? result.fallout.fromDegrees : 0, 48).map(local))
    : [];
  return (
    <figure className={cn("grid gap-2", className)}>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="img"
        aria-labelledby={`${id}-caption`}
        className="aspect-square w-full max-w-56 rounded-control border border-border bg-surface"
      >
        <title>The scenario's rings to scale</title>
        <defs>
          <clipPath id={`${id}-frame`}>
            <rect x="0" y="0" width={SIZE} height={SIZE} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${id}-frame)`}>
          {plumes.map((points, index) => (
            <polygon
              key={contours[index]!.rate}
              points={points.map(point).join(" ")}
              fill={familyColour("fallout")}
              fillOpacity={0.08 + index * 0.05}
              stroke={familyColour("fallout")}
              strokeOpacity={0.8}
              strokeWidth={0.8}
              strokeDasharray="3 1.5"
            />
          ))}
          {[...rings]
            .sort((a, b) => b.metres! - a.metres!)
            .map((ring) => {
              const line = FAMILY_LINES[ring.family as EffectFamily];
              return (
                <circle
                  key={ring.id}
                  cx={SIZE / 2}
                  cy={SIZE / 2}
                  r={ring.metres! * scale}
                  fill={familyColour(ring.family)}
                  fillOpacity={0.05}
                  stroke={familyColour(ring.family)}
                  strokeWidth={line.width * 0.75}
                  strokeDasharray={line.dash ? line.dash.map((part) => part * line.width).join(" ") : undefined}
                  strokeLinecap={ring.family === "radiation" ? "round" : "butt"}
                />
              );
            })}
          <circle cx={SIZE / 2} cy={SIZE / 2} r={2.5} fill="var(--ink)" />
        </g>
      </svg>
      <figcaption id={`${id}-caption`} className="max-w-[65ch] text-small text-ink-muted">
        The rings to scale round ground zero, the widest {distanceText(roundDistance(widest))} across its radius
        {result.fallout.drawn ? ", with the idealised fallout pattern cut at the frame" : ""}. {EFFECTS_CAVEAT}
      </figcaption>
    </figure>
  );
}
